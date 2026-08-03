import { prisma } from "../lib/prisma";
import { occupyingReservationFilter } from "./reservation";

/** Mesas libres por evento (eventId → cantidad). */
export const countAvailableTablesByEvent = async (
  eventIds: string[],
  now: Date = new Date()
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (eventIds.length === 0) return result;

  const [tables, reservations] = await Promise.all([
    prisma.clubTable.findMany({
      where: { eventId: { in: eventIds }, isActive: true },
      select: { id: true, eventId: true },
    }),
    prisma.reservation.findMany({
      where: {
        eventId: { in: eventIds },
        ...occupyingReservationFilter(now),
      },
      select: { eventId: true, tableId: true },
    }),
  ]);

  const occupiedByEvent = new Map<string, Set<string>>();
  for (const r of reservations) {
    let set = occupiedByEvent.get(r.eventId);
    if (set === undefined) {
      set = new Set<string>();
      occupiedByEvent.set(r.eventId, set);
    }
    set.add(r.tableId);
  }

  for (const t of tables) {
    const eid = t.eventId;
    if (eid === null) continue;
    if (occupiedByEvent.get(eid)?.has(t.id)) continue;
    result.set(eid, (result.get(eid) ?? 0) + 1);
  }

  return result;
};

export const eventIdsWithAvailableTables = async (
  eventIds: string[],
  now: Date = new Date()
): Promise<Set<string>> => {
  const counts = await countAvailableTablesByEvent(eventIds, now);
  const withAvail = new Set<string>();
  for (const [id, n] of counts) {
    if (n > 0) withAvail.add(id);
  }
  return withAvail;
};
