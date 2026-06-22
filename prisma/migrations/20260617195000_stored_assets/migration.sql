-- Imagenes en base de datos (logos, mapas) accesibles desde cualquier PC.
CREATE TABLE "StoredAsset" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "filename" TEXT,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredAsset_pkey" PRIMARY KEY ("id")
);
