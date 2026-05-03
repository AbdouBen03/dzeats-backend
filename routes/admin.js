import express from "express";
import {
  createUser,
  createRestaurantForOwner,
  getAllUsers,
  updateUser,
  deleteUser,
  updateRestaurant,
  deleteRestaurant,
  getAllRestaurants,
  getAllOrders,
  updateRestaurantBanner,
} from "../controllers/adminController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";
import { uploadRestaurant } from "../config/cloudinaryRestaurant.js";

const router = express.Router();

router.use(verifyToken, checkRole(["admin"]));

// users
router.get("/users", getAllUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// restaurants
router.get("/restaurants", getAllRestaurants);
router.post("/restaurants", uploadRestaurant.single("banner"), createRestaurantForOwner);
router.put("/restaurants/:id", updateRestaurant);
router.put("/restaurants/:id/banner", uploadRestaurant.single("banner"), updateRestaurantBanner);
router.delete("/restaurants/:id", deleteRestaurant);

// orders
router.get("/orders", getAllOrders);

export default router;