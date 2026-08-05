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
import uploadsRoutes from "./uploads.routes";
import invitesRoutes from "./invites.routes";
import assetsRoutes from "./assets.routes";
import paymentsRoutes from "./payments.routes";
import webhooksRoutes from "./webhooks.routes";

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
router.use("/uploads", uploadsRoutes);
router.use("/invites", invitesRoutes);
router.use("/assets", assetsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/webhooks", webhooksRoutes);

export default router;
