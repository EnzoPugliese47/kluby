import { AppError } from "./appError";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

/** Solo digitos del telefono/celular. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Contrasena: 8-72 caracteres, al menos una letra y un numero.
 * Solo valida altas y cambios; usuarios existentes no se tocan.
 */
export function assertPassword(password: string): void {
  if (password.length < PASSWORD_MIN) {
    throw new AppError(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`, 400);
  }
  if (password.length > PASSWORD_MAX) {
    throw new AppError("La contraseña es demasiado larga", 400);
  }
  if (!/[a-zA-Z]/.test(password)) {
    throw new AppError("La contraseña debe incluir al menos una letra", 400);
  }
  if (!/\d/.test(password)) {
    throw new AppError("La contraseña debe incluir al menos un número", 400);
  }
}

/**
 * Celular argentino: 10 digitos locales (ej. 11 1234 5678) o 13 con +54 9 (549…).
 */
export function assertPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = phoneDigits(trimmed);

  if (digits.length < 10 || digits.length > 13) {
    throw new AppError(
      "Celular inválido. Usá 10 dígitos (ej. 11 1234 5678) o +54 9 11 1234 5678",
      400
    );
  }
  if (/^(\d)\1+$/.test(digits)) {
    throw new AppError("El celular no es válido", 400);
  }

  if (digits.length === 10) {
    if (digits.startsWith("0")) {
      throw new AppError("El celular no debe empezar con 0. Ej: 11 1234 5678", 400);
    }
    return trimmed;
  }

  if (digits.length === 13 && digits.startsWith("549")) {
    const local = digits.slice(3);
    if (local.length !== 10 || local.startsWith("0")) {
      throw new AppError("Celular inválido con +54. Ej: +54 9 11 1234 5678", 400);
    }
    return trimmed;
  }

  if (digits.length === 12 && digits.startsWith("54")) {
    const local = digits.slice(2);
    if (local.length !== 10 || local.startsWith("0")) {
      throw new AppError("Celular inválido. Ej: +54 9 11 1234 5678", 400);
    }
    return trimmed;
  }

  throw new AppError(
    "Celular inválido. Usá 10 dígitos (ej. 11 1234 5678) o +54 9 11 1234 5678",
    400
  );
}

export function assertOptionalPhone(phone: string | undefined): string | undefined {
  if (phone === undefined || phone.trim() === "") return undefined;
  return assertPhone(phone);
}
