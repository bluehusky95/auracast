/**
 * Placeholders in text mode. `{countdown}` becomes the time left until a
 * target ("2h 15m"). The badge only plays a fixed clip, so the value is
 * frozen at send; text mode can resend on a timer to keep it current.
 */
export const COUNTDOWN = '{countdown}'

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now'
  const mins = Math.ceil(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m} min`
}

/** `target` is a datetime-local value ("2026-11-18T19:30"); empty or invalid shows "--". */
export function fillTokens(text: string, target: string, now = Date.now()): string {
  if (!text.includes(COUNTDOWN)) return text
  const t = target ? new Date(target).getTime() : NaN
  return text.replaceAll(COUNTDOWN, Number.isFinite(t) ? formatCountdown(t - now) : '--')
}
