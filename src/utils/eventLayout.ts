import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { defaultFloorName, syncEventBackgroundFromFloor1 } from "./eventFloors";

export interface EventLayoutCopyResult {
  tablesCopied: number;
  productsCopied: number;
  backgroundCopied: boolean;
  floorsCopied?: number;
}

/** Copia plano, mesas y carta de un evento pasado a uno recién creado (no nombre ni fecha). */
export async function copyEventLayoutFrom(
  sourceEventId: string,
  targetEventId: string,
  targetClubId: string
): Promise<EventLayoutCopyResult> {
  const source = await prisma.eventNight.findUnique({
    where: { id: sourceEventId },
    include: {
      floors: { orderBy: { floorIndex: "asc" } },
      tables: { where: { isActive: true } },
      products: { where: { isActive: true } },
    },
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
  const floorIdMap = new Map<string, string>();

  const sourceFloors =
    source.floors.length > 0
      ? source.floors
      : [
          {
            id: "__legacy__",
            eventId: sourceEventId,
            floorIndex: 1,
            name: defaultFloorName(1),
            backgroundImage: source.backgroundImage,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

  for (const sf of sourceFloors) {
    const newFloor = await prisma.eventFloor.create({
      data: {
        eventId: targetEventId,
        floorIndex: sf.floorIndex,
        name: sf.name,
        backgroundImage: sf.backgroundImage,
      },
    });
    floorIdMap.set(sf.id, newFloor.id);
    if (sf.floorIndex === 1 && sf.backgroundImage) {
      backgroundCopied = true;
    }
  }

  if (backgroundCopied) {
    const floor1Bg = sourceFloors.find((f) => f.floorIndex === 1)?.backgroundImage;
    if (floor1Bg) {
      await prisma.eventNight.update({
        where: { id: targetEventId },
        data: { backgroundImage: floor1Bg },
      });
    }
  }

  const targetFloor1 = await prisma.eventFloor.findFirst({
    where: { eventId: targetEventId, floorIndex: 1 },
  });

  if (source.tables.length > 0) {
    await prisma.clubTable.createMany({
      data: source.tables.map((t) => ({
        clubId: targetClubId,
        eventId: targetEventId,
        floorId:
          (t.floorId && floorIdMap.get(t.floorId)) ||
          targetFloor1?.id ||
          null,
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

  if (source.products.length > 0) {
    await prisma.product.createMany({
      data: source.products.map((p) => ({
        clubId: targetClubId,
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

  await syncEventBackgroundFromFloor1(targetEventId);

  return {
    tablesCopied: source.tables.length,
    productsCopied: source.products.length,
    backgroundCopied,
    floorsCopied: sourceFloors.length,
  };
}
