const WEEKDAY_ENUM = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY'
];

const getWeekdayEnum = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const idx = d.getDay();
  return WEEKDAY_ENUM[idx];
};

const isDateOnWeeklyOff = (date, weeklyOffDay) => {
  if (!weeklyOffDay) return false;
  return getWeekdayEnum(date) === weeklyOffDay;
};

module.exports = {
  getWeekdayEnum,
  isDateOnWeeklyOff
};
