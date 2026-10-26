import { expect, it } from 'vitest';
import { petImagePixels } from './pet-image-budget.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=', 'base64');
function jpeg(width: number, height: number, frame = 0xc0): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, frame, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
    1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0, 0xff, 0xd9]);
}
it('reads PNG and baseline/progressive JPEG dimensions without decoding pixels', () => {
  expect(petImagePixels(png, 'image/png')).toBe(1);
  expect(petImagePixels(jpeg(100, 200), 'image/jpeg')).toBe(20000);
  expect(petImagePixels(jpeg(100, 200, 0xc2), 'image/jpeg')).toBe(20000);
});
it.each([0, 4097, 65535])('rejects invalid or oversized JPEG dimensions %s', size => {
  expect(petImagePixels(jpeg(size, 1), 'image/jpeg')).toBeNull();
});
it('bounds PNG dimensions, encoded size and requires complete chunks', () => {
  const huge = Buffer.from(png); huge.writeUInt32BE(4097, 16);
  expect(petImagePixels(huge, 'image/png')).toBeNull();
  expect(petImagePixels(png.subarray(0, -1), 'image/png')).toBeNull();
  expect(petImagePixels(Buffer.alloc(4 * 1024 * 1024 + 1), 'image/png')).toBeNull();
});
it('rejects mismatched MIME, unsupported formats and animated PNG', () => {
  expect(petImagePixels(png, 'image/jpeg')).toBeNull();
  expect(petImagePixels(png, 'image/webp')).toBeNull();
  const animation = Buffer.alloc(20); animation.writeUInt32BE(8); animation.write('acTL', 4);
  expect(petImagePixels(Buffer.concat([png.subarray(0, 33), animation, png.subarray(33)]), 'image/png')).toBeNull();
});
it('rejects JPEG truncation, multiple frames and deferred height markers', () => {
  const bytes = jpeg(10, 10);
  expect(petImagePixels(bytes.subarray(0, -2), 'image/jpeg')).toBeNull();
  expect(petImagePixels(Buffer.concat([bytes.subarray(0, -2), bytes.subarray(2)]), 'image/jpeg')).toBeNull();
  expect(petImagePixels(Buffer.concat([bytes.subarray(0, -2), Buffer.from([255, 220, 0, 4, 0, 20, 255, 217])]), 'image/jpeg')).toBeNull();
});
