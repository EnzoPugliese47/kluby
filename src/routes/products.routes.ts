import { Router } from "express";
import {
  deactivateProduct,
  updateProduct,
} from "../controllers/products.controller";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();

const staffOrAdmin = [
  authenticate,
  authorize("STAFF", "CLUB_ADMIN", "SUPER_ADMIN"),
];

router.patch("/:id", ...staffOrAdmin, updateProduct);
router.delete("/:id", ...staffOrAdmin, deactivateProduct);

export default router;
