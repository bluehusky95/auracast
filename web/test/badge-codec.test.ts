// node test/badge-codec.test.ts  (Node 24 strips the types)
import assert from 'node:assert/strict'
import { fileBrowseParam, parseFileStructs, firstJpeg, qixTimeFrame, jpegFrames } from '../src/lib/badge-codec.ts'

// Browse root of handle 2: [type 0][20][start 0001][00000002][pathLen 0004][00000000]
assert.deepEqual([...fileBrowseParam(0, 20, 1, 2, [0])], [0, 20, 0, 1, 0, 0, 0, 2, 0, 4, 0, 0, 0, 0])

// One unicode file + one GBK folder
const name = [...'A.AVI'].flatMap((c) => [c.charCodeAt(0), 0])
const stream = Uint8Array.from([
  0x01, 0, 0, 0x01, 0x23, 0, 1, name.length, ...name,
  0x02, 0, 0, 0, 5, 0, 2, 4, ...[...'DCIM'].map((c) => c.charCodeAt(0)),
])
assert.deepEqual(parseFileStructs(stream), [
  { name: 'A.AVI', isFile: true, unicode: true, cluster: 0x123 },
  { name: 'DCIM', isFile: false, unicode: false, cluster: 5 },
])

// JPEG inside AVI noise
assert.deepEqual([...firstJpeg(Uint8Array.from([1, 2, 0xff, 0xd8, 0xff, 9, 0xff, 0xd9, 7]))!], [0xff, 0xd8, 0xff, 9, 0xff, 0xd9])
assert.equal(firstJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 1])), null)

// 2026-11-17 09:05 -> year LE, month, day, 0, hour, minute
assert.deepEqual([...qixTimeFrame(new Date(2026, 10, 17, 9, 5)).slice(6)], [0xea, 0x07, 11, 17, 0, 9, 5])

// Two JPEGs inside AVI chunk noise
const avi = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0xff, 0xd8, 0xff, 1, 0xff, 0xd9, 0, 0, 0xff, 0xd8, 0xff, 2, 0xff, 0xd9])
assert.deepEqual(jpegFrames(avi).map((f) => f[3]), [1, 2])

console.log('badge-codec ok')
