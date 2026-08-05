import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";

export const MAX_EVENT_FLOORS = 3;

export const defaultFloorName = (floorIndex: number): string =>
  `Piso ${floorIndex}`;

/** Garantiza al menos piso 1 y asigna mesas sin piso al piso 1. */
export async function ensureEventFloors(eventId: string) {
  let floors = await prisma.eventFloor.findMany({
    where: { eventId },
    orderBy: { floorIndex: "asc" },
  });

  if (floors.length === 0) {
    const event = await prisma.eventNight.findUnique({ where: { id: eventId } });
    if (event === null) {
      throw new AppError("Evento no encontrado", 404);
    }
    const floor = await prisma.eventFloor.create({
      data: {
        eventId,
        floorIndex: 1,
        name: defaultFloorName(1),
        backgroundImage: event.backgroundImage,
      },
    });
    floors = [floor];
  }

  const floor1 = floors.find((f) => f.floorIndex === 1) ?? floors[0];
  if (floor1) {
    await prisma.clubTable.updateMany({
      where: { eventId, floorId: null, isActive: true },
      data: { floorId: floor1.id },
    });
  }

  return floors;
}

/** Mantiene backgroundImage del evento sincronizado con el piso 1 (compat). */
export async function syncEventBackgroundFromFloor1(eventId: string): Promise<void> {
  const floor1 = await prisma.eventFloor.findFirst({
    where: { eventId, floorIndex: 1 },
  });
  await prisma.eventNight.update({
    where: { id: eventId },
    data: { backgroundImage: floor1?.backgroundImage ?? null },
  });
}

export async function resolveEventFloorId(
  eventId: string,
  floorId?: string | null,
  floorIndex?: number | null
): Promise<string> {
  const floors = await ensureEventFloors(eventId);

  if (floorId) {
    const match = floors.find((f) => f.id === floorId);
    if (!match) {
      throw new AppError("El piso no pertenece a este evento", 400);
    }
    return match.id;
  }

  if (floorIndex !== undefined && floorIndex !== null) {
    const match = floors.find((f) => f.floorIndex === floorIndex);
    if (!match) {
      throw new AppError("Piso no encontrado", 404);
    }
    return match.id;
  }

  const first = floors[0];
  if (!first) {
    throw new AppError("El evento no tiene pisos configurados", 400);
  }
  return first.id;
}

export async function createEventFloorRecord(
  eventId: string,
  opts?: { name?: string; backgroundImage?: string | null }
) {
  const floors = await ensureEventFloors(eventId);
  if (floors.length >= MAX_EVENT_FLOORS) {
    throw new AppError(`Máximo ${MAX_EVENT_FLOORS} pisos por evento`, 400);
  }

  const nextIndex = Math.max(...floors.map((f) => f.floorIndex), 0) + 1;
  if (nextIndex > MAX_EVENT_FLOORS) {
    throw new AppError(`Máximo ${MAX_EVENT_FLOORS} pisos por evento`, 400);
  }

  const floor = await prisma.eventFloor.create({
    data: {
      eventId,
      floorIndex: nextIndex,
      name: opts?.name?.trim() || defaultFloorName(nextIndex),
      backgroundImage: opts?.backgroundImage ?? null,
    },
  });

  return floor;
}
