-- Revierte columna googleId (login con Google desactivado)
ALTER TABLE "User" DROP COLUMN IF EXISTS "googleId";
