import type { Request, Response, NextFunction } from "express";
import {
  OrderStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { requireParam } from "../utils/validation";

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("Parametro de fecha invalido", 400);
  }
  return date;
};

/** Estados de pedido que representan una venta concretada. */
const SOLD_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.DELIVERED,
];

const WEEKDAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
] as const;

const assertClubExists = async (clubId: string): Promise<void> => {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (club === null) throw new AppError("Boliche no encontrado", 404);
};

interface ProductSales {
  productId: string;
  name: string;
  category: string | null;
  unitsSold: number;
  revenue: number;
}

/** Agrega las ventas de productos (bebidas) de un boliche. */
const computeTopProducts = async (clubId: string): Promise<ProductSales[]> => {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: { status: { in: SOLD_ORDER_STATUSES }, reservation: { clubId } },
    },
    _sum: { quantity: true, subtotal: true },
  });

  const products = await prisma.product.findMany({
    where: { clubId },
    select: { id: true, name: true, category: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return grouped
    .map((row) => {
      const product = byId.get(row.productId);
      return {
        productId: row.productId,
        name: product?.name ?? "(desconocido)",
        category: product?.category ?? null,
        unitsSold: row._sum.quantity ?? 0,
        revenue: Number(row._sum.subtotal ?? 0),
      };
    })
    .sort((a, b) => b.unitsSold - a.unitsSold);
};

/**
 * GET /api/clubs/:clubId/reports/sales?from=&to=
 * Reporte de recaudacion del boliche: total y desglose por tipo de pago.
 */
export const getSalesReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    const from = parseDate(req.query["from"]);
    const to = parseDate(req.query["to"]);

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) throw new AppError("Boliche no encontrado", 404);

    const createdAt: Prisma.DateTimeFilter = {};
    if (from !== undefined) createdAt.gte = from;
    if (to !== undefined) createdAt.lte = to;

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.APPROVED,
      reservation: { clubId },
      ...(from !== undefined || to !== undefined ? { createdAt } : {}),
    };

    const [aggregate, byType] = await Promise.all([
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.groupBy({
        by: ["type"],
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    sendSuccess(res, {
      clubId,
      from: from ?? null,
      to: to ?? null,
      totalRevenue: aggregate._sum.amount ?? new Prisma.Decimal(0),
      paymentsCount: aggregate._count,
      breakdownByType: byType.map((row) => ({
        type: row.type as PaymentType,
        total: row._sum.amount ?? new Prisma.Decimal(0),
        count: row._count,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clubs/:clubId/reports/table-ranking
 * Ranking de mesas mas pedidas (por cantidad de reservas no canceladas).
 */
export const getTableRanking = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (club === null) throw new AppError("Boliche no encontrado", 404);

    const grouped = await prisma.reservation.groupBy({
      by: ["tableId"],
      where: {
        clubId,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
      },
      _count: { _all: true },
      _sum: { amountPaid: true },
    });

    const tables = await prisma.clubTable.findMany({
      where: { clubId },
      select: { id: true, label: true, sector: true },
    });
    const tableById = new Map(tables.map((t) => [t.id, t]));

    const ranking = grouped
      .map((row) => {
        const table = tableById.get(row.tableId);
        return {
          tableId: row.tableId,
          label: table?.label ?? "(desconocida)",
          sector: table?.sector ?? null,
          reservationCount: row._count._all,
          revenue: row._sum.amountPaid ?? new Prisma.Decimal(0),
        };
      })
      .sort((a, b) => b.reservationCount - a.reservationCount);

    sendSuccess(res, { clubId, ranking });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clubs/:clubId/reports/top-products
 * Ranking de bebidas/productos mas vendidos del boliche.
 */
export const getTopProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubExists(clubId);
    const products = await computeTopProducts(clubId);
    sendSuccess(res, { clubId, products });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clubs/:clubId/reports/sales-by-day
 * Recaudacion agrupada por fecha y por dia de la semana (que dias se vende mas).
 */
export const getSalesByDay = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubExists(clubId);

    const payments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.APPROVED,
        reservation: { clubId },
      },
      select: { amount: true, createdAt: true },
    });

    const byDate = new Map<string, { total: number; count: number }>();
    const byWeekday = new Map<number, { total: number; count: number }>();

    for (const payment of payments) {
      const amount = Number(payment.amount);
      const dateKey = payment.createdAt.toISOString().slice(0, 10);
      const day = payment.createdAt.getDay();

      const dateEntry = byDate.get(dateKey) ?? { total: 0, count: 0 };
      dateEntry.total += amount;
      dateEntry.count += 1;
      byDate.set(dateKey, dateEntry);

      const weekdayEntry = byWeekday.get(day) ?? { total: 0, count: 0 };
      weekdayEntry.total += amount;
      weekdayEntry.count += 1;
      byWeekday.set(day, weekdayEntry);
    }

    const salesByDate = Array.from(byDate.entries())
      .map(([date, v]) => ({ date, total: v.total, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const salesByWeekday = WEEKDAY_NAMES.map((name, index) => {
      const entry = byWeekday.get(index) ?? { total: 0, count: 0 };
      return { weekday: name, total: entry.total, count: entry.count };
    });

    sendSuccess(res, { clubId, salesByDate, salesByWeekday });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/clubs/:clubId/reports/dashboard
 * Endpoint unico que alimenta el panel de estadisticas: KPIs, ventas por dia,
 * mesas mas reservadas, bebidas mas vendidas y desglose por tipo de pago.
 */
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubExists(clubId);

    const paymentWhere: Prisma.PaymentWhereInput = {
      status: PaymentStatus.APPROVED,
      reservation: { clubId },
    };

    const [
      revenueAgg,
      reservationsCount,
      activeReservations,
      payments,
      byType,
      tableGroups,
      tables,
      topProducts,
    ] = await Promise.all([
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      prisma.reservation.count({
        where: { clubId, status: { notIn: ["CANCELLED", "EXPIRED"] } },
      }),
      prisma.reservation.count({
        where: { clubId, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        select: { amount: true, createdAt: true },
      }),
      prisma.payment.groupBy({
        by: ["type"],
        where: paymentWhere,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.reservation.groupBy({
        by: ["tableId"],
        where: { clubId, status: { notIn: ["CANCELLED", "EXPIRED"] } },
        _count: { _all: true },
        _sum: { amountPaid: true },
      }),
      prisma.clubTable.findMany({
        where: { clubId },
        select: { id: true, label: true, sector: true },
      }),
      computeTopProducts(clubId),
    ]);

    const totalRevenue = Number(revenueAgg._sum.amount ?? 0);

    // Ventas por fecha y por dia de la semana.
    const byDate = new Map<string, number>();
    const byWeekday = new Map<number, number>();
    for (const payment of payments) {
      const amount = Number(payment.amount);
      const dateKey = payment.createdAt.toISOString().slice(0, 10);
      byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + amount);
      const day = payment.createdAt.getDay();
      byWeekday.set(day, (byWeekday.get(day) ?? 0) + amount);
    }
    const salesByDate = Array.from(byDate.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const salesByWeekday = WEEKDAY_NAMES.map((name, index) => ({
      weekday: name,
      total: byWeekday.get(index) ?? 0,
    }));

    // Ranking de mesas.
    const tableById = new Map(tables.map((t) => [t.id, t]));
    const topTables = tableGroups
      .map((row) => ({
        tableId: row.tableId,
        label: tableById.get(row.tableId)?.label ?? "(desconocida)",
        sector: tableById.get(row.tableId)?.sector ?? null,
        reservationCount: row._count._all,
        revenue: Number(row._sum.amountPaid ?? 0),
      }))
      .sort((a, b) => b.reservationCount - a.reservationCount);

    const salesByType = byType.map((row) => ({
      type: row.type as PaymentType,
      total: Number(row._sum.amount ?? 0),
      count: row._count,
    }));

    const kpis = {
      totalRevenue,
      reservationsCount,
      activeReservations,
      avgTicket:
        reservationsCount > 0
          ? Math.round(totalRevenue / reservationsCount)
          : 0,
      unitsSold: topProducts.reduce((acc, p) => acc + p.unitsSold, 0),
    };

    sendSuccess(res, {
      clubId,
      kpis,
      salesByDate,
      salesByWeekday,
      topTables,
      topProducts,
      salesByType,
    });
  } catch (error) {
    next(error);
  }
};
