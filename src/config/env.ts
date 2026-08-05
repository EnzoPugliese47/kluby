import "dotenv/config";

/**
 * Configuracion centralizada y validada de variables de entorno.
 * Si falta una variable critica, la app falla al arrancar (fail-fast).
 */

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Variable de entorno requerida no definida: ${name}`);
  }
  return value;
};

const optionalNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: optionalNumber("PORT", 3000),
  databaseUrl: required("DATABASE_URL"),
  // TTL del bloqueo transitorio de una mesa, en minutos (RN05).
  reservationTtlMinutes: optionalNumber("RESERVATION_TTL_MINUTES", 10),
  // Autenticacion JWT.
  jwtSecret: process.env["JWT_SECRET"] ?? "kluby-dev-secret-change-me",
  jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
  // Fidelizacion inicial: $150 pagados = 1 pt (~0,7% al canjear a $1/pt).
  // El dueño configura cuánto $ descuenta 1 pt (club.pointValue). Min 500 pts, max 3000 pts.
  loyaltyCurrencyPerPoint: optionalNumber("LOYALTY_CURRENCY_PER_POINT", 150),
  loyaltyMinRedeemPoints: optionalNumber("LOYALTY_MIN_REDEEM_POINTS", 500),
  loyaltyMaxRedeemPercent: optionalNumber("LOYALTY_MAX_REDEEM_PERCENT", 25),
  loyaltyMaxRedeemPointsCap: optionalNumber("LOYALTY_MAX_REDEEM_POINTS_CAP", 3000),
  loyaltyFirstReservationBonus: optionalNumber("LOYALTY_FIRST_RESERVATION_BONUS", 25),
  loyaltyCheckInBonus: optionalNumber("LOYALTY_CHECKIN_BONUS", 5),
} as const;

export const isProduction = env.nodeEnv === "production";
