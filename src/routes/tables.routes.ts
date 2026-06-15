import { Router } from "express";
import {
  deactivateTable,
  updateTable,
} from "../controllers/tables.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

router.patch("/:id", authenticate, authorize("CLUB_ADMIN", "SUPER_ADMIN"), updateTable);
router.delete("/:id", authenticate, authorize("CLUB_ADMIN", "SUPER_ADMIN"), deactivateTable);

export default router;
