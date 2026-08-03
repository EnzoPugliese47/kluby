import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";

/** Copia plano (imagen) y mesas de un evento pasado a uno recién creado. */
export async function copyEventLayoutFrom(
  sourceEventId: string,
  targetEventId: string,
  targetClubId: string
): Promise<{ tablesCopied: number; backgroundCopied: boolean }> {
  const source = await prisma.eventNight.findUnique({
    where: { id: sourceEventId },
    include: { tables: { where: { isActive: true } } },
  });
  if (source === null || source.clubId !== targetClubId) {
    throw new AppError(
      "El evento origen no existe o no pertenece al mismo boliche",
      400
    );
  }

  const target = await prisma.eventNight.findUnique({
    where: { id: targetEventId },
  });
  if (target === null || target.clubId !== targetClubId) {
    throw new AppError("Evento destino no encontrado", 404);
  }

  let backgroundCopied = false;
  if (source.backgroundImage && !target.backgroundImage) {
    await prisma.eventNight.update({
      where: { id: targetEventId },
      data: { backgroundImage: source.backgroundImage },
    });
    backgroundCopied = true;
  }

  if (source.tables.length === 0) {
    return { tablesCopied: 0, backgroundCopied };
  }

  await prisma.clubTable.createMany({
    data: source.tables.map((t) => ({
      clubId: targetClubId,
      eventId: targetEventId,
      label: t.label,
      sector: t.sector,
      capacity: t.capacity,
      price: t.price,
      consumptionPercent: t.consumptionPercent,
      minConsumption: t.minConsumption,
      depositPercent: t.depositPercent,
      posX: t.posX,
      posY: t.posY,
      isActive: true,
    })),
  });

  return { tablesCopied: source.tables.length, backgroundCopied };
}
