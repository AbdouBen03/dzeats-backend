import express from "express";
import {
  getRestaurants,
  createRestaurant,
  updateRestaurantSettings,
  updateMyRestaurant
} from "../controllers/restaurantController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";
import { uploadRestaurant } from "../config/cloudinaryRestaurant.js"; // ✅ add this

const router = express.Router();

router.get("/", getRestaurants);
router.post("/", createRestaurant);
router.put("/settings", verifyToken, checkRole(["restaurant_owner"]), updateRestaurantSettings);
router.put("/my-restaurant", verifyToken, checkRole(["restaurant_owner"]), uploadRestaurant.single("banner"), updateMyRestaurant);

export default router;