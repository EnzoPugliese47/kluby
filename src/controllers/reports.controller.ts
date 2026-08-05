import type { Request, Response, NextFunction } from "express";
import {
  OrderStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  ReservationMode,
  ReservationStatus,
} from "../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import { requireParam } from "../utils/validation";
import { assertUserCanAccessClub } from "../utils/clubAccess";
import { EVENT_OPEN_TABLE_ACTIVE_HOURS } from "../utils/eventTiming";

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

type DashboardRange = "week" | "month" | "last_event" | "event";

interface PeriodBounds {
  range: DashboardRange;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  label: string;
  eventId?: string;
  prevEventId?: string;
}

const pctChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const dayBounds = (date: Date): { from: Date; to: Date } => {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const rollingBounds = (days: number): Omit<PeriodBounds, "range" | "label"> => {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const prevTo = new Date(from.getTime());
  const prevFrom = new Date(prevTo.getTime() - days * 86_400_000);
  return { from, to, prevFrom, prevTo };
};

const parseDashboardRange = (value: unknown): DashboardRange => {
  if (value === "week" || value === "last_event") return value;
  return "month";
};

const resolvePeriod = async (
  clubId: string,
  range: DashboardRange,
  eventId?: string
): Promise<PeriodBounds> => {
  if (eventId !== undefined && eventId.trim() !== "") {
    const event = await prisma.eventNight.findFirst({
      where: { id: eventId, clubId },
      select: { id: true, date: true, name: true },
    });
    if (event === null) {
      throw new AppError("Evento no encontrado en este boliche", 404);
    }

    const { from, to } = dayBounds(event.date);
    const prevEvent = await prisma.eventNight.findFirst({
      where: { clubId, date: { lt: event.date } },
      orderBy: { date: "desc" },
      select: { id: true, date: true },
    });
    const prevBounds = prevEvent
      ? dayBounds(prevEvent.date)
      : { from: new Date(from.getTime() - 7 * 86_400_000), to: new Date(from.getTime() - 1) };

    const dateLabel = event.date.toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return {
      range: "event",
      label: `${event.name} · ${dateLabel}`,
      from,
      to,
      prevFrom: prevBounds.from,
      prevTo: prevBounds.to,
      eventId: event.id,
      prevEventId: prevEvent?.id,
    };
  }

  if (range === "week") {
    return { range, label: "Últimos 7 días", ...rollingBounds(7) };
  }
  if (range === "month") {
    return { range, label: "Últimos 30 días", ...rollingBounds(30) };
  }

  const now = new Date();
  const event = await prisma.eventNight.findFirst({
    where: { clubId, date: { lt: now } },
    orderBy: { date: "desc" },
    select: { id: true, date: true, name: true },
  });
  if (event === null) {
    return { range, label: "Sin eventos pasados (7 días)", ...rollingBounds(7) };
  }

  const { from, to } = dayBounds(event.date);
  const prevEvent = await prisma.eventNight.findFirst({
    where: { clubId, date: { lt: event.date } },
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  const prevBounds = prevEvent
    ? dayBounds(prevEvent.date)
    : { from: new Date(from.getTime() - 7 * 86_400_000), to: new Date(from.getTime() - 1) };

  return {
    range,
    label: `Última noche · ${event.name}`,
    from,
    to,
    prevFrom: prevBounds.from,
    prevTo: prevBounds.to,
    eventId: event.id,
    prevEventId: prevEvent?.id,
  };
};

const isVipTable = (label: string, sector: string | null): boolean => {
  const text = `${label} ${sector ?? ""}`.toLowerCase();
  return (
    text.includes("vip") ||
    text.includes("premium") ||
    text.includes("privad") ||
    text.includes("ultra")
  );
};

const LEAD_BUCKETS = [
  { key: "same_day", label: "Mismo día", minDays: 0, maxDays: 1 },
  { key: "1_day", label: "1 día antes", minDays: 1, maxDays: 2 },
  { key: "2_3_days", label: "2–3 días antes", minDays: 2, maxDays: 4 },
  { key: "4_7_days", label: "4–7 días antes", minDays: 4, maxDays: 8 },
  { key: "1_week_plus", label: "Más de 1 semana", minDays: 8, maxDays: Infinity },
] as const;

const sumPaymentsInWindow = (
  payments: { amount: { toString(): string }; createdAt: Date }[],
  from: Date,
  to: Date
): number => {
  let total = 0;
  for (const p of payments) {
    if (p.createdAt >= from && p.createdAt <= to) {
      total += Number(p.amount);
    }
  }
  return total;
};

const COUNTED_RESERVATION_WHERE: Prisma.ReservationWhereInput = {
  status: {
    notIn: [
      ReservationStatus.CANCELLED,
      ReservationStatus.EXPIRED,
      ReservationStatus.PENDING_PAYMENT,
    ],
  },
};

interface EventMetricsSnapshot {
  eventId: string;
  name: string;
  date: string;
  totalRevenue: number;
  occupancyRate: number;
  showRate: number;
  noShowRate: number;
  reservationsCount: number;
  avgTicket: number;
  cancelledCount: number;
  cancellationRate: number;
  openTableCount: number;
}

/** Métricas resumidas de un evento (para comparación lado a lado). */
const computeEventMetrics = async (
  clubId: string,
  eventId: string
): Promise<EventMetricsSnapshot | null> => {
  const event = await prisma.eventNight.findFirst({
    where: { id: eventId, clubId },
    select: { id: true, name: true, date: true },
  });
  if (event === null) return null;

  const [revenueAgg, reservations, totalTables, reservedGroups] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: PaymentStatus.APPROVED,
        reservation: { clubId, eventId },
      },
      _sum: { amount: true },
    }),
    prisma.reservation.findMany({
      where: { clubId, eventId },
      select: { status: true, checkedInAt: true, mode: true },
    }),
    prisma.clubTable.count({ where: { eventId } }),
    prisma.reservation.groupBy({
      by: ["tableId"],
      where: { clubId, eventId, ...COUNTED_RESERVATION_WHERE },
    }),
  ]);

  const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
  const now = Date.now();
  let attendedCount = 0;
  let noShowCount = 0;
  for (const r of reservations) {
    if (
      r.status === ReservationStatus.CHECKED_IN ||
      r.status === ReservationStatus.COMPLETED
    ) {
      attendedCount += 1;
      continue;
    }
    if (r.status === ReservationStatus.NO_SHOW) {
      noShowCount += 1;
      continue;
    }
    if (r.status === ReservationStatus.CONFIRMED) {
      const eventEnded =
        event.date.getTime() + EVENT_OPEN_TABLE_ACTIVE_HOURS * 3_600_000 < now;
      if (eventEnded && r.checkedInAt === null) noShowCount += 1;
    }
  }
  const showDenom = attendedCount + noShowCount;
  const showRate = showDenom > 0 ? Math.round((attendedCount / showDenom) * 100) : 0;
  const noShowRate = showDenom > 0 ? Math.round((noShowCount / showDenom) * 100) : 0;
  const reservationsCount = reservations.filter(
    (r) =>
      r.status !== ReservationStatus.CANCELLED && r.status !== ReservationStatus.EXPIRED
  ).length;
  const cancelledCount = reservations.filter(
    (r) => r.status === ReservationStatus.CANCELLED
  ).length;
  const countedForCancel = reservations.filter(
    (r) =>
      r.status !== ReservationStatus.EXPIRED &&
      r.status !== ReservationStatus.PENDING_PAYMENT
  ).length;
  const cancellationRate =
    countedForCancel > 0 ? Math.round((cancelledCount / countedForCancel) * 100) : 0;
  const openTableCount = reservations.filter(
    (r) =>
      r.mode === "OPEN_TABLE" &&
      r.status !== ReservationStatus.CANCELLED &&
      r.status !== ReservationStatus.EXPIRED
  ).length;
  const occupancyRate =
    totalTables > 0 ? Math.round((reservedGroups.length / totalTables) * 100) : 0;

  return {
    eventId: event.id,
    name: event.name,
    date: event.date.toISOString(),
    totalRevenue,
    occupancyRate,
    showRate,
    noShowRate,
    reservationsCount,
    avgTicket: reservationsCount > 0 ? Math.round(totalRevenue / reservationsCount) : 0,
    cancelledCount,
    cancellationRate,
    openTableCount,
  };
};

