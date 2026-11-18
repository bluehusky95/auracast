// Run: node test/text-layout.test.ts
import assert from 'node:assert/strict'
import { layoutText, defaultTextLayout } from '../src/text-layout.ts'

const R = 170
const measure = (t: string, s: number) => t.length * s * 0.6 // fake monospace font
const L = (o = {}) => ({ ...defaultTextLayout(), ...o })

// Short word: one big line, centred, fits.
let r = layoutText('HI', L(), R, measure)
assert.equal(r.lines.length, 1)
assert.ok(r.fits && r.baseSize > 100, `big single line, got ${r.baseSize}`)
assert.ok(Math.abs(r.lines[0].y) < 1)

// Typed line breaks are kept, even when one line is short.
r = layoutText('NAME\nTitle here', L(), R, measure)
assert.deepEqual(r.lines.map((l) => l.text), ['NAME', 'Title here'])
assert.ok(r.fits)

// Per-line size: a smaller second line lets line 1 grow.
const big = layoutText('ALEX\nEngineer at Example', L({ lineScale: [100, 45] }), R, measure)
const same = layoutText('ALEX\nEngineer at Example', L(), R, measure)
assert.ok(big.lines[0].size > same.lines[0].size)
assert.ok(Math.abs(big.lines[1].size - big.baseSize * 0.45) < 1e-9)

// Every placed line stays inside the circle's chord.
for (const t of ['Hello there friend', 'A much longer message that has to wrap', 'X\nY\nZ\nW']) {
  for (const vAlign of ['top', 'middle', 'bottom'] as const) {
    const o = layoutText(t, L({ vAlign }), R, measure)
    assert.ok(o.fits, `${t} ${vAlign}`)
    for (const l of o.lines) {
      const d = Math.abs(l.y) + l.size * 0.55
      assert.ok(d < R && measure(l.text, l.size) <= 2 * Math.sqrt(R * R - d * d) + 1e-6, `${t} ${vAlign} ${l.text}`)
    }
  }
}

// Top / bottom move the block.
assert.ok(layoutText('HI', L({ vAlign: 'top' }), R, measure).lines[0].y < -20)
assert.ok(layoutText('HI', L({ vAlign: 'bottom' }), R, measure).lines[0].y > 20)

// Fixed size: too big is reported, small fits.
assert.equal(layoutText('HELLO WORLD', L({ autoSize: false, size: 200 }), R, measure).fits, false)
assert.equal(layoutText('HELLO', L({ autoSize: false, size: 40 }), R, measure).fits, true)

// Fixed size wraps long text onto several lines.
r = layoutText('one two three four five six', L({ autoSize: false, size: 40 }), R, measure)
assert.ok(r.lines.length > 1 && r.fits)

console.log('text-layout: ok')
