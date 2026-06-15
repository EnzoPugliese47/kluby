import { Router } from "express";
import usersRoutes from "./users.routes";
import clubsRoutes from "./clubs.routes";
import tablesRoutes from "./tables.routes";
import eventsRoutes from "./events.routes";
import reservationsRoutes from "./reservations.routes";
import guestsRoutes from "./guests.routes";
import productsRoutes from "./products.routes";
import ordersRoutes from "./orders.routes";
import loyaltyRoutes from "./loyalty.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", service: "kluby-api" } });
});

router.use("/users", usersRoutes);
router.use("/clubs", clubsRoutes);
router.use("/tables", tablesRoutes);
router.use("/events", eventsRoutes);
router.use("/reservations", reservationsRoutes);
router.use("/guests", guestsRoutes);
router.use("/products", productsRoutes);
router.use("/orders", ordersRoutes);
router.use("/loyalty", loyaltyRoutes);

export default router;
