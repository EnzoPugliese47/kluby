import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { minConsumptionFromPercent } from "../utils/tableConsumption";
import {
  defaultFloorName,
  ensureEventFloors,
  syncEventBackgroundFromFloor1,
} from "./eventFloors";
import type { EventLayoutCopyResult } from "./eventLayout";

export interface DraftTableInput {
  label: string;
  sector?: string | null;
  capacity: number;
  price: number;
  consumptionPercent?: number;
  depositPercent?: number;
  posX: number;
  posY: number;
}

export interface DraftFloorInput {
  floorIndex: number;
  name?: string | null;
  backgroundImage?: string | null;
  tables: DraftTableInput[];
}

export interface DraftProductInput {
  name: string;
  category?: string | null;
  price: number;
  stock?: number;
  description?: string | null;
}

const parseDraftTableRow = (
  row: Record<string, unknown>,
  index: number
): DraftTableInput => {
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const capacity = Number(row.capacity);
  const price = Number(row.price);
  const posX = Number(row.posX);
  const posY = Number(row.posY);
  if (!label || !(capacity > 0) || !(price >= 0)) {
    throw new AppError(
      `draftTables[${index}]: label, capacity y price son obligatorios`,
      400
    );
  }
  if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
    throw new AppError(
      `draftTables[${index}]: posX y posY son obligatorios`,
      400
    );
  }
  const consumptionPercent = Number(row.consumptionPercent ?? 100);
  const depositPercent = Number(row.depositPercent ?? 10);
  if (consumptionPercent < 1 || consumptionPercent > 100) {
    throw new AppError(
      `draftTables[${index}]: consumptionPercent invalido`,
      400
    );
  }
  if (depositPercent <= 0 || depositPercent > 100) {
    throw new AppError(
      `draftTables[${index}]: depositPercent invalido`,
      400
    );
  }
  return {
    label,
    sector:
      typeof row.sector === "string" && row.sector.trim() !== ""
        ? row.sector.trim()
        : null,
    capacity: Math.round(capacity),
    price,
    consumptionPercent: Math.round(consumptionPercent),
    depositPercent: Math.round(depositPercent),
    posX,
    posY,
  };
};

export const parseDraftTables = (
  raw: unknown
): DraftTableInput[] | null => {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    throw new AppError("draftTables debe ser un array", 400);
  }
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(`draftTables[${index}] invalido`, 400);
    }
    return parseDraftTableRow(item as Record<string, unknown>, index);
  });
};

export const parseDraftFloors = (
  raw: unknown
): DraftFloorInput[] | null => {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    throw new AppError("draftFloors debe ser un array", 400);
  }
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(`draftFloors[${index}] invalido`, 400);
    }
    const row = item as Record<string, unknown>;
    const floorIndex = Number(row.floorIndex ?? index + 1);
    if (!Number.isInteger(floorIndex) || floorIndex < 1 || floorIndex > 3) {
      throw new AppError(
        `draftFloors[${index}]: floorIndex debe ser 1, 2 o 3`,
        400
      );
    }
    const tablesRaw = row.tables;
    const tables = Array.isArray(tablesRaw)
      ? tablesRaw.map((t, ti) => {
          if (typeof t !== "object" || t === null) {
            throw new AppError(
              `draftFloors[${index}].tables[${ti}] invalido`,
              400
            );
          }
          return parseDraftTableRow(t as Record<string, unknown>, ti);
        })
      : [];
    return {
      floorIndex,
      name:
        typeof row.name === "string" && row.name.trim() !== ""
          ? row.name.trim()
          : defaultFloorName(floorIndex),
      backgroundImage:
        row.backgroundImage === null
          ? null
          : typeof row.backgroundImage === "string"
            ? row.backgroundImage
            : null,
      tables,
    };
  });
};

export const parseDraftProducts = (
  raw: unknown
): DraftProductInput[] | null => {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    throw new AppError("draftProducts debe ser un array", 400);
  }
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new AppError(`draftProducts[${index}] invalido`, 400);
    }
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const price = Number(row.price);
    if (!name || !(price >= 0)) {
      throw new AppError(
        `draftProducts[${index}]: name y price son obligatorios`,
        400
      );
    }
    const stockRaw = row.stock;
    const stock =
      stockRaw === undefined || stockRaw === null ? 0 : Number(stockRaw);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new AppError(`draftProducts[${index}]: stock invalido`, 400);
    }
    return {
      name,
      category:
        typeof row.category === "string" && row.category.trim() !== ""
          ? row.category.trim()
          : null,
      price,
      stock,
      description:
        typeof row.description === "string" && row.description.trim() !== ""
          ? row.description.trim()
          : null,
    };
  });
};

/** Crea mesas y productos del borrador editado en el panel al crear evento. */
export async function applyDraftLayoutToEvent(
  clubId: string,
  eventId: string,
  draft: {
    floors?: DraftFloorInput[] | null;
    tables: DraftTableInput[];
    products: DraftProductInput[];
  }
): Promise<EventLayoutCopyResult> {
  let tablesCopied = 0;
  let backgroundCopied = false;

  const floorInputs =
    draft.floors && draft.floors.length > 0
      ? draft.floors
      : [
          {
            floorIndex: 1,
            name: defaultFloorName(1),
            backgroundImage: null as string | null,
            tables: draft.tables,
          },
        ];

  for (const floorInput of floorInputs) {
    let floor = await prisma.eventFloor.findFirst({
      where: { eventId, floorIndex: floorInput.floorIndex },
    });
    if (floor === null) {
      floor = await prisma.eventFloor.create({
        data: {
          eventId,
          floorIndex: floorInput.floorIndex,
          name: floorInput.name ?? defaultFloorName(floorInput.floorIndex),
          backgroundImage: floorInput.backgroundImage ?? null,
        },
      });
    } else if (floorInput.backgroundImage !== undefined) {
      floor = await prisma.eventFloor.update({
        where: { id: floor.id },
        data: { backgroundImage: floorInput.backgroundImage },
      });
    }

    if (floorInput.floorIndex === 1 && floorInput.backgroundImage) {
      backgroundCopied = true;
      await prisma.eventNight.update({
        where: { id: eventId },
        data: { backgroundImage: floorInput.backgroundImage },
      });
    }

    if (floorInput.tables.length > 0) {
      await prisma.clubTable.createMany({
        data: floorInput.tables.map((t) => ({
          clubId,
          eventId,
          floorId: floor.id,
          label: t.label,
          sector: t.sector ?? null,
          capacity: t.capacity,
          price: new Prisma.Decimal(t.price),
          consumptionPercent: t.consumptionPercent ?? 100,
          minConsumption: minConsumptionFromPercent(
            t.price,
            t.consumptionPercent ?? 100
          ),
          depositPercent: t.depositPercent ?? 10,
          posX: t.posX,
          posY: t.posY,
          isActive: true,
        })),
      });
      tablesCopied += floorInput.tables.length;
    }
  }

  await syncEventBackgroundFromFloor1(eventId);
  await ensureEventFloors(eventId);

  if (draft.products.length > 0) {
    await prisma.product.createMany({
      data: draft.products.map((p) => ({
        clubId,
        eventId,
        name: p.name,
        category: p.category ?? null,
        description: p.description ?? null,
        price: new Prisma.Decimal(p.price),
        stock: p.stock ?? 0,
        isActive: true,
      })),
    });
  }

  return {
    tablesCopied,
    productsCopied: draft.products.length,
    backgroundCopied,
    floorsCopied: floorInputs.length,
  };
}
