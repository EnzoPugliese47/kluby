-- AlterTable
ALTER TABLE "ClubTable" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "ClubTable_eventId_idx" ON "ClubTable"("eventId");

-- AddForeignKey
ALTER TABLE "ClubTable" ADD CONSTRAINT "ClubTable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
