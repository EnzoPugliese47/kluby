/** Lee dimensiones de PNG, JPEG o WebP sin dependencias externas. */
export const readImageDimensions = (
  buffer: Buffer,
  mime: string
): { width: number; height: number } | null => {
  if (mime === "image/png" && buffer.length >= 24) {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buffer.subarray(0, 8).equals(pngSig)) return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (
    (mime === "image/jpeg" || mime === "image/jpg") &&
    buffer.length > 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === undefined) return null;
      if (marker === 0xc0 || marker === 0xc2) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      if (marker === 0xd9) break;
      const len = buffer.readUInt16BE(offset + 2);
      offset += 2 + len;
    }
  }

  if (
    mime === "image/webp" &&
    buffer.length >= 30 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP" &&
    buffer.toString("ascii", 12, 16) === "VP8X"
  ) {
    const width =
      1 +
      buffer.readUIntLE(24, 1) +
      (buffer.readUIntLE(25, 1) << 8) +
      (buffer.readUIntLE(26, 1) << 16);
    const height =
      1 +
      buffer.readUIntLE(27, 1) +
      (buffer.readUIntLE(28, 1) << 8) +
      (buffer.readUIntLE(29, 1) << 16);
    return { width, height };
  }

  return null;
};

export const MAX_LOGO_SIZE = 500;
export const MAX_PROFILE_SIZE = 400;
export const MAX_FLYER_WIDTH = 1080;
export const MAX_FLYER_HEIGHT = 1440;

export const assertLogoDimensions = (
  buffer: Buffer,
  mime: string
): { width: number; height: number } => {
  const dims = readImageDimensions(buffer, mime);
  if (dims === null) {
    throw new Error("No se pudieron leer las dimensiones de la imagen");
  }
  if (dims.width > MAX_LOGO_SIZE || dims.height > MAX_LOGO_SIZE) {
    throw new Error(
      `El logo debe ser como maximo ${MAX_LOGO_SIZE}x${MAX_LOGO_SIZE}px (recibido: ${dims.width}x${dims.height})`
    );
  }
  return dims;
};

export const assertProfileDimensions = (
  buffer: Buffer,
  mime: string
): { width: number; height: number } => {
  const dims = readImageDimensions(buffer, mime);
  if (dims === null) {
    throw new Error("No se pudieron leer las dimensiones de la imagen");
  }
  if (dims.width > MAX_PROFILE_SIZE || dims.height > MAX_PROFILE_SIZE) {
    throw new Error(
      `La foto debe ser como maximo ${MAX_PROFILE_SIZE}x${MAX_PROFILE_SIZE}px (recibido: ${dims.width}x${dims.height})`
    );
  }
  return dims;
};

export const assertFlyerDimensions = (
  buffer: Buffer,
  mime: string
): { width: number; height: number } => {
  const dims = readImageDimensions(buffer, mime);
  if (dims === null) {
    throw new Error("No se pudieron leer las dimensiones de la imagen");
  }
  if (dims.width > MAX_FLYER_WIDTH || dims.height > MAX_FLYER_HEIGHT) {
    throw new Error(
      `El flyer debe ser como maximo ${MAX_FLYER_WIDTH}x${MAX_FLYER_HEIGHT}px (recibido: ${dims.width}x${dims.height})`
    );
  }
  return dims;
};
