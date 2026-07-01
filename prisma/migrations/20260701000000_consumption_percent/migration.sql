-- Porcentaje de consumicion sobre el precio de mesa (default 100%).
ALTER TABLE "ClubTable" ADD COLUMN "consumptionPercent" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "EventNight" ADD COLUMN "defaultConsumptionPercent" INTEGER NOT NULL DEFAULT 100;

-- Sincronizar minConsumption con el precio al 100% donde no estaba definido.
UPDATE "ClubTable"
SET "minConsumption" = ROUND("price" * "consumptionPercent" / 100.0, 2)
WHERE "minConsumption" IS NULL AND "price" > 0;
