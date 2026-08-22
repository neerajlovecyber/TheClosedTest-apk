const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns hours, minutes, seconds and total milliseconds remaining until next 12:00 AM IST.
 */
export const getTimeUntilMidnightIST = () => {
  const now = Date.now();
  const nowIST = now + IST_OFFSET_MS;
  const currentDayIST = Math.floor(nowIST / DAY_MS);
  const nextMidnightIST = (currentDayIST + 1) * DAY_MS;
  const timeRemaining = Math.max(0, nextMidnightIST - nowIST);

  const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
  const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);

  return { hours, minutes, seconds, totalMs: timeRemaining };
};

/**
 * Returns the epoch day integer in IST timezone.
 */
export const getISTDayNumber = (date: Date | string | number | null | undefined): number => {
  if (!date) return 0;
  const ms = typeof date === "string" ? new Date(date).getTime() : typeof date === "number" ? date : date.getTime();
  if (isNaN(ms)) return 0;
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
};

/**
 * Calculates the current testing day (1 to 14) for a match based on its startDate / createdAt in IST.
 * - Day 1 = start day.
 * - Day 2 = after 12:00 AM IST of start day.
 * - Day 3 = after next 12:00 AM IST, etc.
 * - Capped at 14.
 * - Ensures currentDay is at least any highest recorded proof day.
 */
export const getMatchCurrentDay = (startDate?: string | Date | null, createdAt?: string | Date | null, highestProofDay: number = 1): number => {
  const start = startDate || createdAt;
  if (!start) return Math.min(14, Math.max(1, highestProofDay));

  const startDayIST = getISTDayNumber(start);
  const todayDayIST = getISTDayNumber(Date.now());

  if (startDayIST === 0 || todayDayIST === 0) {
    return Math.min(14, Math.max(1, highestProofDay));
  }

  const elapsedDays = Math.max(0, todayDayIST - startDayIST);
  const calculatedDay = elapsedDays + 1;

  return Math.min(14, Math.max(calculatedDay, highestProofDay, 1));
};

/**
 * Checks if a given timestamp falls on today's calendar date in IST.
 */
export const isTodayIST = (date?: string | Date | null): boolean => {
  if (!date) return false;
  const dateDay = getISTDayNumber(date);
  const todayDay = getISTDayNumber(Date.now());
  return dateDay !== 0 && dateDay === todayDay;
};
