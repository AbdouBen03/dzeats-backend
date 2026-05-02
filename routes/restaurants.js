import express from "express";
import {
  getRestaurants,
  createRestaurant,
  updateRestaurantSettings,
} from "../controllers/restaurantController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/", getRestaurants);
router.post("/", createRestaurant);
router.put(
  "/settings",
  verifyToken,
  checkRole(["restaurant_owner"]),
  updateRestaurantSettings
);

export default router;