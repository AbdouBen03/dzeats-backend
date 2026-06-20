import pool from "../config/db.js";
import { sendNotification, sendNotificationToRole } from "../utils/notify.js";

// ─── Driver fee helpers ──────────────────────────────────────────────────────
// Straight-line distance between two points (km). Returns null if any missing.
function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null)) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Driver earning: 100 DA base + 20 DA/km, rounded to nearest 10 DA.
// Keep in sync with LocationService.driverEarning in the Flutter app.
function computeDriverFee(km) {
  const BASE = 100;
  const PER_KM = 20;
  if (km == null) return BASE;
  return Math.round((BASE + PER_KM * km) / 10) * 10;
}

// ─── Monthly points (tiers/levels) ───────────────────────────────────────────
function currentMonthKey() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

// Add (or subtract) monthly points; auto-resets when the month rolls over.
async function awardMonthPoints(userId, amount) {
  if (!userId || !amount) return;
  const month = currentMonthKey();
  await pool.query(
    `UPDATE users SET
       month_points = GREATEST(0, CASE WHEN points_month = $2
                                       THEN month_points + $3 ELSE $3 END),
       points_month = $2
     WHERE id = $1`,
    [userId, month, amount]
  );
}

// Driver level bonus % based on this month's points.
function driverBonusPercent(monthPoints) {
  const mp = Number(monthPoints) || 0;
  if (mp >= 1000) return 15;
  if (mp >= 500) return 10;
  if (mp >= 200) return 5;
  return 0;
}

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
      delivery_latitude,
      delivery_longitude,
      redeem_points,
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

    // Validate loyalty-points redemption (customer spends points for a reward).
    const redeem = Number(redeem_points || 0);
    if (redeem > 0) {
      const bal = await pool.query(
        "SELECT loyalty_points FROM users WHERE id = $1",
        [userId]
      );
      if (Number(bal.rows[0]?.loyalty_points || 0) < redeem) {
        return res.status(400).json({ error: "Not enough points" });
      }
    }

    const orderResult = await pool.query(
      `INSERT INTO orders
        (user_id, restaurant_id, total, status, delivery_address,
         delivery_fee, promo_code, discount, scheduled_at,
         delivery_latitude, delivery_longitude)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10)
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
        delivery_latitude != null ? Number(delivery_latitude) : null,
        delivery_longitude != null ? Number(delivery_longitude) : null,
      ]
    );

    const order = orderResult.rows[0];

    for (const item of items) {
      await pool.query(
        `INSERT INTO order_items
          (order_id, menu_item_id, name, quantity, price, note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.id, item.name, item.quantity, Number(item.price),
         item.note || null]
      );
    }

    // Loyalty points: earn 1 per 10 DA, minus any points redeemed at checkout.
    const pointsEarned = Math.floor(Number(total) / 10);
    const netPoints = pointsEarned - redeem;
    if (netPoints !== 0) {
      await pool.query(
        "UPDATE users SET loyalty_points = GREATEST(0, loyalty_points + $1) WHERE id = $2",
        [netPoints, userId]
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
        "New Order 🍕",
        `New order #${order.id} → ${Number(total)} DA`,
        { type: "new_order", order_id: order.id.toString() }
      );
    }

    res.json({
      message: "Order created 🎉",
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
      `SELECT o.*,
              r.name AS restaurant_name,
              r.location AS restaurant_location,
              r.latitude AS restaurant_latitude,
              r.longitude AS restaurant_longitude,
              u.name AS customer_name,
              u.phone AS customer_phone
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       LEFT JOIN users u ON o.user_id = u.id
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

    const order = check.rows[0];

    // Lock in the driver's earning for this trip (base + per km).
    const rest = await pool.query(
      "SELECT latitude, longitude FROM restaurants WHERE id = $1",
      [order.restaurant_id]
    );
    const r = rest.rows[0] || {};
    const km = haversineKm(
      r.latitude,
      r.longitude,
      order.delivery_latitude,
      order.delivery_longitude
    );
    let driverFee = computeDriverFee(km);
    // Apply the driver's level bonus (this month's points → +5/10/15%).
    const dRow = await pool.query(
      "SELECT month_points, points_month FROM users WHERE id = $1",
      [driverId]
    );
    const d = dRow.rows[0] || {};
    const driverMp = d.points_month === currentMonthKey() ? d.month_points : 0;
    const bonus = driverBonusPercent(driverMp);
    if (bonus > 0) {
      driverFee = Math.round((driverFee * (1 + bonus / 100)) / 10) * 10;
    }
    // Who funds the fee: customer if they were charged delivery, otherwise the
    // restaurant that offered free delivery (admin/app promos can set 'admin').
    const feeFunder = Number(order.delivery_fee) > 0 ? "customer" : "restaurant";

    const result = await pool.query(
      `UPDATE orders
       SET driver_id = $1, status = 'on_the_way',
           driver_fee = $3, fee_funder = $4
       WHERE id = $2 AND driver_id IS NULL
       RETURNING *`,
      [driverId, id, driverFee, feeFunder]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Order already taken or not found" });
    }

    // notify customer
    await sendNotification(
      result.rows[0].user_id,
      "Order Accepted 🚗",
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
      "UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const o = result.rows[0];
    // Award monthly tier/level points: customer 1/10 DA, driver +10, restaurant +5.
    try {
      await awardMonthPoints(o.user_id, Math.floor(Number(o.total) / 10));
      if (o.driver_id) await awardMonthPoints(o.driver_id, 10);
      const owner = await pool.query(
        "SELECT owner_id FROM restaurants WHERE id = $1",
        [o.restaurant_id]
      );
      if (owner.rows[0]?.owner_id) {
        await awardMonthPoints(owner.rows[0].owner_id, 5);
      }
    } catch (e) {
      console.error("points award error:", e.message);
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
      "Order Available Again 🔔",
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
      `SELECT o.*,
              r.name AS restaurant_name,
              r.location AS restaurant_location,
              r.latitude AS restaurant_latitude,
              r.longitude AS restaurant_longitude,
              u.name AS customer_name,
              u.phone AS customer_phone
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       LEFT JOIN users u ON o.user_id = u.id
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
        r.name AS restaurant_name,
        r.location AS restaurant_location,
        r.latitude AS restaurant_latitude,
        r.longitude AS restaurant_longitude
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

// DRIVER PICKUP — marks the order picked up (heading to the customer).
// Status is already 'on_the_way' from driver-accept; we flip picked_up = true
// so the driver map switches from restaurant navigation to customer navigation.
export const driverPickup = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;

    const result = await pool.query(
      `UPDATE orders SET status = 'on_the_way', picked_up = true
       WHERE id = $1 AND driver_id = $2
       RETURNING *`,
      [id, driverId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({ message: "Picked up", order: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DRIVER UPDATES GPS LOCATION (called every ~10s while delivering)
export const updateDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.user.id;
    const { latitude, longitude } = req.body;

    await pool.query(
      `UPDATE orders SET
        driver_latitude = $1,
        driver_longitude = $2,
        driver_location_updated_at = NOW()
       WHERE id = $3 AND driver_id = $4`,
      [latitude, longitude, id, driverId]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// CUSTOMER GETS DRIVER LOCATION (polled while order is on the way)
export const getDriverLocation = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT driver_latitude, driver_longitude
       FROM orders WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { driver_latitude, driver_longitude } = result.rows[0];

    if (!driver_latitude || !driver_longitude) {
      return res.json({ available: false });
    }

    res.json({ latitude: driver_latitude, longitude: driver_longitude });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DRIVER EARNINGS — total, this month, deliveries count and recent breakdown.
export const getDriverEarnings = async (req, res) => {
  try {
    const driverId = req.user.id;

    const totals = await pool.query(
      `SELECT
        COALESCE(SUM(driver_fee), 0) AS total,
        COALESCE(SUM(driver_fee) FILTER (
          WHERE delivered_at >= date_trunc('month', NOW())
        ), 0) AS this_month,
        COUNT(*) AS deliveries
       FROM orders
       WHERE driver_id = $1 AND status = 'delivered'`,
      [driverId]
    );

    const recent = await pool.query(
      `SELECT o.id, o.driver_fee, o.fee_funder, o.total, o.delivered_at,
              r.name AS restaurant_name
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.driver_id = $1 AND o.status = 'delivered'
       ORDER BY o.delivered_at DESC NULLS LAST
       LIMIT 15`,
      [driverId]
    );

    const t = totals.rows[0];
    res.json({
      total: Number(t.total),
      this_month: Number(t.this_month),
      deliveries: Number(t.deliveries),
      recent: recent.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Current user's points: monthly points (for tier/level) + spendable loyalty.
export const getMyPoints = async (req, res) => {
  try {
    const userId = req.user.id;
    const row = await pool.query(
      "SELECT role, loyalty_points, month_points, points_month FROM users WHERE id = $1",
      [userId]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const u = row.rows[0];
    // If the stored month is stale, this month's standing is effectively 0.
    const monthPoints =
      u.points_month === currentMonthKey() ? Number(u.month_points || 0) : 0;
    res.json({
      role: u.role,
      loyalty_points: Number(u.loyalty_points || 0),
      month_points: monthPoints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
