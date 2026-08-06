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
import { assertUserCanAccessClub } from "../utils/clubAccess";
import {
  asRecord,
  optionalString,
  requireEnum,
  requireParam,
  requireString,
} from "../utils/validation";
import { assertPassword, assertPhone, assertOptionalPhone } from "../utils/userInputRules";
import { parseClubPlan } from "../utils/clubPlan";
import { ClubPlan } from "../generated/prisma/client";

/** Campos publicos del usuario (nunca exponemos el passwordHash). */
const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  profileImageUrl: true,
  dni: true,
  birthDate: true,
  role: true,
  signupClubPlan: true,
  isVerified: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// Roles de personal del boliche (vinculados a un club via ClubMember).
const CLUB_PERSONAL_ROLE_VALUES = [UserRole.STAFF, UserRole.PUERTA] as const;

/** Telefono obligatorio (clientes y staff). */
const requirePhone = (body: Record<string, unknown>): string =>
  assertPhone(requireString(body, "phone"));

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

    assertPassword(password);

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
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

/** POST /api/users/register-owner - Alta pública de dueño de boliche con plan elegido. */
export const registerClubOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();
    const password = requireString(body, "password");
    const fullName = requireString(body, "fullName");
    const phone = requirePhone(body);
    const clubPlan = parseClubPlan(body["clubPlan"] ?? body["plan"] ?? ClubPlan.BASIC);

    assertPassword(password);

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone,
        role: UserRole.CLUB_ADMIN,
        signupClubPlan: clubPlan,
        isVerified: true,
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
 * POST /api/users/owners - Alta de dueño de boliche (solo super admin).
 */
export const createClubOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = asRecord(req.body);
    const email = requireString(body, "email").toLowerCase();
    const password = requireString(body, "password");
    const fullName = requireString(body, "fullName");
    const phone = assertOptionalPhone(optionalString(body, "phone"));

    assertPassword(password);

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        phone: phone ?? null,
        role: UserRole.CLUB_ADMIN,
        isVerified: true,
      },
      select: publicUserSelect,
    });
    sendSuccess(res, user, 201);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/staff - Alta de publis (STAFF) o puerta (PUERTA) en un boliche.
 * Solo accesible por dueños del boliche o super admin.
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
    const role = requireEnum(body, "role", CLUB_PERSONAL_ROLE_VALUES);
    const clubId = requireString(body, "clubId");
    const actor = getAuthUser(req);

    await assertUserCanAccessClub(req, clubId);

    const phone = requirePhone(body);

    assertPassword(password);

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) {
      throw new AppError("Boliche no encontrado", 404);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone,
          role,
          isVerified: true,
        },
        select: publicUserSelect,
      });
      await tx.clubMember.create({
        data: {
          userId: created.id,
          clubId,
          invitedBy: actor.sub,
        },
      });
      return created;
    });

    sendSuccess(res, { user, clubId }, 201);
  } catch (error) {
    next(error);
  }
};

/** GET /api/users/me/memberships - Boliches donde el usuario es STAFF o PUERTA. */
export const listMyClubMemberships = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = getAuthUser(req);
    if (user.role !== UserRole.STAFF && user.role !== UserRole.PUERTA) {
      throw new AppError("Solo aplica a personal del boliche", 403);
    }

    const memberships = await prisma.clubMember.findMany({
      where: { userId: user.sub, isActive: true },
      include: {
        club: {
          select: { id: true, name: true, address: true, city: true, isActive: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    sendSuccess(res, memberships);
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

    assertPassword(newPassword);

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

/** PATCH /api/users/:id - Edicion de perfil (solo el propio usuario). */
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = requireParam(req.params, "id");
    const auth = getAuthUser(req);
    if (auth.sub !== id) {
      throw new AppError("Solo podes editar tu propio perfil", 403);
    }

    const body = asRecord(req.body);
    if (body["email"] !== undefined) {
      throw new AppError("El email no se puede modificar", 400);
    }

    const data: Prisma.UserUpdateInput = {};
    const fullName = optionalString(body, "fullName");
    const phoneRaw = optionalString(body, "phone");
    const profileImageUrl = optionalString(body, "profileImageUrl");

    if (fullName !== undefined) {
      if (fullName.trim() === "") {
        throw new AppError("El nombre no puede estar vacio", 400);
      }
      data.fullName = fullName;
    }
    if (phoneRaw !== undefined) {
      data.phone = assertPhone(phoneRaw);
    }
    if (profileImageUrl !== undefined) {
      data.profileImageUrl = profileImageUrl === "" ? null : profileImageUrl;
    }

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
    const query = asRecord(req.query);
    const search = optionalString(query, "search");
    const roleFilter = optionalString(query, "role");

    const and: Prisma.UserWhereInput[] = [];

    if (search !== undefined && search.trim() !== "") {
      and.push({
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    if (roleFilter !== undefined && roleFilter.trim() !== "") {
      const role = roleFilter.trim().toUpperCase();
      if (!Object.values(UserRole).includes(role as UserRole)) {
        throw new AppError("Rol invalido en el filtro", 400);
      }
      and.push({ role: role as UserRole });
    }

    const where: Prisma.UserWhereInput = and.length > 0 ? { AND: and } : {};

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
    if (!isActive && target.role === UserRole.SUPER_ADMIN) {
      throw new AppError("No se puede banear al super admin", 403);
    }
    if (
      !isActive &&
      target.role === UserRole.CLUB_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new AppError("Solo el super admin puede banear a un dueño", 403);
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
