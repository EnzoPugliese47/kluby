-- Zona amplia para filtrar boliches (CABA / GBA). city sigue siendo localidad/barrio visible.
CREATE TYPE "ClubZone" AS ENUM ('CABA', 'ZONA_NORTE', 'ZONA_SUR', 'ZONA_OESTE', 'ZONA_ESTE');

ALTER TABLE "Club" ADD COLUMN "zone" "ClubZone" NOT NULL DEFAULT 'CABA';

CREATE INDEX "Club_zone_idx" ON "Club"("zone");
