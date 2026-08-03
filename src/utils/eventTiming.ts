/** Horas después del inicio del evento en las que la mesa abierta sigue visible. */
export const EVENT_OPEN_TABLE_ACTIVE_HOURS = 6;

export const isEventOpenForOpenTables = (
  eventDate: Date,
  now: Date = new Date()
): boolean =>
  eventDate.getTime() + EVENT_OPEN_TABLE_ACTIVE_HOURS * 3_600_000 > now.getTime();

export const isEventPast = (
  eventDate: Date,
  now: Date = new Date()
): boolean => !isEventOpenForOpenTables(eventDate, now);

/** Fecha mínima del evento para incluirlo en el muro de mesas abiertas. */
export const openTablesEventCutoff = (now: Date = new Date()): Date =>
  new Date(now.getTime() - EVENT_OPEN_TABLE_ACTIVE_HOURS * 3_600_000);
