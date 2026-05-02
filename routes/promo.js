import express from "express";
import {
  validatePromoCode,
  getAllPromoCodes,
  createPromoCode,
  deletePromoCode,
} from "../controllers/promoController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/validate", verifyToken, validatePromoCode);
router.get("/", verifyToken, checkRole(["admin"]), getAllPromoCodes);
router.post("/", verifyToken, checkRole(["admin"]), createPromoCode);
router.delete("/:id", verifyToken, checkRole(["admin"]), deletePromoCode);

export default router;