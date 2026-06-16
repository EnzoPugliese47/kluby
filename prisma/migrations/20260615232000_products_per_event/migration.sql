-- Carta de botellas por evento (mismo patrón que mesas por evento).
ALTER TABLE "Product" ADD COLUMN "eventId" TEXT;

CREATE INDEX "Product_eventId_idx" ON "Product"("eventId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "EventNight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
