-- Kluby Points: descuento y puntos canjeados por reserva
ALTER TABLE "Reservation" ADD COLUMN "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Reservation" ADD COLUMN "loyaltyDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;
