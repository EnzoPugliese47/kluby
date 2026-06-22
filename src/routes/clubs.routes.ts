import { Router } from "express";
import {
  createClub,
  deleteClub,
  getClubById,
  listClubs,
  updateClub,
} from "../controllers/clubs.controller";
import {
  createTable,
  listTablesByClub,
} from "../controllers/tables.controller";
import {
  createEvent,
  listEventsByClub,
} from "../controllers/events.controller";
import {
  createProduct,
  listProductsByClub,
} from "../controllers/products.controller";
import {
  getDashboard,
  getSalesByDay,
  getSalesReport,
  getTableRanking,
  getTopProducts,
} from "../controllers/reports.controller";
import {
  createClubJoinInvite,
  deactivateClubJoinInvite,
  listClubJoinInvites,
  listClubMembers,
  listStaffClubEvents,
  deactivateClubMember,
} from "../controllers/invites.controller";
import { authenticate, authorize, optionalAuthenticate } from "../middlewares/auth";

const router = Router();

// Lecturas publicas.
router.get("/", optionalAuthenticate, listClubs);
router.get("/:id", getClubById);
router.get("/:clubId/tables", listTablesByClub);
router.get("/:clubId/events", listEventsByClub);
router.get("/:clubId/products", listProductsByClub);

// Gestion del boliche: solo administradores.
const adminOnly = [authenticate, authorize("CLUB_ADMIN", "SUPER_ADMIN")];
// Gestion de eventos: staff y administradores.
const staffOrAdmin = [
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
];

router.post("/", ...adminOnly, createClub);
router.patch("/:id", ...adminOnly, updateClub);
router.delete("/:id", ...adminOnly, deleteClub);
router.post("/:clubId/tables", ...staffOrAdmin, createTable);
router.post("/:clubId/events", ...staffOrAdmin, createEvent);
router.post("/:clubId/products", ...adminOnly, createProduct);

router.get("/:clubId/staff-events", authenticate, authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"), listStaffClubEvents);
router.get("/:clubId/join-invites", ...adminOnly, listClubJoinInvites);
router.post("/:clubId/join-invites", ...adminOnly, createClubJoinInvite);
router.delete("/:clubId/join-invites/:inviteId", ...adminOnly, deactivateClubJoinInvite);
router.get("/:clubId/members", ...adminOnly, listClubMembers);
router.patch("/:clubId/members/:memberId/deactivate", ...adminOnly, deactivateClubMember);

// Reportes BI (RN20): solo administradores.
router.get("/:clubId/reports/dashboard", ...adminOnly, getDashboard);
router.get("/:clubId/reports/sales", ...adminOnly, getSalesReport);
router.get("/:clubId/reports/sales-by-day", ...adminOnly, getSalesByDay);
router.get("/:clubId/reports/table-ranking", ...adminOnly, getTableRanking);
router.get("/:clubId/reports/top-products", ...adminOnly, getTopProducts);

export default router;
