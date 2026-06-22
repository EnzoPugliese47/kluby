const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomBlock = (length: number): string => {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
  }
  return out;
};

/** Codigo legible tipo KLUBY-A7X9-M2P4 */
export const generateInviteCode = (prefix: string): string => {
  const block = randomBlock(8);
  return `${prefix}-${block.slice(0, 4)}-${block.slice(4)}`;
};

export const normalizeInviteCode = (raw: string): string =>
  raw.trim().toUpperCase().replace(/\s+/g, "");
