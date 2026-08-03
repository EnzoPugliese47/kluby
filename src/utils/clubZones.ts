import { ClubZone } from "../generated/prisma/client";
import { AppError } from "./appError";

export const CLUB_ZONE_LABELS: Record<ClubZone, string> = {
  CABA: "CABA (Capital Federal)",
  ZONA_NORTE: "Zona Norte (GBA)",
  ZONA_SUR: "Zona Sur (GBA)",
  ZONA_OESTE: "Zona Oeste (GBA)",
  ZONA_ESTE: "Zona Este (GBA)",
};

export const CLUB_ZONE_SHORT: Record<ClubZone, string> = {
  CABA: "CABA",
  ZONA_NORTE: "Zona Norte",
  ZONA_SUR: "Zona Sur",
  ZONA_OESTE: "Zona Oeste",
  ZONA_ESTE: "Zona Este",
};

export const ALL_CLUB_ZONES = Object.keys(CLUB_ZONE_LABELS) as ClubZone[];

export const parseClubZone = (raw: unknown): ClubZone | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new AppError("Zona invalida", 400);
  }
  const key = raw.trim().toUpperCase() as ClubZone;
  if (!ALL_CLUB_ZONES.includes(key)) {
    throw new AppError(
      `Zona invalida. Valores: ${ALL_CLUB_ZONES.join(", ")}`,
      400
    );
  }
  return key;
};

export const requireClubZone = (raw: unknown): ClubZone => {
  const zone = parseClubZone(raw);
  if (zone === null) {
    throw new AppError("La zona es obligatoria", 400);
  }
  return zone;
};

/** Inferir zona amplia desde localidad/barrio/dirección (para datos legacy). */
export const inferClubZoneFromLocation = (
  city: string,
  address?: string | null
): ClubZone => {
  const text = `${city} ${address ?? ""}`.toLowerCase();

  if (
    /tigre|san isidro|vicente l[oó]pez|escobar|pilar|san fernando|malvinas|campana|z[aá]rate|tortuguitas|del viso|boulogne|mart[ií]nez|olivos|n[oó]rdelta|zona norte/.test(
      text
    )
  ) {
    return "ZONA_NORTE" as ClubZone;
  }
  if (
    /avellaneda|lan[uú]s|quilmes|berazategui|la plata|adrogu[eé]|banfield|temperley|lomas|san justo|haedo|mor[oó]n|zona sur/.test(
      text
    )
  ) {
    return "ZONA_SUR" as ClubZone;
  }
  if (
    /mor[oó]n|ramos|merlo|moreno|ituzaing[oó]|castelar|haedo|san justo|tres de febrero|zona oeste/.test(
      text
    )
  ) {
    return "ZONA_OESTE" as ClubZone;
  }

  return "CABA" as ClubZone;
};
