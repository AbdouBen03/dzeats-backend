import pool from "../config/db.js";

export const getRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM restaurants ORDER BY is_open DESC, id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

export const createRestaurant = async (req, res) => {
  const { name, location } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO restaurants (name, location) VALUES ($1, $2) RETURNING *",
      [name, location]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

// Owner updates their restaurant settings
export const updateRestaurantSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      is_open,
      opening_time,
      closing_time,
      min_order,
      delivery_time_min,
      delivery_time_max,
      category,
      delivery_zone,
      latitude,
      longitude,
    } = req.body;

    // Note: delivery_fee is intentionally NOT updatable by the owner anymore —
    // it is controlled centrally (admin). The existing value is preserved.
    const result = await pool.query(
      `UPDATE restaurants SET
        is_open = $1,
        opening_time = $2,
        closing_time = $3,
        min_order = $4,
        delivery_time_min = $5,
        delivery_time_max = $6,
        category = $7,
        delivery_zone = $8,
        latitude = COALESCE($9, latitude),
        longitude = COALESCE($10, longitude)
       WHERE owner_id = $11
       RETURNING *`,
      [
        is_open,
        opening_time,
        closing_time,
        Number(min_order),
        Number(delivery_time_min),
        Number(delivery_time_max),
        category,
        delivery_zone,
        latitude != null ? Number(latitude) : null,
        longitude != null ? Number(longitude) : null,
        userId,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Owner analytics: orders this week, revenue, best seller, returning customers,
// plus a 7-day daily series for the dashboard chart.
export const getRestaurantAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // resolve this owner's restaurant
    const rRes = await pool.query(
      "SELECT id, name FROM restaurants WHERE owner_id = $1",
      [userId]
    );
    if (rRes.rows.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }
    const restaurantId = rRes.rows[0].id;

    // headline numbers (this week = since Monday 00:00; revenue = delivered)
    const summary = await pool.query(
      `SELECT
         COUNT(*) FILTER (
           WHERE created_at >= date_trunc('week', NOW())
         ) AS orders_this_week,
         COALESCE(SUM(total) FILTER (
           WHERE status = 'delivered'
             AND created_at >= date_trunc('week', NOW())
         ), 0) AS revenue_this_week,
         COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0)
           AS revenue_total,
         COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_total
       FROM orders
       WHERE restaurant_id = $1`,
      [restaurantId]
    );

    // best-selling item (all time, by quantity)
    const bestSeller = await pool.query(
      `SELECT oi.name, SUM(oi.quantity)::int AS qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.restaurant_id = $1
       GROUP BY oi.name
       ORDER BY qty DESC
       LIMIT 1`,
      [restaurantId]
    );

    // customers: total distinct + those with 2+ orders (returning)
    const customers = await pool.query(
      `SELECT
         COUNT(*) AS total_customers,
         COUNT(*) FILTER (WHERE order_count >= 2) AS returning_customers
       FROM (
         SELECT user_id, COUNT(*) AS order_count
         FROM orders
         WHERE restaurant_id = $1
         GROUP BY user_id
       ) t`,
      [restaurantId]
    );

    // last 7 days series (oldest -> newest)
    const series = await pool.query(
      `SELECT
         to_char(d.day, 'Dy') AS label,
         d.day::date AS date,
         COALESCE(COUNT(o.id), 0)::int AS orders,
         COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0)
           AS revenue
       FROM generate_series(
              (NOW() - INTERVAL '6 days')::date, NOW()::date, INTERVAL '1 day'
            ) AS d(day)
       LEFT JOIN orders o
         ON o.restaurant_id = $1
        AND o.created_at::date = d.day
       GROUP BY d.day
       ORDER BY d.day ASC`,
      [restaurantId]
    );

    const s = summary.rows[0];
    const c = customers.rows[0];
    res.json({
      orders_this_week: Number(s.orders_this_week),
      revenue_this_week: Number(s.revenue_this_week),
      revenue_total: Number(s.revenue_total),
      delivered_total: Number(s.delivered_total),
      best_seller: bestSeller.rows[0]
        ? { name: bestSeller.rows[0].name, qty: Number(bestSeller.rows[0].qty) }
        : null,
      total_customers: Number(c.total_customers),
      returning_customers: Number(c.returning_customers),
      daily: series.rows.map((r) => ({
        label: r.label,
        date: r.date,
        orders: Number(r.orders),
        revenue: Number(r.revenue),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateMyRestaurant = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, location } = req.body;
    const bannerUrl = req.file ? req.file.path : null;

    const result = bannerUrl
      ? await pool.query(
          "UPDATE restaurants SET name = $1, location = $2, banner_url = $3 WHERE owner_id = $4 RETURNING *",
          [name, location, bannerUrl, userId]
        )
      : await pool.query(
          "UPDATE restaurants SET name = $1, location = $2 WHERE owner_id = $3 RETURNING *",
          [name, location, userId]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    res.json({ message: "Restaurant updated", restaurant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
