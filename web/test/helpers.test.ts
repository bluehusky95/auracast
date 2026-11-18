// Run: node test/helpers.test.ts
import assert from 'node:assert/strict'
import { explainError, isRetryable } from '../src/lib/friendly-errors.ts'
import { qrPayload, defaultQrForm } from '../src/lib/qr-payloads.ts'

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

console.log('helpers ok')
