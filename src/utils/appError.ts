/**
 * Error de negocio controlado. Lleva un codigo HTTP asociado para que el
 * middleware de errores responda con el estado adecuado (400, 404, 409...).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
