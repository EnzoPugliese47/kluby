-- Tarjeta de contacto del boliche (email obligatorio, telefono opcional).
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT NOT NULL DEFAULT 'contacto@kluby.com';
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
