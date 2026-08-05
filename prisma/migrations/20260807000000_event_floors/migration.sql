-- Pisos por evento (hasta 3) con plano y mesas propias

CREATE TABLE "EventFloor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "floorIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Piso 1',
    "backgroundImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFloor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClubTable" ADD COLUMN "floorId" TEXT;

CREATE UNIQUE INDEX "EventFloor_eventId_floorIndex_key" ON "EventFloor"("eventId", "floorIndex");
CREATE INDEX "EventFloor_eventId_idx" ON "EventFloor"("eventId");
CREATE INDEX "ClubTable_floorId_idx" ON "ClubTable"("floorId");

ALTER TABLE "EventFloor" ADD CONSTRAINT "EventFloor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubTable" ADD CONSTRAINT "ClubTable_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "EventFloor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Piso 1 por evento existente + asignar mesas huérfanas
INSERT INTO "EventFloor" ("id", "eventId", "floorIndex", "name", "backgroundImage", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    e."id",
    1,
    'Piso 1',
    e."backgroundImage",
    NOW(),
    NOW()
FROM "EventNight" e;

UPDATE "ClubTable" t
SET "floorId" = f."id"
FROM "EventFloor" f
WHERE t."eventId" = f."eventId"
  AND f."floorIndex" = 1
  AND t."eventId" IS NOT NULL
  AND t."floorId" IS NULL;
