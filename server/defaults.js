// Race constants, default athlete profile and fuelling reminder seeds.

export const RACE = {
  name: 'Ultra X Scotland 110K',
  date: '2027-05-01',
  startTime: '07:00',
  startIso: '2027-05-01T07:00:00+01:00', // British Summer Time
  distanceKm: 110,
  elevationM: 3500,
  targetHoursMin: 12,
  targetHoursMax: 14,
  timezone: 'Europe/London',
  format: 'Single stage',
};

export const DEFAULT_RUN_DAYS = [2, 3, 5, 0]; // Tue, Wed, Fri, Sun (0 = Sunday)
export const DEFAULT_STRENGTH_DAYS = [1, 4]; // Mon, Thu
export const DEFAULT_REST_DAY = 6; // Sat

export function defaultProfile(overrides = {}) {
  const base = {
    name: '',
    units: 'metric',
    ageYears: null,
    weightKg: null,
    heightCm: null,
    weeklyBaselineKm: 35,
    runDays: [...DEFAULT_RUN_DAYS],
    strengthDays: [...DEFAULT_STRENGTH_DAYS],
    restDay: DEFAULT_REST_DAY,
    strengthOrCycle: true,
    calorieTarget: 2600,
    proteinTarget: 140,
    carbsTarget: 340,
    waterTargetMl: 3000,
    targetFinishHours: 13,
    longRunDay: 0,
    notes: '',
  };
  const merged = { ...base, ...sanitiseProfile(overrides) };
  merged.runDays = normaliseDays(merged.runDays, DEFAULT_RUN_DAYS);
  merged.strengthDays = normaliseDays(merged.strengthDays, DEFAULT_STRENGTH_DAYS);
  merged.restDay = Number.isInteger(Number(merged.restDay)) ? Number(merged.restDay) : DEFAULT_REST_DAY;
  return merged;
}

export function normaliseDays(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const days = [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  return days.length ? days.sort((a, b) => a - b) : [...fallback];
}

function num(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Only accept known profile fields with sane bounds. */
export function sanitiseProfile(input = {}) {
  const out = {};
  const set = (key, value) => {
    if (value !== undefined) out[key] = value;
  };
  if (typeof input.name === 'string') out.name = input.name.trim().slice(0, 60);
  if (input.units === 'metric' || input.units === 'imperial') out.units = input.units;
  set('ageYears', input.ageYears === null || input.ageYears === '' ? null : num(input.ageYears, 14, 100, null));
  set('weightKg', input.weightKg === null || input.weightKg === '' ? null : num(input.weightKg, 35, 200, null));
  set('heightCm', input.heightCm === null || input.heightCm === '' ? null : num(input.heightCm, 120, 230, null));
  set('weeklyBaselineKm', input.weeklyBaselineKm === undefined ? undefined : num(input.weeklyBaselineKm, 10, 120, 35));
  set('calorieTarget', input.calorieTarget === undefined ? undefined : num(input.calorieTarget, 1200, 6000, 2600));
  set('proteinTarget', input.proteinTarget === undefined ? undefined : num(input.proteinTarget, 40, 300, 140));
  set('carbsTarget', input.carbsTarget === undefined ? undefined : num(input.carbsTarget, 80, 800, 340));
  set('waterTargetMl', input.waterTargetMl === undefined ? undefined : num(input.waterTargetMl, 500, 8000, 3000));
  set('targetFinishHours', input.targetFinishHours === undefined ? undefined : num(input.targetFinishHours, 8, 24, 13));
  set('restDay', input.restDay === undefined ? undefined : num(input.restDay, 0, 6, 6));
  if (input.runDays !== undefined) out.runDays = normaliseDays(input.runDays, DEFAULT_RUN_DAYS);
  if (input.strengthDays !== undefined) {
    out.strengthDays = normaliseDays(input.strengthDays, DEFAULT_STRENGTH_DAYS);
  }
  if (typeof input.strengthOrCycle === 'boolean') out.strengthOrCycle = input.strengthOrCycle;
  if (typeof input.notes === 'string') out.notes = input.notes.slice(0, 600);
  if (input.longRunDay !== undefined) out.longRunDay = num(input.longRunDay, 0, 6, 0);
  return out;
}

export function defaultReminders() {
  return [
    { label: 'Breakfast + 500ml water', time: '07:00', days: [2, 3, 5, 0], enabled: true, kind: 'meal' },
    { label: 'Pre-run snack (30g carbs)', time: '11:30', days: [2, 3, 5, 0], enabled: true, kind: 'fuelling' },
    { label: 'Post-run protein + carbs', time: '14:00', days: [2, 3, 5, 0], enabled: true, kind: 'recovery' },
    { label: 'Long-run gel + electrolytes', time: '09:00', days: [0], enabled: true, kind: 'fuelling' },
    { label: 'Strength session + protein', time: '18:00', days: [1, 4], enabled: true, kind: 'strength' },
    { label: 'Evening casein / yoghurt', time: '21:00', days: [1, 2, 3, 4, 5, 6, 0], enabled: false, kind: 'meal' },
  ];
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
