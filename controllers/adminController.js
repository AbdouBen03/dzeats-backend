import pool from "../config/db.js";
import bcrypt from "bcrypt";

// Create any user (driver or restaurant_owner)
export const createUser = async (req, res) => {
  const { name, phone, password, role } = req.body;
 console.log("Admin creating user, req.user:", req.user);

  try {
    if (!["driver", "restaurant_owner", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, phone, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, phone, role",
      [name, phone, hashedPassword, role]
    );

    res.json({ message: "User created", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Create restaurant and assign to owner
export const createRestaurantForOwner = async (req, res) => {
  const { name, location, owner_id } = req.body;
  const bannerUrl = req.file ? req.file.path : null;

  try {
    const result = await pool.query(
      "INSERT INTO restaurants (name, location, owner_id, banner_url) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, location, owner_id, bannerUrl]
    );

    res.json({ message: "Restaurant created", restaurant: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, phone, role FROM users ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Update user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone } = req.body;

    const result = await pool.query(
      "UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, name, phone, role",
      [name, phone, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User updated", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Update restaurant
export const updateRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location } = req.body;

    const result = await pool.query(
      "UPDATE restaurants SET name = $1, location = $2 WHERE id = $3 RETURNING *",
      [name, location, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    res.json({ message: "Restaurant updated", restaurant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete restaurant
export const deleteRestaurant = async (req, res) => {
  try {
    const { id } = req.params;

    // delete menu items first to avoid foreign key error
    await pool.query("DELETE FROM menu_items WHERE restaurant_id = $1", [id]);
    await pool.query("DELETE FROM restaurants WHERE id = $1", [id]);

    res.json({ message: "Restaurant deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all restaurants
export const getAllRestaurants = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone
       FROM restaurants r
       LEFT JOIN users u ON r.owner_id = u.id
       ORDER BY r.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all orders (admin view)
export const getAllOrders = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, 
        u.name AS customer_name,
        d.name AS driver_name,
        r.name AS restaurant_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN users d ON o.driver_id = d.id
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       ORDER BY o.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ─── Admin dashboard stats ───────────────────────────────────────────────────
export const getAdminStats = async (req, res) => {
  try {
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
        (SELECT COUNT(*) FROM users WHERE role = 'driver') AS total_drivers,
        (SELECT COUNT(*) FROM restaurants) AS total_restaurants,
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE)
          AS today_orders,
        (SELECT COALESCE(SUM(total), 0) FROM orders
          WHERE status = 'delivered' AND created_at::date = CURRENT_DATE)
          AS today_revenue,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'delivered')
          AS total_revenue,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'cancelled')
          AS cancelled_orders,
        (SELECT COUNT(DISTINCT driver_id) FROM orders
          WHERE status = 'on_the_way' AND driver_id IS NOT NULL)
          AS active_drivers,
        (SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('week', NOW()))
          AS new_users_week,
        (SELECT COUNT(*) FROM complaints WHERE status = 'pending')
          AS open_complaints
    `);

    const topRestaurants = await pool.query(`
      SELECT r.id, r.name,
             COUNT(o.id) AS orders,
             COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0) AS revenue
      FROM restaurants r
      LEFT JOIN orders o ON o.restaurant_id = r.id
      GROUP BY r.id, r.name
      ORDER BY orders DESC, revenue DESC
      LIMIT 5
    `);

    const topCustomers = await pool.query(`
      SELECT u.id, u.name,
             COUNT(o.id) AS orders,
             COALESCE(SUM(o.total), 0) AS spent
      FROM users u
      JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id, u.name
      ORDER BY orders DESC
      LIMIT 5
    `);

    const topDrivers = await pool.query(`
      SELECT u.id, u.name,
             COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS deliveries
      FROM users u
      JOIN orders o ON o.driver_id = u.id
      WHERE u.role = 'driver'
      GROUP BY u.id, u.name
      ORDER BY deliveries DESC
      LIMIT 5
    `);

    const daily = await pool.query(`
      SELECT to_char(d.day, 'Dy') AS label,
             COALESCE(COUNT(o.id), 0)::int AS orders,
             COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0) AS revenue
      FROM generate_series(
             (NOW() - INTERVAL '6 days')::date, NOW()::date, INTERVAL '1 day'
           ) AS d(day)
      LEFT JOIN orders o ON o.created_at::date = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `);

    const t = totals.rows[0];
    res.json({
      total_customers: Number(t.total_customers),
      total_drivers: Number(t.total_drivers),
      total_restaurants: Number(t.total_restaurants),
      total_orders: Number(t.total_orders),
      today_orders: Number(t.today_orders),
      today_revenue: Number(t.today_revenue),
      total_revenue: Number(t.total_revenue),
      pending_orders: Number(t.pending_orders),
      cancelled_orders: Number(t.cancelled_orders),
      active_drivers: Number(t.active_drivers),
      new_users_week: Number(t.new_users_week),
      open_complaints: Number(t.open_complaints),
      top_restaurants: topRestaurants.rows.map((r) => ({
        id: r.id, name: r.name,
        orders: Number(r.orders), revenue: Number(r.revenue),
      })),
      top_customers: topCustomers.rows.map((r) => ({
        id: r.id, name: r.name,
        orders: Number(r.orders), spent: Number(r.spent),
      })),
      top_drivers: topDrivers.rows.map((r) => ({
        id: r.id, name: r.name, deliveries: Number(r.deliveries),
      })),
      daily: daily.rows.map((r) => ({
        label: r.label, orders: Number(r.orders), revenue: Number(r.revenue),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// also add update restaurant banner
export const updateRestaurantBanner = async (req, res) => {
  const { id } = req.params;
  const bannerUrl = req.file ? req.file.path : null;

  try {
    const result = await pool.query(
      "UPDATE restaurants SET banner_url = $1 WHERE id = $2 RETURNING *",
      [bannerUrl, id]
    );

    res.json({ message: "Banner updated", restaurant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};