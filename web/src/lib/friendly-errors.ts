/**
 * Turn raw Bluetooth / protocol errors into a short title and what to do next.
 * The raw message still goes to the activity log.
 */
export interface Problem { title: string; tip: string }

const RULES: [RegExp, Problem][] = [
  [/cancell?ed|chooser/i, {
    title: 'No badge picked',
    tip: 'Press the side button to wake the badge, click Connect, then pick the name that starts with E87, E92, L8 or X9.',
  }],
  [/adapter not available|bluetooth is (turned )?off|no bluetooth adapter/i, {
    title: 'Bluetooth is off',
    tip: 'Turn on Bluetooth on this device, then click Connect again.',
  }],
  [/globally disabled|not allowed|SecurityError|permission|user gesture/i, {
    title: 'The browser blocked Bluetooth',
    tip: 'Click Connect yourself (it needs a click), and allow Bluetooth for this site in the browser settings. On iPhone or iPad, use the Bluefy browser.',
  }],
  [/auth/i, {
    title: "The badge isn't answering",
    tip: 'Turn the badge off and on: hold the side button for 5 seconds, wait a moment, then press it once. Then connect again.',
  }],
  [/rejected|storage full|gallery is full/i, {
    title: 'The badge is full',
    tip: 'Open My badge, delete a few files (or Erase all), then send again.',
  }],
  [/too large|exceeds/i, {
    title: 'The design is too big',
    tip: 'Use fewer frames or a lower frame rate. The badge takes files up to 900 KB.',
  }],
  [/GATT|disconnect|NetworkError|connection/i, {
    title: 'The badge dropped the connection',
    tip: "Keep the badge close and press its side button to wake it, then try again. Close the ZRun app on your phone if it's open: the badge only talks to one device at a time.",
  }],
  [/timeout|timed out/i, {
    title: 'The badge stopped answering',
    tip: 'Press the side button and try again. If it keeps happening, turn the badge off and on (hold the side button for 5 seconds).',
  }],
]

export function explainError(raw: string): Problem {
  return RULES.find(([re]) => re.test(raw))?.[1] ?? { title: 'Something went wrong', tip: raw }
}

/** A dropped link or a stall mid-transfer is worth one more try; a stuck login, a full badge or a cancel is not. */
export function isRetryable(raw: string): boolean {
  if (/auth|rejected|full|too large|exceeds|cancel/i.test(raw)) return false
  return /GATT|disconnect|NetworkError|connection|timeout|timed out/i.test(raw)
}
