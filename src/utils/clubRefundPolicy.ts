import { Prisma } from "../generated/prisma/client";
import { AppError } from "./appError";
import { REFUND_TIERS, type RefundTier } from "./refundPolicy";

export interface StoredRefundPolicy {
  tiers: RefundTier[];
}

const TIER_SPECS = [
  { minHours: 72, label: "Más de 72 horas antes del evento" },
  { minHours: 48, label: "Entre 48 y 72 horas" },
  { minHours: 24, label: "Entre 24 y 48 horas" },
  { minHours: 0, label: "Menos de 24 horas" },
] as const;

export const buildRefundTiers = (
  p72: number,
  p48: number,
  p24: number,
  p0: number
): RefundTier[] => [
  { minHours: 72, percent: p72, label: TIER_SPECS[0].label },
  { minHours: 48, percent: p48, label: TIER_SPECS[1].label },
  { minHours: 24, percent: p24, label: TIER_SPECS[2].label },
  { minHours: 0, percent: p0, label: TIER_SPECS[3].label },
];

export const parseClubRefundTiers = (club: {
  useDefaultRefundPolicy?: boolean | null;
  refundPolicy?: Prisma.JsonValue | null;
}): RefundTier[] => {
  if (club.useDefaultRefundPolicy !== false) return REFUND_TIERS;
  if (club.refundPolicy === null || club.refundPolicy === undefined) {
    return REFUND_TIERS;
  }
  const raw = club.refundPolicy as unknown as StoredRefundPolicy;
  if (!Array.isArray(raw.tiers) || raw.tiers.length !== 4) {
    return REFUND_TIERS;
  }
  const tiers = raw.tiers.map((t, i) => ({
    minHours: TIER_SPECS[i]?.minHours ?? t.minHours,
    percent: Math.round(Number(t.percent) || 0),
    label: TIER_SPECS[i]?.label ?? t.label,
  }));
  return tiers;
};

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Math.round(value)));

export const parseRefundPolicyBody = (
  body: Record<string, unknown>
): {
  useDefaultRefundPolicy: boolean;
  refundPolicy: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  noShowGraceHours: number | undefined;
} => {
  const result: {
    useDefaultRefundPolicy: boolean;
    refundPolicy: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
    noShowGraceHours: number | undefined;
  } = {
    useDefaultRefundPolicy: true,
    refundPolicy: undefined,
    noShowGraceHours: undefined,
  };

  if (body["useDefaultRefundPolicy"] !== undefined) {
    result.useDefaultRefundPolicy = body["useDefaultRefundPolicy"] !== false;
    if (result.useDefaultRefundPolicy) {
      result.refundPolicy = Prisma.DbNull;
    }
  }

  if (body["noShowGraceHours"] !== undefined) {
    const hours = Number(body["noShowGraceHours"]);
    if (!Number.isFinite(hours) || hours < 1 || hours > 48) {
      throw new AppError(
        "Las horas de gracia para no-show deben estar entre 1 y 48",
        400
      );
    }
    result.noShowGraceHours = Math.round(hours);
  }

  if (
    !result.useDefaultRefundPolicy &&
    (body["refundPolicy"] !== undefined || body["refundPercents"] !== undefined)
  ) {
    const percentsRaw = body["refundPercents"];
    let p72: number;
    let p48: number;
    let p24: number;
    let p0: number;

    if (percentsRaw !== undefined && typeof percentsRaw === "object" && percentsRaw !== null) {
      const p = percentsRaw as Record<string, unknown>;
      p72 = clampPercent(Number(p["h72"]));
      p48 = clampPercent(Number(p["h48"]));
      p24 = clampPercent(Number(p["h24"]));
      p0 = clampPercent(Number(p["h0"]));
    } else if (body["refundPolicy"] !== undefined) {
      const stored = body["refundPolicy"] as StoredRefundPolicy;
      if (!Array.isArray(stored?.tiers) || stored.tiers.length !== 4) {
        throw new AppError("Política de reembolso inválida", 400);
      }
      p72 = clampPercent(Number(stored.tiers[0]?.percent));
      p48 = clampPercent(Number(stored.tiers[1]?.percent));
      p24 = clampPercent(Number(stored.tiers[2]?.percent));
      p0 = clampPercent(Number(stored.tiers[3]?.percent));
    } else {
      throw new AppError("Enviá refundPercents o refundPolicy", 400);
    }

    if (p72 < p48 || p48 < p24 || p24 < p0) {
      throw new AppError(
        "Los porcentajes deben ser decrecientes (más antelación = más devolución)",
        400
      );
    }

    result.refundPolicy = {
      tiers: buildRefundTiers(p72, p48, p24, p0),
    } as unknown as Prisma.InputJsonValue;
  }

  return result;
};

export const refundPercentsFromClub = (club: {
  useDefaultRefundPolicy?: boolean | null;
  refundPolicy?: Prisma.JsonValue | null;
}): { h72: number; h48: number; h24: number; h0: number } => {
  const tiers = parseClubRefundTiers(club);
  return {
    h72: tiers[0]?.percent ?? 100,
    h48: tiers[1]?.percent ?? 75,
    h24: tiers[2]?.percent ?? 50,
    h0: tiers[3]?.percent ?? 0,
  };
};
