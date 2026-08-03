import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import type { EventLayoutCopyResult } from "./eventLayout";

/** Copia plano, mesas y carta maestra del boliche a un evento recién creado. */
export async function applyClubDefaultsToEvent(
  clubId: string,
  targetEventId: string
): Promise<EventLayoutCopyResult> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      products: { where: { isActive: true, eventId: null } },
      tables: { where: { isActive: true, eventId: null } },
    },
  });
  if (club === null) {
    throw new AppError("Boliche no encontrado", 404);
  }

  const target = await prisma.eventNight.findUnique({
    where: { id: targetEventId },
  });
  if (target === null || target.clubId !== clubId) {
    throw new AppError("Evento destino no encontrado", 404);
  }

  let backgroundCopied = false;
  if (club.floorMapUrl && !target.backgroundImage) {
    await prisma.eventNight.update({
      where: { id: targetEventId },
      data: { backgroundImage: club.floorMapUrl },
    });
    backgroundCopied = true;
  }

  if (club.tables.length > 0) {
    await prisma.clubTable.createMany({
      data: club.tables.map((t) => ({
        clubId,
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
  }

  if (club.products.length > 0) {
    await prisma.product.createMany({
      data: club.products.map((p) => ({
        clubId,
        eventId: targetEventId,
        name: p.name,
        description: p.description,
        category: p.category,
        imageUrl: p.imageUrl,
        price: p.price,
        stock: p.stock,
        isActive: true,
      })),
    });
  }

  return {
    tablesCopied: club.tables.length,
    productsCopied: club.products.length,
    backgroundCopied,
  };
}
