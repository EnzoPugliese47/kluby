import type { Request, Response, NextFunction } from "express";
import { Prisma, UserRole } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { createResetToken, hashResetToken } from "../utils/resetToken";
import { isProduction } from "../config/env";
import { getAuthUser } from "../middlewares/auth";
import {
  asRecord,
  optionalString,
  requireEnum,
  requireParam,
  requireString,
} from "../utils/validation";

/** Campos publicos del usuario (nunca exponemos el passwordHash). */
const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  dni: true,
  birthDate: true,
  role: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// Roles que un administrador puede asignar al dar de alta personal interno.
const STAFF_ROLE_VALUES = [UserRole.STAFF, UserRole.CLUB_ADMIN] as const;

/** Telefono obligatorio (clientes y staff). Exige un minimo de digitos. */
const requirePhone = (body: Record<string, unknown>): string => {
  const phone = requireString(body, "phone");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    throw new AppError("El telefono no es valido (minimo 6 digitos)", 400);
  }
  return phone;
};

/** RN01: validar mayoria de edad (18+) a partir de la fecha de nacimiento. */
const isAdult = (birthDate: Date): boolean => {
  const now = new Date();
  const age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());
  return hasHadBirthday ? age >= 18 : age - 1 >= 18;
};

/** POST /api/users/register - Alta de usuario. */
export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();
    const password = requireString(body, "password");
    const fullName = requireString(body, "fullName");
    // El telefono es obligatorio para clientes: se comparte con el anfitrion y
    // los integrantes de la mesa al pedir unirse a una Mesa Abierta.
    const phone = requirePhone(body);
    const dni = optionalString(body, "dni");
    // El registro publico solo crea usuarios CLIENT. Los roles STAFF/CLUB_ADMIN
    // se crean mediante el endpoint protegido createStaffUser.
    const role = UserRole.CLIENT;

    const birthDateRaw = optionalString(body, "birthDate");
    let birthDate: Date | undefined;
    if (birthDateRaw !== undefined) {
      const parsed = new Date(birthDateRaw);
      if (Number.isNaN(parsed.getTime())) {
        throw new AppError("El campo 'birthDate' no es una fecha valida", 400);
      }
      if (!isAdult(parsed)) {
        throw new AppError("El usuario debe ser mayor de 18 anios (RN01)", 400);
      }
      birthDate = parsed;
    }

    if (password.length < 8) {
      throw new AppError("La contrasena debe tener al menos 8 caracteres", 400);
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone: phone ?? null,
        dni: dni ?? null,
        birthDate: birthDate ?? null,
        role,
      },
      select: publicUserSelect,
    });

    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    sendSuccess(res, { user, token }, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/staff - Alta de personal interno (STAFF o CLUB_ADMIN).
 * Solo accesible por administradores (ver middleware en la ruta).
 */
export const createStaffUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();
    const password = requireString(body, "password");
    const fullName = requireString(body, "fullName");
    const role = requireEnum(body, "role", STAFF_ROLE_VALUES);
    // El telefono es obligatorio salvo para administradores.
    const phone = role === UserRole.CLUB_ADMIN ? optionalString(body, "phone") : requirePhone(body);

    if (password.length < 8) {
      throw new AppError("La contrasena debe tener al menos 8 caracteres", 400);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone: phone ?? null,
        role,
        isVerified: true,
      },
      select: publicUserSelect,
    });
    sendSuccess(res, user, 201);
  } catch (error) {
    next(error);
  }
};

/** POST /api/users/login - Autenticacion basica por email + contrasena. */
export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();
    const password = requireString(body, "password");

    const user = await prisma.user.findUnique({ where: { email } });
    if (user === null || !user.isActive) {
      throw new AppError("Credenciales invalidas", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError("Credenciales invalidas", 401);
    }

    const { passwordHash: _omit, ...safeUser } = user;
    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    sendSuccess(res, { user: safeUser, token });
  } catch (error) {
    next(error);
  }
};

/** Minutos de validez del token de recuperacion. */
const RESET_TOKEN_TTL_MIN = 60;

