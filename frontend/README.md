# SyncTrip 프론트엔드

React + Vite. 백엔드 없이도 혼자 끝까지 돌아간다.

```bash
npm install
npm run dev     # 개발 서버
npm run check   # 제약 검증 14가지
npm run build   # 배포 빌드
```

## 화면

`src/screens/Room.jsx` 가 방의 `status` 를 구독해서 알맞은 화면을 띄운다.
대표자가 단계를 넘기면 모두의 화면이 같이 바뀐다.

| status | 화면 | 흐름도 단계 |
|---|---|---|
| — | `Landing` | 1 |
| — | `TripSetup` | 2 |
| `setup` | `RoomLobby` (처음 들어온 사람은 `JoinRoom`) | 3, 4 |
| `collecting` | `PlacePicker` | 5 |
| `analyzing` | `Analyzing` | 6 |
| `voting` | `Result` (실패하면 충돌 안내) | 7, 8, 9 |
| `confirmed` | `Result` 확정 화면 | 10 |

## 백엔드로 갈아끼우는 지점 두 곳

지금은 둘 다 임시 구현이라 프론트가 혼자 돈다. 백엔드가 준비되면 여기만 바꾼다.

**1. 방 상태 저장소 — `src/lib/roomStore.js`**

localStorage 에 저장하고 같은 브라우저의 다른 탭끼리 동기화한다.
Firestore 로 옮길 때는 이 파일의 함수 본문만 교체하면 화면 코드는 손대지 않아도 된다.

| 지금 | Firestore |
|---|---|
| `readRoom` | `getDoc(doc(db, 'rooms', code))` |
| `subscribe` | `onSnapshot(doc(db, 'rooms', code))` |
| `patchRoom` | `updateDoc(...)` |

**2. 백엔드 호출 — `src/lib/api.js`**

`.env` 에 `VITE_API_BASE` 를 넣으면 `USE_MOCK` 이 자동으로 꺼지고 실제 백엔드를 부른다.

| 함수 | 백엔드 엔드포인트 | 임시 구현 |
|---|---|---|
| `searchPlaces` | `GET /api/search?keyword=` | `mockPlaces.js` 의 서울 16곳 |
| `fetchPlaceHours` | `GET /api/place/details?name=` | null 을 돌려줘 카테고리 기본값이 그대로 남는다 |
| `optimize` | `POST /api/optimize` | `mockOptimize.js` |

`fetchPlaceHours` 는 장소를 담는 순간 불린다. 카테고리 기본값으로 먼저 담아두고
실제 영업시간이 오면 덮어쓰므로, 조회에 실패해도 일정 생성은 그대로 진행된다.

## 임시 최적화 엔진

`src/lib/mockOptimize.js` 는 PROJECT.md 5절 Track 1 과 같은 규칙을 쓴다.
순열을 전부 돌려 제약을 어기는 것을 버리고, 가중치 두 벌로 최소 시간과 최소 비용 2안을 고른다.
실제 길찾기 API 는 부르지 않고 직선거리 기반 추정치를 쓴다.

요청과 응답 모양은 PROJECT.md 4절 ③ 규약과 똑같다. 그래서 백엔드가 붙어도 화면 코드는 그대로다.
camelCase 인 화면 상태를 snake_case 규약으로 바꾸는 일은 `api.js` 의 `buildOptimizeBody` 한 곳에서만 한다.

지키는 제약은 세 가지다.

- 예약 시각보다 늦게 도착하는 순서는 버린다
- 영업 종료 전에 최소 체류를 못 채우면 버린다
- 마지막 도착지 도착이 해산 시각을 넘으면 버린다

해가 없으면 실패를 알리는 대신 `TIME_CONFLICT` 와 함께 어느 두 장소의 예약이 부딪히는지 짚는다.
`findConflicts` 가 예약이 있는 쌍만 검사하므로 순열 탐색보다 훨씬 싸다.

## 아직 없는 것

- 지도. 타임라인은 글자로만 보여준다
- 결과 이미지 저장. 지금은 링크 공유만 된다
- Firestore. 다른 기기끼리는 방이 공유되지 않는다
- 실제 길찾기. 이동 시간과 요금은 직선거리 기반 추정치다
- 베스트 타임 가산점. 예약과 영업시간 같은 Hard Constraint 만 지킨다

## 키 관리

이 앱에는 카카오, ODsay, 구글 키를 넣지 않는다. 전부 백엔드 환경변수에 둔다.
`VITE_` 로 시작하는 값은 빌드 결과물에 그대로 박히기 때문이다.

## 혼자 전체 흐름 보기

방 코드는 이 브라우저의 localStorage 에 저장된다.
같은 브라우저에서 탭을 두 개 열고 한쪽은 대표자, 한쪽은 팀원으로 들어가면 실시간 동기화까지 확인할 수 있다.
초기화가 필요하면 콘솔에서 `localStorage.clear()` 를 실행한다.
