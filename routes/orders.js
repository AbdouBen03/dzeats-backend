import express from "express";
import {
  createOrder,
  getOrders,
  updateOrderStatus,
  assignDriver,
  driverAcceptOrder,
  getAvailableOrdersForDrivers,
  markAsDelivered,
  getMyDriverOrders,
  getMyCustomerOrders,
  getOrderItems,
  getRestaurantOrders,
  confirmOrder,
  cancelOrder,
  customerCancelOrder,
  driverCancelOrder,
  driverPickup,
  updateDriverLocation,
  getDriverLocation,
} from "../controllers/orderController.js";

import { verifyToken } from "../middleware/authMiddleware.js";
import { checkRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ✅ Specific routes FIRST
router.get("/driver/available", verifyToken, checkRole(["driver"]), getAvailableOrdersForDrivers);
router.get("/driver/my-orders", verifyToken, checkRole(["driver"]), getMyDriverOrders);
router.get("/customer/my-orders", verifyToken, checkRole(["customer"]), getMyCustomerOrders);
router.get("/restaurant/my-orders", verifyToken, checkRole(["restaurant_owner"]), getRestaurantOrders);

// ✅ General routes
router.get("/", verifyToken, getOrders);
router.post("/", verifyToken, checkRole(["customer"]), createOrder);
router.get("/:id/items", verifyToken, getOrderItems);

// ✅ Parameterized routes LAST
router.put("/:id/status", verifyToken, checkRole(["restaurant"]), updateOrderStatus);
router.put("/:id/driver-accept", verifyToken, checkRole(["driver"]), driverAcceptOrder);
router.put("/:id/assign-driver", verifyToken, assignDriver);
router.put("/:id/deliver", verifyToken, checkRole(["driver"]), markAsDelivered);
router.put("/:id/confirm", verifyToken, checkRole(["restaurant_owner"]), confirmOrder);
router.put("/:id/cancel", verifyToken, checkRole(["restaurant_owner"]), cancelOrder);
router.put("/:id/customer-cancel", verifyToken, checkRole(["customer"]), customerCancelOrder);
router.put("/:id/driver-cancel", verifyToken, checkRole(["driver"]), driverCancelOrder);

// ✅ Maps / live tracking
router.put("/:id/pickup", verifyToken, checkRole(["driver"]), driverPickup);
router.post("/:id/location", verifyToken, checkRole(["driver"]), updateDriverLocation);
router.get("/:id/driver-location", verifyToken, getDriverLocation);

export default router;