/**
 * POST /api/users/forgot-password
 * Inicia el flujo de recuperacion. Por seguridad responde siempre exito
 * (no revela si el email existe). En produccion se enviaria el link por email;
 * en este entorno de demo se devuelve el token/link en la respuesta.
 */
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    const genericMessage =
      "Si el email esta registrado, te enviamos un enlace para restablecer tu contrasena.";

    if (user === null || !user.isActive) {
      sendSuccess(res, { message: genericMessage });
      return;
    }

    // Invalida tokens previos sin usar y crea uno nuevo.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });
    const { token, tokenHash } = createResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000),
      },
    });

    const resetLink = `/reset?token=${token}`;
    if (!isProduction) {
      console.log(`[Kluby] Reset password para ${email}: token=${token}`);
    }

    // En produccion: enviar 'resetLink' por email y NO devolver el token.
    sendSuccess(res, {
      message: genericMessage,
      ...(isProduction ? {} : { token, resetLink, expiresInMinutes: RESET_TOKEN_TTL_MIN }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/reset-password
 * Completa el flujo: valida el token y establece la nueva contrasena.
 */
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const token = requireString(body, "token");
    const newPassword = requireString(body, "newPassword");

    if (newPassword.length < 8) {
      throw new AppError("La contrasena debe tener al menos 8 caracteres", 400);
    }

    const tokenHash = hashResetToken(token);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (record === null || record.usedAt !== null || record.expiresAt < new Date()) {
      throw new AppError("El enlace de recuperacion es invalido o expiro", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Invalida cualquier otro token pendiente del usuario.
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null },
      }),
    ]);

    sendSuccess(res, { message: "Contrasena actualizada. Ya podes iniciar sesion." });
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/:id */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const user = await prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (user === null) {
      throw new AppError("Usuario no encontrado", 404);
    }
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/users/:id - Edicion de perfil. */
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const body = asRecord(req.body);

    const data: Prisma.UserUpdateInput = {};
    const fullName = optionalString(body, "fullName");
    const phone = optionalString(body, "phone");
    if (fullName !== undefined) data.fullName = fullName;
    if (phone !== undefined) data.phone = phone;

    if (Object.keys(data).length === 0) {
      throw new AppError("No se enviaron campos para actualizar", 400);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/users/:id - Baja logica (desactivacion). */
export const deactivateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: publicUserSelect,
    });
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users - Listado para gestion (admin/staff). Permite buscar por
 * nombre o email y devuelve el conteo de reservas de cada usuario.
 */
export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = optionalString(asRecord(req.query), "search");
    const where: Prisma.UserWhereInput =
      search !== undefined && search.trim() !== ""
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          }
        : {};

    const users = await prisma.user.findMany({
      where,
      select: {
        ...publicUserSelect,
        _count: { select: { reservations: true, guestEntries: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    sendSuccess(res, users);
  } catch (error) {
    next(error);
  }
};

/** Cambia el estado activo de un usuario (banear / reactivar). */
const setUserActive = async (
  req: Request,
  res: Response,
  next: NextFunction,
  isActive: boolean
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const actor = getAuthUser(req);

    if (id === actor.sub) {
      throw new AppError("No podes cambiar tu propio estado de cuenta", 400);
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (target === null) {
      throw new AppError("Usuario no encontrado", 404);
    }
    if (
      !isActive &&
      (target.role === UserRole.SUPER_ADMIN ||
        target.role === UserRole.CLUB_ADMIN)
    ) {
      throw new AppError("No se puede banear a un administrador", 403);
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: publicUserSelect,
    });
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
};

/** POST /api/users/:id/ban - Banea (desactiva) un usuario. */
export const banUser = (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => setUserActive(req, res, next, false);

/** POST /api/users/:id/unban - Reactiva un usuario baneado. */
export const unbanUser = (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => setUserActive(req, res, next, true);

/**
 * GET /api/users/:id/tables - Mesas en las que participa el usuario, ya sea
 * como anfitrion o como invitado de una Mesa Abierta (admin/staff).
 */
export const getUserTables = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");

    const [asHost, asGuest] = await Promise.all([
      prisma.reservation.findMany({
        where: { hostId: id },
        select: {
          id: true,
          status: true,
          mode: true,
          totalAmount: true,
          amountPaid: true,
          table: { select: { id: true, label: true } },
          event: { select: { id: true, name: true, date: true } },
          club: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.reservationGuest.findMany({
        where: { userId: id },
        select: {
          id: true,
          status: true,
          shareAmount: true,
          reservation: {
            select: {
              id: true,
              status: true,
              table: { select: { id: true, label: true } },
              event: { select: { id: true, name: true, date: true } },
              club: { select: { id: true, name: true } },
              host: { select: { id: true, fullName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    sendSuccess(res, { asHost, asGuest });
  } catch (error) {
    next(error);
  }
};
