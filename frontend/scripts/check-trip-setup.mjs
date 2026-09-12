import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRoomMeta, getSetupStepReadiness, TRIP_SETUP_STEPS } from '../src/lib/tripSetupFlow.js';

const origin = { name: 'Seoul Station', lat: 37.5547, lng: 126.9707 };
const destination = { name: 'Busan Station', lat: 35.1151, lng: 129.0414 };
const hotelA = { name: 'Hotel A', lat: 35.1, lng: 129.0 };
const hotelB = { name: 'Hotel B', lat: 35.2, lng: 129.1 };
const form = {
  hostNickname: '민서', title: '부산 여행',
  startDate: '2026-10-01', endDate: '2026-10-03',
  dailyStart: '10:00', dailyEnd: '21:00',
  headcount: 5, transportMode: 'car',
};

assert.deepEqual(TRIP_SETUP_STEPS, [
  ['hostNickname', 'title'],
  ['startDate', 'endDate'],
  ['dailyStart', 'dailyEnd'],
  ['headcount', 'transportMode'],
  ['origin', 'destination'],
  ['accommodations'],
]);
assert.deepEqual(getSetupStepReadiness({ form, origin, destination, staysReady: true }),
  [true, true, true, true, true, true]);

const invalidCases = [
  { form: { ...form, title: ' ' }, origin, destination, staysReady: true },
  { form: { ...form, endDate: '2026-09-30' }, origin, destination, staysReady: true },
  { form: { ...form, startDate: '2026-10-01', endDate: '2026-10-01', dailyEnd: '09:00' },
    origin, destination, staysReady: true },
  { form: { ...form, headcount: 13 }, origin, destination, staysReady: true },
  { form, origin: null, destination, staysReady: true },
  { form, origin, destination, staysReady: false },
];
invalidCases.forEach((input, index) => {
  assert.equal(getSetupStepReadiness(input)[index], false, `step ${index + 1} rejects invalid data`);
});
assert.equal(getSetupStepReadiness({
  form: { ...form, dailyStart: '10:00', dailyEnd: '09:00' },
  origin, destination, staysReady: true,
})[2], true, 'multi-day arrival and return times are not compared as one day');

const multiDay = buildRoomMeta({ form, origin, destination, nights: 2,
  filledStays: [hotelA, hotelB] });
assert.equal(multiDay.headcount, 5);
assert.equal(multiDay.transportMode, 'car');
assert.equal(multiDay.origin, origin);
assert.equal(multiDay.destination, destination);
assert.deepEqual(multiDay.accommodations, [hotelA, hotelB]);

const dayTrip = buildRoomMeta({ form: { ...form, endDate: form.startDate }, origin, destination,
  nights: 0, filledStays: [hotelA] });
assert.deepEqual(dayTrip.accommodations, []);

const component = await readFile(new URL('../src/screens/TripSetup.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
assert.match(component, /if \(step < TRIP_SETUP_STEPS\.length\).*setStep/);
assert.match(component, /else submit\(\)/);
assert.equal((component.match(/await createRoom\(/g) ?? []).length, 1);
assert.match(component, /navigate\(`\/r\/\$\{room\.code\}`\)/);
assert.match(component, /role="progressbar"/);
assert.match(component, /aria-valuenow=\{step\}/);
assert.match(styles, /\.participant-field\s*\{[^}]*align-items:\s*center/);
assert.match(styles, /\.participant-picker\s*\{[^}]*margin-inline:\s*auto/);
assert.match(styles, /\.participant-picker \.wheel\s*\{[^}]*border:\s*0/);

console.log('All six-step TripSetup flow, validation, payload, and Step 4 layout checks passed');
