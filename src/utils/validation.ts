import { AppError } from "./appError";

/** Lee un parametro de ruta obligatorio (ej. :id) de forma type-safe. */
export const requireParam = (
  params: Record<string, string | string[] | undefined>,
  name: string
): string => {
  const raw = params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`Parametro de ruta requerido: ${name}`, 400);
  }
  return value;
};

/** Trata el body como un objeto indexable sin recurrir a `any`. */
export const asRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body !== "object" || body === null) {
    throw new AppError("El cuerpo de la peticion debe ser un objeto JSON", 400);
  }
  return body as Record<string, unknown>;
};

export const requireString = (
  source: Record<string, unknown>,
  field: string
): string => {
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`El campo '${field}' es obligatorio y debe ser texto`, 400);
  }
  return value.trim();
};

export const optionalString = (
  source: Record<string, unknown>,
  field: string
): string | undefined => {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new AppError(`El campo '${field}' debe ser texto`, 400);
  }
  return value.trim();
};

export const requireNumber = (
  source: Record<string, unknown>,
  field: string
): number => {
  const value = source[field];
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new AppError(`El campo '${field}' es obligatorio y debe ser numerico`, 400);
  }
  return parsed;
};

export const optionalNumber = (
  source: Record<string, unknown>,
  field: string
): number | undefined => {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new AppError(`El campo '${field}' debe ser numerico`, 400);
  }
  return parsed;
};

/** Valida que un valor pertenezca a un conjunto de opciones (ej. un enum). */
export const requireEnum = <T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T => {
  const value = source[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AppError(
      `El campo '${field}' debe ser uno de: ${allowed.join(", ")}`,
      400
    );
  }
  return value as T;
};

export const optionalEnum = <T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): T | undefined => {
  const value = source[field];
  if (value === undefined || value === null) return undefined;
  return requireEnum(source, field, allowed);
};
