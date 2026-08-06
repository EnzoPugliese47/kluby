import { ClubPlan, Prisma } from "../generated/prisma/client";
import { AppError } from "./appError";

/** Precio mensual del plan Premium (ARS). */
export const PREMIUM_MONTHLY_PRICE_ARS = 29_900;

export const PLAN_COMMISSION_PERCENT: Record<ClubPlan, number> = {
  [ClubPlan.BASIC]: 4,
  [ClubPlan.PREMIUM]: 2,
};

export const PLAN_LABELS: Record<ClubPlan, string> = {
  [ClubPlan.BASIC]: "Básico",
  [ClubPlan.PREMIUM]: "Premium",
};

export interface PlanCatalogEntry {
  id: ClubPlan;
  label: string;
  priceMonthly: number | null;
  commissionPercent: number;
  statsEnabled: boolean;
  features: string[];
}

export const CLUB_PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: ClubPlan.BASIC,
    label: "Básico",
    priceMonthly: 0,
    commissionPercent: PLAN_COMMISSION_PERCENT[ClubPlan.BASIC],
    statsEnabled: false,
    features: [
      "Mapa 2D de mesas VIP por evento",
      "Diseñador de planos y hasta 3 pisos",
      "Noche en vivo y check-in con QR",
      "Gestión de personal (publi y puerta)",
      "Comisión del 4% por cada mesa vendida",
    ],
  },
  {
    id: ClubPlan.PREMIUM,
    label: "Premium",
    priceMonthly: PREMIUM_MONTHLY_PRICE_ARS,
    commissionPercent: PLAN_COMMISSION_PERCENT[ClubPlan.PREMIUM],
    statsEnabled: true,
    features: [
      "Todo lo del plan Básico",
      "Panel de estadísticas y reportes BI",
      "Exportación PDF y CSV",
      "Comisión reducida al 2% por mesa vendida",
      "Prioridad de soporte",
    ],
  },
];

export const commissionPercentForPlan = (plan: ClubPlan): number =>
  PLAN_COMMISSION_PERCENT[plan];

export const clubHasStatsAccess = (plan: ClubPlan): boolean =>
  plan === ClubPlan.PREMIUM;

export const computeTableSaleCommission = (
  grossAmount: Prisma.Decimal,
  plan: ClubPlan
): {
  commissionPercent: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
  netToClub: Prisma.Decimal;
} => {
  const rate = new Prisma.Decimal(commissionPercentForPlan(plan));
  const commissionAmount = grossAmount.mul(rate).div(100).toDecimalPlaces(2);
  const netToClub = grossAmount.sub(commissionAmount).toDecimalPlaces(2);
  return { commissionPercent: rate, commissionAmount, netToClub };
};

export const assertClubHasStatsAccess = (plan: ClubPlan): void => {
  if (!clubHasStatsAccess(plan)) {
    throw new AppError(
      "El panel de estadísticas requiere el plan Premium. Actualizá tu plan desde el badge en la barra superior.",
      403
    );
  }
};

export const parseClubPlan = (raw: unknown): ClubPlan => {
  if (raw === ClubPlan.BASIC || raw === "BASIC") return ClubPlan.BASIC;
  if (raw === ClubPlan.PREMIUM || raw === "PREMIUM") return ClubPlan.PREMIUM;
  throw new AppError('Plan invalido. Use "BASIC" o "PREMIUM".', 400);
};

export interface BillingPeriod {
  periodFrom: Date;
  periodTo: Date;
  nextBillingDate: Date;
  monthKey: string;
  label: string;
}

/** Período de facturación calendario (cobro el día 1 del mes siguiente). */
export const getBillingPeriod = (referenceDate = new Date()): BillingPeriod => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const periodFrom = new Date(year, month, 1, 0, 0, 0, 0);
  const periodTo = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const nextBillingDate = new Date(year, month + 1, 1, 0, 0, 0, 0);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const label = periodFrom.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return { periodFrom, periodTo, nextBillingDate, monthKey, label };
};

export const parseBillingMonthKey = (raw: unknown): BillingPeriod | null => {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}$/.test(raw.trim())) {
    return null;
  }
  const [yearStr, monthStr] = raw.trim().split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month < 1 || month > 12) return null;
  const periodFrom = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodTo = new Date(year, month, 0, 23, 59, 59, 999);
  const nextBillingDate = new Date(year, month, 1, 0, 0, 0, 0);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const label = periodFrom.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  return { periodFrom, periodTo, nextBillingDate, monthKey, label };
};
