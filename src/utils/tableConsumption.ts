import { Prisma } from "../generated/prisma/client";

/** Valida y normaliza el % de consumicion (1–100). */
export const normalizeConsumptionPercent = (value: number): number => {
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error("CONSUMPTION_PERCENT_INVALID");
  }
  return Math.round(value);
};

/** Monto de consumicion acreditado segun precio de mesa y porcentaje. */
export const minConsumptionFromPercent = (
  price: number | Prisma.Decimal,
  consumptionPercent: number
): Prisma.Decimal => {
  const amount = Number(price) * consumptionPercent / 100;
  return new Prisma.Decimal(Math.round(amount));
};
