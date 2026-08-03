-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'NO_SHOW';

-- AlterTable Club
ALTER TABLE "Club" ADD COLUMN "useDefaultRefundPolicy" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Club" ADD COLUMN "refundPolicy" JSONB;
ALTER TABLE "Club" ADD COLUMN "noShowGraceHours" INTEGER NOT NULL DEFAULT 6;

-- AlterTable Reservation
ALTER TABLE "Reservation" ADD COLUMN "noShowAt" TIMESTAMP(3);
