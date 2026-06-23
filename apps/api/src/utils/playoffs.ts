export function nextHolidayTarget(after: Date): Date {
  const y = after.getFullYear();
  const candidates = [
    new Date(Date.UTC(y, 0, 1)), // Jan 1 this year
    new Date(Date.UTC(y, 6, 4)), // Jul 4 this year
    new Date(Date.UTC(y + 1, 0, 1)), // Jan 1 next year
    new Date(Date.UTC(y + 1, 6, 4)), // Jul 4 next year
  ].filter((d) => d > after);
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}
