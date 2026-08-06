import type { Request, Response, NextFunction } from "express";
import {
  Prisma,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PaymentType,
  ReservationStatus,
  GuestStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { getAuthUser } from "../middlewares/auth";
import { assertClientActor } from "../utils/clientActor";
import {
  asRecord,
  optionalString,
  requireEnum,
  requireParam,
} from "../utils/validation";

const ORDER_TYPE_VALUES = Object.values(OrderType);
const STAFF_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

/** Umbral de stock critico (RN14): por debajo se deshabilita la preventa. */
const CRITICAL_STOCK = 5;

interface ParsedItem {
  productId: string;
  quantity: number;
}

const parseItems = (body: Record<string, unknown>): ParsedItem[] => {
  const raw = body["items"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError("Debe incluir al menos un item en 'items'", 400);
  }
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new AppError(`El item ${index} es invalido`, 400);
    }
    const item = entry as Record<string, unknown>;
    const productId = item["productId"];
    const quantity = item["quantity"];
    if (typeof productId !== "string" || productId.trim() === "") {
      throw new AppError(`El item ${index} requiere 'productId'`, 400);
    }
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new AppError(`El item ${index} requiere 'quantity' entero > 0`, 400);
    }
    return { productId, quantity };
  });
};

/**
 * POST /api/reservations/:id/orders
 * Crea un pedido (preventa o en vivo) y descuenta stock. RN14: para preventa,
 * los productos con stock critico (< 5) quedan deshabilitados.
 */
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const body = asRecord(req.body);
    const type = requireEnum(body, "type", ORDER_TYPE_VALUES);
    const items = parseItems(body);
    const auth = getAuthUser(req);
    assertClientActor(auth);

    const orderId = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
      });
      if (reservation === null) {
        throw new AppError("Reserva no encontrada", 404);
      }
      const orderable: ReservationStatus[] = [
        ReservationStatus.CONFIRMED,
        ReservationStatus.CHECKED_IN,
      ];
      if (!orderable.includes(reservation.status)) {
        throw new AppError(
          "Solo se pueden hacer pedidos sobre reservas confirmadas o con check-in",
          400
        );
      }

      const isHost = reservation.hostId === auth.sub;
      const guest = await tx.reservationGuest.findFirst({
        where: {
          reservationId,
          userId: auth.sub,
          status: GuestStatus.CONFIRMED,
        },
      });
      if (!isHost && guest === null && auth.role !== "SUPER_ADMIN") {
        throw new AppError("Solo el anfitrión o invitados confirmados pueden pedir consumo", 403);
      }

      let total = new Prisma.Decimal(0);
      const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (product === null || !product.isActive) {
          throw new AppError(
            `Producto no encontrado o inactivo: ${item.productId}`,
            404
          );
        }
        if (product.clubId !== reservation.clubId) {
          throw new AppError(
            "El producto no pertenece al boliche de la reserva",
            400
          );
        }
        if (product.eventId !== null && product.eventId !== reservation.eventId) {
          throw new AppError(
            "El producto no pertenece al evento de la reserva",
            400
          );
        }
        if (type === OrderType.PREORDER && product.stock < CRITICAL_STOCK) {
          throw new AppError(
            `Preventa deshabilitada para '${product.name}' por stock critico (RN14)`,
            409
          );
        }
        if (product.stock < item.quantity) {
          throw new AppError(
            `Stock insuficiente para '${product.name}' (disponible: ${product.stock})`,
            409
          );
        }

        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } },
        });

        const unitPrice = new Prisma.Decimal(product.price);
        const subtotal = unitPrice.mul(item.quantity);
        total = total.add(subtotal);
        itemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        });
      }

      const created = await tx.order.create({
        data: {
          reservationId,
          userId: auth.sub,
          type,
          status: OrderStatus.PENDING_PAYMENT,
          total,
          items: { createMany: { data: itemsData } },
        },
      });
      return created.id;
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    sendSuccess(res, order, 201);
  } catch (error) {
    next(error);
  }
};

/** POST /api/orders/:orderId/pay - Pago (simulado) del pedido. */
export const payOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orderId = requireParam(req.params, "orderId");
    const body = asRecord(req.body);
    const provider = optionalString(body, "provider");
    const externalRef = optionalString(body, "externalRef");
    const auth = getAuthUser(req);
    assertClientActor(auth);

    const order = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (current === null) throw new AppError("Pedido no encontrado", 404);
      if (current.status !== OrderStatus.PENDING_PAYMENT) {
        throw new AppError(
          `El pedido no esta pendiente de pago (estado: ${current.status})`,
          400
        );
      }

      await tx.payment.create({
        data: {
          reservationId: current.reservationId,
          orderId: current.id,
          userId: auth.sub,
          type: PaymentType.CONSUMPTION,
          amount: current.total,
          status: PaymentStatus.APPROVED,
          provider: provider ?? null,
          externalRef: externalRef ?? null,
        },
      });

      await tx.reservation.update({
        where: { id: current.reservationId },
        data: { amountPaid: { increment: current.total } },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
        include: { items: { include: { product: true } } },
      });
    });

    sendSuccess(res, order);
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/orders/:orderId/status - El staff avanza el estado del pedido. */
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const orderId = requireParam(req.params, "orderId");
    const body = asRecord(req.body);
    const status = requireEnum(body, "status", STAFF_ORDER_STATUSES);

    const current = await prisma.order.findUnique({ where: { id: orderId } });
    if (current === null) throw new AppError("Pedido no encontrado", 404);
    if (current.status === OrderStatus.PENDING_PAYMENT) {
      throw new AppError("El pedido debe estar pagado antes de prepararse", 400);
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: { include: { product: true } } },
    });
    sendSuccess(res, order);
  } catch (error) {
    next(error);
  }
};

/** GET /api/reservations/:id/orders */
export const listOrdersByReservation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const reservationId = requireParam(req.params, "id");
    const orders = await prisma.order.findMany({
      where: { reservationId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });
    sendSuccess(res, orders);
  } catch (error) {
    next(error);
  }
};
