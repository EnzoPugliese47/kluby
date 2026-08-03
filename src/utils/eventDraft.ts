import { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { minConsumptionFromPercent } from "../utils/tableConsumption";
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

export interface DraftProductInput {
  name: string;
  category?: string | null;
  price: number;
  stock?: number;
  description?: string | null;
}

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
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const capacity = Number(row.capacity);
    const price = Number(row.price);
    const posX = Number(row.posX);
    const posY = Number(row.posY);
    if (!label || !(capacity > 0) || !(price >= 0)) {
      throw new AppError(`draftTables[${index}]: label, capacity y price son obligatorios`, 400);
    }
    if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
      throw new AppError(`draftTables[${index}]: posX y posY son obligatorios`, 400);
    }
    const consumptionPercent = Number(row.consumptionPercent ?? 100);
    const depositPercent = Number(row.depositPercent ?? 10);
    if (consumptionPercent < 1 || consumptionPercent > 100) {
      throw new AppError(`draftTables[${index}]: consumptionPercent invalido`, 400);
    }
    if (depositPercent <= 0 || depositPercent > 100) {
      throw new AppError(`draftTables[${index}]: depositPercent invalido`, 400);
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
      throw new AppError(`draftProducts[${index}]: name y price son obligatorios`, 400);
    }
    const stockRaw = row.stock;
    const stock =
      stockRaw === undefined || stockRaw === null
        ? 0
        : Number(stockRaw);
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
  draft: { tables: DraftTableInput[]; products: DraftProductInput[] }
): Promise<EventLayoutCopyResult> {
  if (draft.tables.length > 0) {
    await prisma.clubTable.createMany({
      data: draft.tables.map((t) => ({
        clubId,
        eventId,
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
  }

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
    tablesCopied: draft.tables.length,
    productsCopied: draft.products.length,
    backgroundCopied: false,
  };
}
