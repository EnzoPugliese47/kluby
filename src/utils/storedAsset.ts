import { prisma } from "../lib/prisma";

/** Guarda bytes de imagen en PostgreSQL y devuelve la URL publica de la API. */
export const saveStoredAsset = async (
  mime: string,
  buffer: Buffer,
  filenameHint: string
): Promise<string> => {
  const asset = await prisma.storedAsset.create({
    data: {
      mime,
      size: buffer.length,
      data: new Uint8Array(buffer),
      filename: filenameHint,
    },
  });
  return `/api/assets/${asset.id}`;
};
