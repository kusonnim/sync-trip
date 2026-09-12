import { getSupabase } from './supabase.js';
import {
  ensureMemberId, getHostToken, getMemberId, makeMemberId, makeRoomCode, normalizeRoomCode,
  randomHex, rememberHost, setMemberId,
} from './roomIdentity.js';

const REALTIME_TABLES = [
  'rooms', 'room_members', 'room_places', 'room_preferences',
  'room_routes', 'room_errors', 'room_final_votes',
];

function safeError(message, source) {
  const error = new Error(message);
  error.code = source?.code;
  return error;
}

export class SupabaseRoomAdapter {
  constructor(client = getSupabase()) { this.client = client; }

  async call(name, parameters, message) {
    const { data, error } = await this.client.rpc(name, parameters);
    if (error) throw safeError(message, error);
    return data;
  }

  async create(meta) {
    const hostId = makeMemberId();
    const token = randomHex(24);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRoomCode();
      try {
        const room = await this.call('create_room', {
          p_code: code, p_host_member_id: hostId, p_host_token: token,
          p_host_nickname: meta.hostNickname, p_title: meta.title,
          p_start_date: meta.startDate, p_end_date: meta.endDate,
          p_daily_start: meta.dailyStart, p_daily_end: meta.dailyEnd,
          p_headcount: meta.headcount, p_transport_mode: meta.transportMode,
          p_origin: meta.origin, p_destination: meta.destination,
        }, 'The room could not be created. Check the connection and try again.');
        rememberHost(code, token);
        setMemberId(code, hostId);
        return room;
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    throw new Error('Could not allocate a room code. Please try again.');
  }

  async read(code) {
    return this.call('get_room_snapshot', { p_room_code: normalizeRoomCode(code) }, 'Room synchronization is unavailable.');
  }

  subscribe(code, callback, onError) {
    const normalized = normalizeRoomCode(code);
    let active = true;
    let channel = null;
    let refreshTimer = null;
    let refreshRunning = false;
    let refreshQueued = false;
    const report = () => onError?.(new Error('Room synchronization is unavailable. Check your connection.'));
    const refresh = async () => {
      if (!active) return;
      if (refreshRunning) { refreshQueued = true; return; }
      refreshRunning = true;
      try {
        const room = await this.read(normalized);
        if (active) callback(room);
      } catch { if (active) report(); }
      finally {
        refreshRunning = false;
        if (refreshQueued) { refreshQueued = false; void refresh(); }
      }
    };
    const scheduleRefresh = () => {
      if (!active || refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; void refresh(); }, 20);
    };

    (async () => {
      try {
        const room = await this.read(normalized);
        if (!active) return;
        callback(room);
        if (!room) return;
        channel = this.client.channel(`room:${normalized}:${randomHex(6)}`);
        REALTIME_TABLES.forEach((table) => {
          channel.on('postgres_changes', {
            event: '*', schema: 'public', table,
            filter: `${table === 'rooms' ? 'id' : 'room_id'}=eq.${room.roomId}`,
          }, scheduleRefresh);
        });
        channel.subscribe((status) => {
          if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) report();
        });
      } catch { if (active) report(); }
    })();

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) void this.client.removeChannel(channel);
    };
  }

  async join(code, nickname) {
    const id = ensureMemberId(code);
    const joined = await this.call('join_room', {
      p_room_code: normalizeRoomCode(code), p_member_id: id, p_nickname: nickname,
    }, 'Could not join this room.');
    if (!joined) throw new Error('Room not found.');
    return id;
  }

  async patch(code, patch) {
    if (!('status' in patch)) throw new Error('Unsupported room update.');
    const changed = await this.call('update_room_state', {
      p_room_code: normalizeRoomCode(code), p_host_token: getHostToken(code) ?? '',
      p_status: patch.status, p_confirmed_route_type: patch.confirmedRouteId ?? null,
      p_reset_optimization: patch.optimizationState === 'idle',
    }, 'Could not update the room state.');
    if (!changed) throw new Error('Only the host can change the room state.');
  }

  async addPlace(code, place) {
    const stored = await this.call('upsert_room_place', {
      p_room_code: normalizeRoomCode(code), p_place_id: place.id,
      p_name: place.name, p_category: place.category, p_address: place.address ?? '',
      p_lat: place.lat, p_lng: place.lng, p_stay_time_min: place.minStay,
      p_stay_time_max: place.maxStay, p_open_time: place.openTime ?? null,
      p_close_time: place.closeTime ?? null, p_fixed_time: place.fixedTime ?? null,
      p_best_time: place.bestTime ?? null, p_required: place.isFixed ?? false,
      p_kakao_id: place.kakaoId ?? null, p_added_by: place.addedBy ?? getMemberId(code),
      p_hours_source: place.hoursSource ?? null,
    }, 'Could not add that place.');
    if (!stored) throw new Error('Room not found.');
  }

  async updatePlace(code, placeId, patch) {
    const updated = await this.call('patch_room_place', {
      p_room_code: normalizeRoomCode(code), p_host_token: getHostToken(code) ?? '',
      p_place_id: placeId, p_patch: patch,
    }, 'Could not update that place.');
    if (!updated) throw new Error('Place not found.');
  }

  async removePlace(code, placeId) {
    await this.call('remove_room_place', {
      p_room_code: normalizeRoomCode(code), p_host_token: getHostToken(code) ?? '', p_place_id: placeId,
    }, 'Could not remove that place.');
  }

  async submitRanking(code, id, ranking) {
    const submitted = await this.call('submit_room_ranking', {
      p_room_code: normalizeRoomCode(code), p_member_id: id, p_ranking: ranking,
    }, 'Could not synchronize your ranking.');
    if (!submitted) throw new Error('Member or room not found.');
  }

  async castVote(code, id, routeId) {
    const voted = await this.call('cast_room_vote', {
      p_room_code: normalizeRoomCode(code), p_member_id: id, p_route_type: routeId,
    }, 'Your vote could not be synchronized.');
    if (!voted) throw new Error('Member or room not found.');
  }

  async claimOptimization(code, id) {
    const nonce = crypto.randomUUID();
    const acquired = await this.call('acquire_optimization_lock', {
      p_room_code: normalizeRoomCode(code), p_member_id: id,
      p_host_token: getHostToken(code) ?? '', p_nonce: nonce,
    }, 'Could not acquire the optimization lock.');
    return acquired ? nonce : false;
  }

  async finishOptimization(code, result, nonce) {
    const common = {
      p_room_code: normalizeRoomCode(code), p_member_id: getMemberId(code),
      p_host_token: getHostToken(code) ?? '', p_nonce: nonce,
    };
    if (result.status === 'success') {
      await this.call('complete_optimization', { ...common, p_routes: result.routes }, 'This optimization run no longer owns the room lock.');
    } else {
      await this.call('fail_optimization', {
        ...common, p_code: result.code, p_message: result.message,
        p_place_ids: result.place_ids ?? result.placeIds ?? [],
      }, 'This optimization run no longer owns the room lock.');
    }
  }
}
