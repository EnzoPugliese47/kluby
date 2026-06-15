import { Router } from "express";
import {
  banUser,
  createStaffUser,
  deactivateUser,
  forgotPassword,
  getUserById,
  getUserTables,
  listUsers,
  loginUser,
  registerUser,
  resetPassword,
  unbanUser,
  updateUser,
} from "../controllers/users.controller";
import { listReservationsByHost } from "../controllers/reservations.controller";
import { listMyGuestEntries } from "../controllers/openTable.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

// Personal interno (staff + administradores).
const staffOrAdmin = [
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
];

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Alta de personal interno: solo administradores.
router.post(
  "/staff",
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
  createStaffUser
);

// Gestion de usuarios (staff/admin): listar, banear y ver sus mesas.
router.get("/", ...staffOrAdmin, listUsers);
router.post("/:id/ban", ...staffOrAdmin, banUser);
router.post("/:id/unban", ...staffOrAdmin, unbanUser);
router.get("/:id/tables", ...staffOrAdmin, getUserTables);

// Rutas protegidas: requieren JWT valido.
router.get("/:id", authenticate, getUserById);
router.patch("/:id", authenticate, updateUser);
router.delete("/:id", authenticate, deactivateUser);
router.get("/:id/reservations", authenticate, listReservationsByHost);
router.get("/:id/guest-entries", authenticate, listMyGuestEntries);

export default router;
