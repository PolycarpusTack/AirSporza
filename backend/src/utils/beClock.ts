/**
 * Derive a UTC instant from an event's Belgian wall-clock fields
 * (`startDateBE` + `startTimeBE` "HH:MM"). Shared so the rights checker and the
 * listed-events FTA window use the IDENTICAL derivation (a code fact, not a comment).
 *
 * NOTE (existing simplification, unchanged): the BE clock is treated as UTC — the
 * date's day is taken and the time appended with a `Z`. Callers guard that both
 * fields are present before calling.
 */
export function beClockToUtc(dateBE: Date | string, timeBE: string): Date {
  const dayOnly = new Date(dateBE).toISOString().slice(0, 10) // YYYY-MM-DD
  return new Date(`${dayOnly}T${timeBE}:00Z`)
}
