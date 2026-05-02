import pool from "../config/db.js";
import { sendNotification, sendNotificationToRole } from "../utils/notify.js";

// CREATE ORDER
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      restaurant_id,
      items,
      total,
      delivery_address,
      delivery_fee,
      promo_code,
      discount,
      scheduled_at,
    } = req.body;

    // validate restaurant
    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE id = $1",
      [restaurant_id]
    );

    if (restaurant.rows.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const rest = restaurant.rows[0];

    if (!rest.is_open) {
      return res.status(400).json({ error: "Restaurant is currently closed" });
    }

    if (Number(total) < Number(rest.min_order || 0)) {
      return res.status(400).json({
        error: `Minimum order is ${rest.min_order} DA`,
      });
    }

    // use promo code
    if (promo_code) {
      await pool.query(
        "UPDATE promo_codes SET used_count = used_count + 1 WHERE code = $1",
        [promo_code.toUpperCase()]
      );
    }

    // calculate estimated delivery time
    const estimatedMinutes = Math.floor(
      Math.random() *
        ((rest.delivery_time_max || 45) - (rest.delivery_time_min || 20) + 1) +
        (rest.delivery_time_min || 20)
    );

    const orderResult = await pool.query(
      `INSERT INTO orders 
        (user_id, restaurant_id, total, status, delivery_address, 
         delivery_fee, promo_code, discount, scheduled_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        restaurant_id,
        Number(total),
        delivery_address,
        Number(delivery_fee || 0),
        promo_code || null,
        Number(discount || 0),
        scheduled_at || null,
      ]
    );

    const order = orderResult.rows[0];

    for (const item of items) {
      await pool.query(
        `INSERT INTO order_items 
          (order_id, menu_item_id, name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.id, item.name, item.quantity, Number(item.price)]
      );
    }

    // add loyalty points (1 point per 10 DA spent)
    const pointsEarned = Math.floor(Number(total) / 10);
    if (pointsEarned > 0) {
      await pool.query(
        "UPDATE users SET loyalty_points = loyalty_points + $1 WHERE id = $2",
        [pointsEarned, userId]
      );
    }

    // notify restaurant owner
    const owner = await pool.query(
      `SELECT u.id FROM users u
       JOIN restaurants r ON r.owner_id = u.id
       WHERE r.id = $1 AND u.fcm_token IS NOT NULL`,
      [restaurant_id]
    );

    if (owner.rows.length > 0) {
      await sendNotification(
        owner.rows[0].id,
        "New Order 🔔",
        `New order #${order.id} — ${Number(total)} DA`,
        { type: "new_order", order_id: order.id.toString() }
      );
    }

    res.json({
      message: "Order created 🚀",
      order_id: order.id,
      estimated_minutes: estimatedMinutes,
      points_earned: pointsEarned,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// GET ALL ORDERS
export const getOrders = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE ORDER STATUS
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      "UPDATE orders SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ message: "Order status updated", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ASSIGN DRIVER MANUALLY
export const assignDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { driver_id } = req.body;

    const result = await pool.query(
      "UPDATE orders SET driver_id = $1 WHERE id = $2 RETURNING *",
      [driver_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ message: "Driver assigned", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET AVAILABLE ORDERS FOR DRIVERS (only confirmed orders)
export const getAvailableOrdersForDrivers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, r.name AS restaurant_name, r.location AS restaurant_location
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.status = 'confirmed' AND o.driver_id IS NULL 
       ORDER BY o.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DRIVER ACCEPTS ORDER
export const driverAcceptOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    console.log(`Driver ${driverId} trying to accept order ${id}`);

    const check = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const result = await pool.query(
      `UPDATE orders 
       SET driver_id = $1, status = 'on_the_way'
       WHERE id = $2 AND driver_id IS NULL
       RETURNING *`,
      [driverId, id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Order already taken or not found" });
    }

    // notify customer
    await sendNotification(
      result.rows[0].user_id,
      "Order Accepted 🚚",
      "A driver is on the way to deliver your order!",
      { type: "order_on_the_way", order_id: id.toString() }
    );

    res.json({ message: "Order accepted by driver", order: result.rows[0] });
  } catch (err) {
    console.error("DRIVER ACCEPT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

// MARK ORDER AS DELIVERED
export const markAsDelivered = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "UPDATE orders SET status = 'delivered' WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    // notify customer
    await sendNotification(
      result.rows[0].user_id,
      "Order Delivered ✅",
      "Your order has been delivered. Enjoy your meal! 🍽",
      { type: "order_delivered", order_id: id.toString() }
    );

    res.json({ message: "Order delivered", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// RESTAURANT CONFIRMS ORDER
export const confirmOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE owner_id = $1",
      [userId]
    );

    if (restaurant.rows.length === 0) {
      return res.status(403).json({ error: "Not your restaurant" });
    }

    const result = await pool.query(
      `UPDATE orders SET status = 'confirmed'
       WHERE id = $1 AND restaurant_id = $2 AND status = 'pending'
       RETURNING *`,
      [id, restaurant.rows[0].id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Order not found or already confirmed" });
    }

    // notify all drivers
    await sendNotificationToRole(
      "driver",
      "Order Ready 🍽",
      `Order #${id} is confirmed and ready for pickup!`,
      { type: "order_confirmed", order_id: id.toString() }
    );

    // notify customer
    await sendNotification(
      result.rows[0].user_id,
      "Order Confirmed ✅",
      "Your order has been confirmed by the restaurant!",
      { type: "order_confirmed", order_id: id.toString() }
    );

    res.json({ message: "Order confirmed", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// RESTAURANT CANCELS ORDER
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE owner_id = $1",
      [userId]
    );

    if (restaurant.rows.length === 0) {
      return res.status(403).json({ error: "Not your restaurant" });
    }

    const result = await pool.query(
      `UPDATE orders SET 
        status = 'cancelled',
        cancel_reason = $1,
        cancelled_by = 'restaurant'
       WHERE id = $2 AND restaurant_id = $3 AND status = 'pending'
       RETURNING *`,
      [reason || "Restaurant unavailable", id, restaurant.rows[0].id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Order not found or already processed" });
    }

    // notify customer with reason + refund notice
    await sendNotification(
      result.rows[0].user_id,
      "Order Cancelled ❌",
      `Your order #${id} was cancelled by the restaurant. Reason: ${reason || "Restaurant unavailable"}. No payment was taken.`,
      { type: "order_cancelled", order_id: id.toString() }
    );

    res.json({ message: "Order cancelled", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CUSTOMER CANCELS ORDER
export const customerCancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    // can only cancel if still pending
    const result = await pool.query(
      `UPDATE orders SET 
        status = 'cancelled',
        cancel_reason = $1,
        cancelled_by = 'customer'
       WHERE id = $2 AND user_id = $3 AND status = 'pending'
       RETURNING *`,
      [reason || "Customer cancelled", id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "Cannot cancel — order already confirmed or not found"
      });
    }

    // notify restaurant owner
    const owner = await pool.query(
      `SELECT u.id FROM users u
       JOIN restaurants r ON r.owner_id = u.id
       WHERE r.id = $1 AND u.fcm_token IS NOT NULL`,
      [result.rows[0].restaurant_id]
    );

    if (owner.rows.length > 0) {
      await sendNotification(
        owner.rows[0].id,
        "Order Cancelled by Customer",
        `Order #${id} was cancelled by the customer. Reason: ${reason || "Customer cancelled"}`,
        { type: "new_order", order_id: id.toString() }
      );
    }

    res.json({ message: "Order cancelled", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DRIVER CANCELS ORDER
export const driverCancelOrder = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    // get order info first
    const orderCheck = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND driver_id = $2 AND status = 'on_the_way'",
      [id, driverId]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(400).json({
        error: "Cannot cancel — order not found or not yours"
      });
    }

    const order = orderCheck.rows[0];

    // put order back to confirmed so another driver can take it
    const result = await pool.query(
      `UPDATE orders SET 
        status = 'confirmed',
        driver_id = NULL,
        cancel_reason = NULL,
        cancelled_by = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    // notify customer
    await sendNotification(
      order.user_id,
      "Driver Cancelled 😔",
      `Your driver cancelled the delivery. Reason: ${reason || "Driver unavailable"}. Don't worry, another driver will pick up your order shortly!`,
      { type: "order_confirmed", order_id: id.toString() }
    );

    // notify all drivers that order is available again
    await sendNotificationToRole(
      "driver",
      "Order Available Again 🚚",
      `Order #${id} is available for pickup!`,
      { type: "order_confirmed", order_id: id.toString() }
    );

    res.json({
      message: "Order cancelled by driver, back to available",
      order: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET MY DRIVER ORDERS
export const getMyDriverOrders = async (req, res) => {
  try {
    const driverId = req.user.id;

    const result = await pool.query(
      `SELECT o.*, r.name AS restaurant_name, r.location AS restaurant_location
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.driver_id = $1 AND o.status != 'delivered'
       ORDER BY o.id DESC`,
      [driverId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET MY CUSTOMER ORDERS
export const getMyCustomerOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        o.*,
        u.name AS driver_name,
        u.phone AS driver_phone,
        r.name AS restaurant_name
       FROM orders o
       LEFT JOIN users u ON o.driver_id = u.id
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.user_id = $1
       ORDER BY o.id DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET ORDER ITEMS
export const getOrderItems = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT oi.*, mi.name as menu_item_name 
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// RESTAURANT OWNER: get orders for their restaurant
export const getRestaurantOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const restaurant = await pool.query(
      "SELECT * FROM restaurants WHERE owner_id = $1",
      [userId]
    );

    if (restaurant.rows.length === 0) {
      return res.status(404).json({ error: "No restaurant found" });
    }

    const restaurantId = restaurant.rows[0].id;

    const result = await pool.query(
      `SELECT 
        o.*,
        u.name AS customer_name,
        u.phone AS customer_phone,
        d.name AS driver_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN users d ON o.driver_id = d.id
       WHERE o.restaurant_id = $1
       ORDER BY o.id DESC`,
      [restaurantId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};