interface ModeBreakdown {
  standard: {
    count: number;
    revenue: number;
    avgTicket: number;
  };
  openTable: {
    count: number;
    revenue: number;
    avgTicket: number;
    avgGuestsPerTable: number;
    guestShareRevenue: number;
    pctOfReservations: number;
  };
}

const computeModeBreakdown = async (
  clubId: string,
  scope: { eventId?: string; from?: Date; to?: Date }
): Promise<ModeBreakdown> => {
  const where: Prisma.ReservationWhereInput = {
    clubId,
    status: {
      notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED],
    },
    ...(scope.eventId !== undefined
      ? { eventId: scope.eventId }
      : scope.from !== undefined && scope.to !== undefined
        ? { createdAt: { gte: scope.from, lte: scope.to } }
        : {}),
  };

  const reservations = await prisma.reservation.findMany({
    where,
    select: {
      mode: true,
      amountPaid: true,
      guests: {
        where: { status: "CONFIRMED" },
        select: { id: true },
      },
      payments: {
        where: { status: PaymentStatus.APPROVED, type: PaymentType.GUEST_SHARE },
        select: { amount: true },
      },
    },
  });

  let standardCount = 0;
  let standardRevenue = 0;
  let openCount = 0;
  let openRevenue = 0;
  let openGuestCount = 0;
  let guestShareRevenue = 0;

  for (const r of reservations) {
    const paid = Number(r.amountPaid);
    const guestPayments = r.payments.reduce((acc, p) => acc + Number(p.amount), 0);
    if (r.mode === ReservationMode.OPEN_TABLE) {
      openCount += 1;
      openRevenue += paid;
      openGuestCount += r.guests.length;
      guestShareRevenue += guestPayments;
    } else {
      standardCount += 1;
      standardRevenue += paid;
    }
  }

  const total = standardCount + openCount;
  return {
    standard: {
      count: standardCount,
      revenue: standardRevenue,
      avgTicket: standardCount > 0 ? Math.round(standardRevenue / standardCount) : 0,
    },
    openTable: {
      count: openCount,
      revenue: openRevenue,
      avgTicket: openCount > 0 ? Math.round(openRevenue / openCount) : 0,
      avgGuestsPerTable:
        openCount > 0 ? Math.round((openGuestCount + openCount) / openCount) : 0,
      guestShareRevenue,
      pctOfReservations: total > 0 ? Math.round((openCount / total) * 100) : 0,
    },
  };
};

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

