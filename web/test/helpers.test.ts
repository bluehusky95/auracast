// Run: node test/helpers.test.ts
import assert from 'node:assert/strict'
import { explainError, isRetryable } from '../src/lib/friendly-errors.ts'
import { qrPayload, defaultQrForm } from '../src/lib/qr-payloads.ts'
import { fillTokens, formatCountdown } from '../src/lib/text-tokens.ts'
import { planSlideshow } from '../src/lib/badge-codec.ts'

// Error explanations: real messages seen from the badge and the browser.
assert.equal(explainError('Timeout waiting for auth device response [0x01, encrypted*16]. Recent notifications: raw(8):9ea7').title, "The badge isn't answering")
assert.equal(explainError('User cancelled the requestDevice() chooser.').title, 'No badge picked')
assert.equal(explainError('GATT Server is disconnected. Cannot perform GATT operations.').title, 'The badge dropped the connection')
assert.equal(explainError('Timeout waiting for rcsp ack cmd 0xc seq 4.').title, 'The badge stopped answering')
assert.equal(explainError('Bluetooth adapter not available.').title, 'Bluetooth is off')
assert.equal(explainError('weird').tip, 'weird')

// Retry only what a second try can fix.
assert.equal(isRetryable('GATT Server is disconnected.'), true)
assert.equal(isRetryable('Timeout waiting for window ack'), true)
assert.equal(isRetryable('Timeout waiting for auth device response'), false)
assert.equal(isRetryable('Badge rejected the upload (storage full)'), false)
assert.equal(isRetryable('Upload cancelled by user'), false)

// QR payloads.
const f = defaultQrForm()
assert.equal(qrPayload(f), 'https://example.com')
assert.equal(qrPayload({ ...f, kind: 'wifi', ssid: 'Cafe;Guest', password: 'p:ss' }), 'WIFI:T:WPA;S:Cafe\\;Guest;P:p\\:ss;;')
assert.equal(qrPayload({ ...f, kind: 'wifi', ssid: 'Open', security: 'nopass', password: 'ignored', hidden: true }), 'WIFI:T:nopass;S:Open;H:true;;')
assert.equal(qrPayload({ ...f, kind: 'wifi' }), '')
const card = qrPayload({ ...f, kind: 'contact', name: 'Alex de Vries', company: 'Acme, Inc.', email: 'a@b.co' }).split('\r\n')
assert.deepEqual(card, ['BEGIN:VCARD', 'VERSION:3.0', 'N:Vries;Alex de;;;', 'FN:Alex de Vries', 'ORG:Acme\\, Inc.', 'EMAIL:a@b.co', 'END:VCARD'])
assert.equal(qrPayload({ ...f, kind: 'contact' }), '')

// Countdown placeholder.
const now = new Date('2026-11-18T18:00').getTime()
assert.equal(fillTokens('Doors open in\n{countdown}', '2026-11-18T20:15', now), 'Doors open in\n2h 15m')
assert.equal(fillTokens('{countdown}', '2026-11-18T18:14', now), '14 min')
assert.equal(fillTokens('{countdown}', '2026-11-20T21:00', now), '2d 3h')
assert.equal(fillTokens('{countdown}', '2026-11-18T17:00', now), 'now')
assert.equal(fillTokens('{countdown}', '', now), '--')
assert.equal(fillTokens('no token', '', now), 'no token')
assert.equal(formatCountdown(30_000), '1 min') // rounds up so it never shows 0

// Slideshow plan: stills held, clips resampled to the fastest clip's rate.
let plan = planSlideshow([{ count: 1, fps: 1 }, { count: 1, fps: 1 }], 3)
assert.equal(plan.fps, 2)
assert.equal(plan.picks.length, 12)
assert.deepEqual(plan.picks[6], [1, 0])
plan = planSlideshow([{ count: 1, fps: 1 }, { count: 20, fps: 10 }, { count: 12, fps: 4 }], 2)
assert.equal(plan.fps, 10)
assert.equal(plan.picks.filter(([i]) => i === 0).length, 20) // 2 s still at 10 fps
assert.equal(plan.picks.filter(([i]) => i === 1).length, 20) // 2 s clip unchanged
assert.deepEqual(plan.picks.filter(([i]) => i === 2).map(([, k]) => k).slice(0, 6), [0, 0, 0, 1, 1, 2]) // 3 s clip slowed to 10 fps

console.log('helpers ok')
