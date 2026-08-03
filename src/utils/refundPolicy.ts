import { Prisma } from "../generated/prisma/client";

export interface RefundTier {
  minHours: number;
  percent: number;
  label: string;
}

/** Escala RN16 ampliada: más de 72h → 100%, 48–72h → 75%, 24–48h → 50%, &lt;24h → 0%. */
export const REFUND_TIERS: RefundTier[] = [
  { minHours: 72, percent: 100, label: "Más de 72 horas antes del evento" },
  { minHours: 48, percent: 75, label: "Entre 48 y 72 horas" },
  { minHours: 24, percent: 50, label: "Entre 24 y 48 horas" },
  { minHours: 0, percent: 0, label: "Menos de 24 horas" },
];

export const hoursUntilEvent = (
  eventDate: Date,
  now: Date = new Date()
): number => (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

export const computeRefundPercent = (
  eventDate: Date,
  now: Date = new Date()
): number => {
  const hours = hoursUntilEvent(eventDate, now);
  if (hours <= 0) return 0;
  if (hours > 72) return 100;
  if (hours > 48) return 75;
  if (hours >= 24) return 50;
  return 0;
};

export const computeRefundAmount = (
  amountPaid: Prisma.Decimal | number,
  eventDate: Date,
  now: Date = new Date()
): { refundPercent: number; refundAmount: Prisma.Decimal } => {
  const paid =
    amountPaid instanceof Prisma.Decimal
      ? amountPaid
      : new Prisma.Decimal(amountPaid);
  const refundPercent = computeRefundPercent(eventDate, now);
  const refundAmount = paid.mul(refundPercent).div(100);
  return { refundPercent, refundAmount };
};

export const refundPolicyPayload = (eventDate?: Date) => {
  const base = {
    tiers: REFUND_TIERS,
    notes: [
      "El reembolso aplica sobre lo pagado online (seña o total). El saldo en el boliche no se incluye.",
      "Si usaste Kluby Points, se te devuelven al cancelar; la plata sigue la escala de la tabla.",
      "Si no cancelás y no presentás el QR (no-show), no hay devolución.",
      "Si el boliche cancela el evento o tu mesa, reintegro del 100%.",
      "Con Mercado Pago activo, el reembolso se acredita en 5 a 10 días hábiles.",
    ],
  };
  if (eventDate === undefined) return base;
  const hours = hoursUntilEvent(eventDate);
  const refundPercent = computeRefundPercent(eventDate);
  return {
    ...base,
    preview: {
      hoursUntilEvent: Math.max(0, Math.round(hours * 10) / 10),
      refundPercent,
      tierLabel:
        REFUND_TIERS.find((t) => t.percent === refundPercent)?.label ?? "",
    },
  };
};
