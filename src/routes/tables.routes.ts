import { Router } from "express";
import {
  deactivateTable,
  updateTable,
} from "../controllers/tables.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const staffOrAdmin = [
  authenticate,
  authorize("CLUB_ADMIN", "SUPER_ADMIN"),
];

router.patch("/:id", ...staffOrAdmin, updateTable);
router.delete("/:id", ...staffOrAdmin, deactivateTable);

export default router;