/** Agrega las ventas de productos (bebidas) de un boliche, opcionalmente por evento. */
const computeTopProducts = async (
  clubId: string,
  eventId?: string
): Promise<ProductSales[]> => {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        status: { in: SOLD_ORDER_STATUSES },
        reservation: { clubId, ...(eventId !== undefined ? { eventId } : {}) },
      },
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
    await assertClubExists(clubId);
    await assertUserCanAccessClub(req, clubId);
    const from = parseDate(req.query["from"]);
    const to = parseDate(req.query["to"]);

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
    await assertClubExists(clubId);
    await assertUserCanAccessClub(req, clubId);

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
    await assertUserCanAccessClub(req, clubId);
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
    await assertUserCanAccessClub(req, clubId);

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
 * GET /api/clubs/:clubId/reports/dashboard?range=month|week|last_event&eventId=
 * Panel de estadisticas filtrado por boliche y opcionalmente por evento.
 */
export const getDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clubId = requireParam(req.params, "clubId");
    await assertClubExists(clubId);
    await assertUserCanAccessClub(req, clubId);

    const eventIdParam =
      typeof req.query["eventId"] === "string" && req.query["eventId"].trim() !== ""
        ? req.query["eventId"].trim()
        : undefined;
    const range = parseDashboardRange(req.query["range"]);
    const period = await resolvePeriod(clubId, range, eventIdParam);
    const isEventScope = period.eventId !== undefined;

    const reservationScope: Prisma.ReservationWhereInput = isEventScope
      ? { clubId, eventId: period.eventId }
      : { clubId, createdAt: { gte: period.from, lte: period.to } };

    const paymentScope: Prisma.PaymentWhereInput = {
      status: PaymentStatus.APPROVED,
      reservation: isEventScope
        ? { clubId, eventId: period.eventId }
        : { clubId },
    };

    const paymentScopeInPeriod: Prisma.PaymentWhereInput = isEventScope
      ? paymentScope
      : {
          ...paymentScope,
          createdAt: { gte: period.from, lte: period.to },
        };

    const orderScope: Prisma.OrderWhereInput = {
      status: { in: SOLD_ORDER_STATUSES },
      reservation: isEventScope
        ? { clubId, eventId: period.eventId }
        : { clubId },
      ...(isEventScope ? {} : { createdAt: { gte: period.from, lte: period.to } }),
    };

    const tableRankingWhere: Prisma.ReservationWhereInput = {
      clubId,
      status: { notIn: ["CANCELLED", "EXPIRED"] },
      ...(isEventScope
        ? { eventId: period.eventId }
        : { createdAt: { gte: period.from, lte: period.to } }),
    };

    const [
      paymentsScoped,
      byType,
      tableGroups,
      tables,
      topProductsAll,
      periodReservations,
      periodOrders,
      eventsInPeriod,
      prevEventPayments,
      prevVipReservations,
    ] = await Promise.all([
      prisma.payment.findMany({
        where: paymentScopeInPeriod,
        select: { amount: true, createdAt: true },
      }),
      prisma.payment.groupBy({
        by: ["type"],
        where: paymentScopeInPeriod,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.reservation.groupBy({
        by: ["tableId"],
        where: tableRankingWhere,
        _count: { _all: true },
        _sum: { amountPaid: true },
      }),
      prisma.clubTable.findMany({
        where: isEventScope ? { clubId, eventId: period.eventId } : { clubId },
        select: { id: true, label: true, sector: true },
      }),
      computeTopProducts(clubId, period.eventId),
      prisma.reservation.findMany({
        where: reservationScope,
        select: {
          id: true,
          hostId: true,
          status: true,
          amountPaid: true,
          totalAmount: true,
          createdAt: true,
          checkedInAt: true,
          event: { select: { date: true } },
          table: { select: { label: true, sector: true, price: true } },
        },
      }),
      prisma.order.findMany({
        where: orderScope,
        select: { total: true, createdAt: true },
      }),
      isEventScope
        ? prisma.eventNight.findMany({
            where: { clubId, id: period.eventId },
            select: { id: true },
          })
        : prisma.eventNight.findMany({
            where: { clubId, date: { gte: period.from, lte: period.to } },
            select: { id: true },
          }),
      period.prevEventId !== undefined
        ? prisma.payment.aggregate({
            where: {
              status: PaymentStatus.APPROVED,
              reservation: { clubId, eventId: period.prevEventId },
            },
            _sum: { amount: true },
          })
        : Promise.resolve(null),
      period.prevEventId !== undefined
        ? prisma.reservation.findMany({
            where: {
              clubId,
              eventId: period.prevEventId,
              status: { notIn: ["CANCELLED", "EXPIRED", "PENDING_PAYMENT"] },
            },
            select: { amountPaid: true, table: { select: { label: true, sector: true } } },
          })
        : prisma.reservation.findMany({
            where: {
              clubId,
              createdAt: { gte: period.prevFrom, lte: period.prevTo },
              status: { notIn: ["CANCELLED", "EXPIRED", "PENDING_PAYMENT"] },
            },
            select: { amountPaid: true, table: { select: { label: true, sector: true } } },
          }),
    ]);

    const totalRevenue = paymentsScoped.reduce((acc, p) => acc + Number(p.amount), 0);
    const prevRevenue =
      prevEventPayments !== null
        ? Number(prevEventPayments._sum.amount ?? 0)
        : sumPaymentsInWindow(
            await prisma.payment.findMany({
              where: paymentScope,
              select: { amount: true, createdAt: true },
            }),
            period.prevFrom,
            period.prevTo
          );

    const paymentsInPeriod = paymentsScoped;

    const byDate = new Map<string, number>();
    const byWeekday = new Map<number, number>();
    for (const payment of paymentsInPeriod) {
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

    const consumptionByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      total: 0,
      orders: 0,
    }));
    for (const order of periodOrders) {
      const hour = order.createdAt.getHours();
      const slot = consumptionByHour[hour];
      if (slot !== undefined) {
        slot.total += Number(order.total);
        slot.orders += 1;
      }
    }

    const bookingLeadTime = LEAD_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: 0,
    }));
    for (const reservation of periodReservations) {
      if (["CANCELLED", "EXPIRED", "PENDING_PAYMENT"].includes(reservation.status)) {
        continue;
      }
      const daysBefore =
        (reservation.event.date.getTime() - reservation.createdAt.getTime()) /
        86_400_000;
      const idx = LEAD_BUCKETS.findIndex(
        (b) => daysBefore >= b.minDays && daysBefore < b.maxDays
      );
      if (idx >= 0) bookingLeadTime[idx]!.count += 1;
    }

    const now = Date.now();
    let attendedCount = 0;
    let noShowCount = 0;
    for (const reservation of periodReservations) {
      if (reservation.status === "CHECKED_IN" || reservation.status === "COMPLETED") {
        attendedCount += 1;
        continue;
      }
      if (reservation.status === "NO_SHOW") {
        noShowCount += 1;
        continue;
      }
      if (reservation.status === "CONFIRMED") {
        const eventEnded =
          reservation.event.date.getTime() +
          EVENT_OPEN_TABLE_ACTIVE_HOURS * 3_600_000 <
          now;
        if (eventEnded && reservation.checkedInAt === null) noShowCount += 1;
      }
    }
    const showDenom = attendedCount + noShowCount;
    const showRate = showDenom > 0 ? Math.round((attendedCount / showDenom) * 100) : 0;
    const noShowRate = showDenom > 0 ? Math.round((noShowCount / showDenom) * 100) : 0;

    let totalTableSlots = 0;
    let occupiedTableSlots = 0;
    if (eventsInPeriod.length > 0) {
      const eventIds = eventsInPeriod.map((e) => e.id);
      const [tablesPerEvent, reservedGroups] = await Promise.all([
        prisma.clubTable.groupBy({
          by: ["eventId"],
          where: { eventId: { in: eventIds } },
          _count: { _all: true },
        }),
        prisma.reservation.groupBy({
          by: ["eventId", "tableId"],
          where: {
            clubId,
            eventId: { in: eventIds },
            status: { notIn: ["CANCELLED", "EXPIRED", "PENDING_PAYMENT"] },
          },
        }),
      ]);
      totalTableSlots = tablesPerEvent.reduce((acc, row) => acc + row._count._all, 0);
      occupiedTableSlots = reservedGroups.length;
    }
    const occupancyRate =
      totalTableSlots > 0
        ? Math.round((occupiedTableSlots / totalTableSlots) * 100)
        : 0;

    const vipReservations = periodReservations.filter(
      (r) =>
        !["CANCELLED", "EXPIRED", "PENDING_PAYMENT"].includes(r.status) &&
        isVipTable(r.table.label, r.table.sector)
    );
    const vipTotal = vipReservations.reduce((acc, r) => acc + Number(r.amountPaid), 0);
    const avgVipTicket =
      vipReservations.length > 0 ? Math.round(vipTotal / vipReservations.length) : 0;

    const prevVip = prevVipReservations.filter((r) =>
      isVipTable(r.table.label, r.table.sector)
    );
    const prevVipTotal = prevVip.reduce((acc, r) => acc + Number(r.amountPaid), 0);
    const prevAvgVipTicket =
      prevVip.length > 0 ? Math.round(prevVipTotal / prevVip.length) : 0;

    const reservationsCount = periodReservations.filter(
      (r) => !["CANCELLED", "EXPIRED"].includes(r.status)
    ).length;
    const activeReservations = periodReservations.filter((r) =>
      ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(r.status)
    ).length;

    const tableById = new Map(tables.map((t) => [t.id, t]));
    const topTables = tableGroups
      .map((row) => ({
        tableId: row.tableId,
        label: tableById.get(row.tableId)?.label ?? "(desconocida)",
        sector: tableById.get(row.tableId)?.sector ?? null,
        reservationCount: row._count._all,
        revenue: Number(row._sum.amountPaid ?? 0),
      }))
      .sort((a, b) =>
        isEventScope
          ? b.revenue - a.revenue
          : b.reservationCount - a.reservationCount
      );

    const topProducts = topProductsAll.slice(0, 5);
    const salesByType = byType.map((row) => ({
      type: row.type as PaymentType,
      total: Number(row._sum.amount ?? 0),
      count: row._count,
    }));

    const compareEventIdParam =
      typeof req.query["compareEventId"] === "string" &&
      req.query["compareEventId"].trim() !== ""
        ? req.query["compareEventId"].trim()
        : undefined;
    const withCompare = req.query["compare"] === "1";

    let eventComparison: {
      current: EventMetricsSnapshot;
      compare: EventMetricsSnapshot;
    } | null = null;

    if (period.eventId !== undefined && withCompare) {
      const compareId = compareEventIdParam ?? period.prevEventId;
      if (compareId !== undefined) {
        const [currentSnap, compareSnap] = await Promise.all([
          computeEventMetrics(clubId, period.eventId),
          computeEventMetrics(clubId, compareId),
        ]);
        if (currentSnap !== null && compareSnap !== null) {
          eventComparison = { current: currentSnap, compare: compareSnap };
        }
      }
    }

    const modeBreakdown = await computeModeBreakdown(
      clubId,
      isEventScope
        ? { eventId: period.eventId }
        : { from: period.from, to: period.to }
    );

    const cancelledCount = periodReservations.filter(
      (r) => r.status === ReservationStatus.CANCELLED
    ).length;
    const countedForCancelRate = periodReservations.filter(
      (r) =>
        r.status !== ReservationStatus.EXPIRED &&
        r.status !== ReservationStatus.PENDING_PAYMENT
    ).length;
    const cancellationRate =
      countedForCancelRate > 0
        ? Math.round((cancelledCount / countedForCancelRate) * 100)
        : 0;

    const refundAgg = await prisma.payment.aggregate({
      where: {
        type: PaymentType.REFUND,
        reservation: reservationScope,
        ...(isEventScope
          ? {}
          : { createdAt: { gte: period.from, lte: period.to } }),
      },
      _sum: { amount: true },
      _count: true,
    });
    const refundedAmount = Number(refundAgg._sum.amount ?? 0);
    const refundCount = refundAgg._count;

    const kpis = {
      totalRevenue,
      revenueChangePct: pctChange(totalRevenue, prevRevenue),
      prevRevenue,
      avgVipTicket,
      avgVipTicketChangePct: pctChange(avgVipTicket, prevAvgVipTicket),
      showRate,
      noShowRate,
      attendedCount,
      noShowCount,
      cancelledCount,
      cancellationRate,
      refundedAmount,
      refundCount,
      occupancyRate,
      occupiedTableSlots,
      totalTableSlots,
      reservationsCount,
      activeReservations,
      avgTicket:
        reservationsCount > 0 ? Math.round(totalRevenue / reservationsCount) : 0,
      unitsSold: topProducts.reduce((acc, p) => acc + p.unitsSold, 0),
      eventsInPeriod: eventsInPeriod.length,
    };

    sendSuccess(res, {
      clubId,
      period: {
        range: period.range,
        label: period.label,
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        eventId: period.eventId ?? null,
      },
      kpis,
      salesByDate,
      salesByWeekday,
      consumptionByHour,
      bookingLeadTime,
      topTables,
      topProducts,
      salesByType,
      eventComparison,
      modeBreakdown,
    });
  } catch (error) {
    next(error);
  }
};
