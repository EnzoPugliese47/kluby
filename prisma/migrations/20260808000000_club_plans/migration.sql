-- Planes comerciales B2B para boliches (Básico / Premium) y comisión por mesa vendida.

CREATE TYPE "ClubPlan" AS ENUM ('BASIC', 'PREMIUM');

ALTER TABLE "Club"
  ADD COLUMN "plan" "ClubPlan" NOT NULL DEFAULT 'BASIC',
  ADD COLUMN "planStartedAt" TIMESTAMP(3),
  ADD COLUMN "planExpiresAt" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD COLUMN "commissionPercent" DECIMAL(5,2),
  ADD COLUMN "commissionAmount" DECIMAL(12,2),
  ADD COLUMN "netToClub" DECIMAL(12,2);
