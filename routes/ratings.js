import express from "express";
import { submitRating, getRestaurantRatings, rateRestaurant, getMyRestaurantRating } from "../controllers/ratingController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/", verifyToken, checkRole(["customer"]), submitRating);
router.post("/restaurant", verifyToken, checkRole(["customer"]), rateRestaurant);
router.get("/my/:restaurant_id", verifyToken, getMyRestaurantRating);
router.get("/:restaurant_id", getRestaurantRatings);

export default router;