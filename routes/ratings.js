import express from "express";
import { submitRating, getRestaurantRatings } from "../controllers/ratingController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/", verifyToken, checkRole(["customer"]), submitRating);
router.get("/:restaurant_id", getRestaurantRatings);

export default router;