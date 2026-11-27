// Date helpers. All training dates are plain 'YYYY-MM-DD' strings in the
// athlete's local timezone (Europe/London), so week boundaries never drift.

export const TZ = 'Europe/London';

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Europe/London as YYYY-MM-DD. */
export function todayISO() {
  return isoFormatter.format(new Date());
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseISO(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date) {
  return parseISO(date).getUTCDay();
}

export function mondayOf(date) {
  const dow = dayOfWeek(date);
  const shift = (dow + 6) % 7;
  return addDays(date, -shift);
}

export function diffDays(from, to) {
  return Math.round((parseISO(to) - parseISO(from)) / 86400000);
}

export function dayLabel(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(parseISO(date));
}

export function longDateLabel(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseISO(date));
}

export function monthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

export function addMonths(year, monthIndex, delta) {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** Days in month, plus the weekday index (Mon=0) of the 1st. */
export function monthGrid(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  return { daysInMonth, offset };
}
