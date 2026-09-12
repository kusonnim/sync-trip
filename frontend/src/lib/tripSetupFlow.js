const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const TRIP_SETUP_STEPS = [
  ['hostNickname', 'title'],
  ['startDate', 'endDate'],
  ['dailyStart', 'dailyEnd'],
  ['headcount', 'transportMode'],
  ['origin', 'destination'],
  ['accommodations'],
];

export function getSetupStepReadiness({ form, origin, destination, staysReady }) {
  const headcount = Number(form.headcount);
  const multiDay = form.endDate > form.startDate;
  return [
    Boolean(form.hostNickname.trim() && form.title.trim()),
    Boolean(DATE_PATTERN.test(form.startDate) && DATE_PATTERN.test(form.endDate)
      && form.endDate >= form.startDate),
    Boolean(TIME_PATTERN.test(form.dailyStart) && TIME_PATTERN.test(form.dailyEnd)
      && (multiDay || form.dailyEnd >= form.dailyStart)),
    Number.isInteger(headcount) && headcount >= 1 && headcount <= 12
      && ['transit', 'car'].includes(form.transportMode),
    Boolean(origin && destination),
    staysReady,
  ];
}

export function buildRoomMeta({ form, origin, destination, nights, filledStays }) {
  return {
    ...form,
    headcount: Number(form.headcount),
    origin,
    destination,
    accommodations: nights === 0 ? [] : filledStays,
  };
}
