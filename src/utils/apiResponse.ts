import type { Response } from "express";

/**
 * Formato estandar de respuesta de la API:
 *   { success: boolean, data?: any, error?: string }
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode = 200
): Response<ApiSuccess<T>> => res.status(statusCode).json({ success: true, data });

export const sendError = (
  res: Response,
  error: string,
  statusCode = 400
): Response<ApiFailure> => res.status(statusCode).json({ success: false, error });
