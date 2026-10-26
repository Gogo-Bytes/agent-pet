const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pixels(width: number, height: number): number | null {
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 ? width * height : null;
}

function pngPixels(bytes: Buffer): number | null {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8, count = 0, result: number | null = null, hasData = false;
  while (offset + 12 <= bytes.length && ++count <= 4096) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + 12 + length > bytes.length) return null;
    if (count === 1) {
      if (type !== 'IHDR' || length !== 13) return null;
      result = pixels(bytes.readUInt32BE(offset + 8), bytes.readUInt32BE(offset + 12));
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (result === null || !depths[bytes[offset + 17]!]?.includes(bytes[offset + 16]!) ||
          bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20]! > 1) return null;
    } else if (type === 'IEND') {
      return length === 0 && hasData && offset + 12 === bytes.length ? result : null;
    } else if (type === 'IDAT') {
      hasData ||= length > 0;
    } else if (!['PLTE', 'tRNS', 'sRGB', 'gAMA', 'cHRM', 'pHYs'].includes(type)) {
      // Exclude animation and compressed metadata until their decode budgets are supported.
      return null;
    }
    offset += 12 + length;
  }
  return null;
}

function jpegPixels(bytes: Buffer): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2, markers = 0, scans = 0, inScan = false, result: number | null = null;
  while (offset < bytes.length && markers <= 4096) {
    if (bytes[offset++] !== 0xff) {
      if (!inScan) return null;
      continue;
    }
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++]!;
    if (inScan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    markers++;
    if (marker === 0xd9) return scans > 0 && offset === bytes.length ? result : null;
    if (marker === 0xd8 || marker === 0xdc || marker === 0 || marker === 1 ||
        (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    inScan = false;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (![0xc0, 0xc2].includes(marker) || result !== null || length < 8 || bytes[offset + 2] !== 8) return null;
      const components = bytes[offset + 7]!;
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) return null;
      result = pixels(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      if (result === null) return null;
      for (let component = 0; component < components; component++) {
        const sampling = bytes[offset + 9 + component * 3]!;
        if (!(sampling >> 4) || (sampling >> 4) > 4 || !(sampling & 15) || (sampling & 15) > 4) return null;
      }
    } else if (marker === 0xda) {
      if (result === null || length < 6 || ++scans > 64) return null;
      const components = bytes[offset + 2]!;
      if (components < 1 || components > 4 || length !== 6 + 2 * components) return null;
      inScan = true;
    }
    offset += length;
  }
  return null;
}

/** Bounded pre-decode dimensions, not an image decoder or a guarantee of pixel-stream validity. */
export function petImagePixels(bytes: Buffer, mime: unknown): number | null {
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) return null;
  try {
    if (mime === 'image/png') return pngPixels(bytes);
    if (mime === 'image/jpeg') return jpegPixels(bytes);
    return null;
  } catch { return null; }
}
