/**
 * IANA timezone helpers (no external dependency).
 *
 * Scheduling must honor each page's configured timezone (`page.schedule.timezone`),
 * not the server's local timezone. These helpers convert wall-clock times in a
 * given timezone to the correct UTC instant using `Intl.DateTimeFormat`.
 *
 * See: BACKLOG #129 (AUDIT2-H5) / GitHub issue #21.
 */

/** Wall-clock parts of an instant as observed in an IANA timezone. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Return `timeZone` if valid, otherwise 'UTC'. Invalid IANA names make
 * `Intl.DateTimeFormat` throw a RangeError; scheduling should degrade to UTC
 * rather than crash a cron run.
 */
export function safeTimeZone(timeZone: string | undefined | null): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** Decompose an instant into the wall-clock parts seen in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const tz = safeTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    map[part.type] = part.value;
  }
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    weekday: WEEKDAY_INDEX[map.weekday] ?? date.getUTCDay(),
  };
}

/** Milliseconds that `timeZone` is ahead of UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC Date.
 * Two passes account for the offset at the target instant (handles DST except
 * within the ~1h fold/gap around a transition, acceptable for post scheduling).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const tz = safeTimeZone(timeZone);
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = tzOffsetMs(new Date(guessMs), tz);
  const offset2 = tzOffsetMs(new Date(guessMs - offset1), tz);
  return new Date(guessMs - offset2);
}

/** Build a UTC instant for `hour`:`minute` wall-clock, `dayOffset` days after the tz-local day of `from`. */
function wallTimeOnOffsetDay(
  from: Date,
  dayOffset: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const p = getZonedParts(from, timeZone);
  // Normalize day arithmetic (month/year rollover) via Date.UTC.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
  return zonedWallTimeToUtc(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    hour,
    minute,
    timeZone
  );
}

/**
 * Next UTC instant matching `dayOfWeek` (0=Sun) at `hour`:`minute` wall-clock
 * in `timeZone`, strictly after `from`.
 */
export function getNextOccurrenceInTz(
  dayOfWeek: number,
  hour: number,
  minute: number,
  timeZone: string,
  from: Date = new Date()
): Date {
  const nowWeekday = getZonedParts(from, timeZone).weekday;
  let daysUntil = (dayOfWeek - nowWeekday + 7) % 7;
  let candidate = wallTimeOnOffsetDay(from, daysUntil, hour, minute, timeZone);
  if (candidate <= from) {
    daysUntil += 7;
    candidate = wallTimeOnOffsetDay(from, daysUntil, hour, minute, timeZone);
  }
  return candidate;
}

/**
 * Next UTC instant for `hour`:`minute` wall-clock in `timeZone`, today if still
 * in the future, otherwise tomorrow.
 */
export function getNextWallTimeInTz(
  hour: number,
  minute: number,
  timeZone: string,
  from: Date = new Date()
): Date {
  let candidate = wallTimeOnOffsetDay(from, 0, hour, minute, timeZone);
  if (candidate <= from) {
    candidate = wallTimeOnOffsetDay(from, 1, hour, minute, timeZone);
  }
  return candidate;
}
