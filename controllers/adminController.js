import pool from "../config/db.js";
import bcrypt from "bcrypt";

// Create any user (driver or restaurant_owner)
export const createUser = async (req, res) => {
  const { name, phone, password, role } = req.body;

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

  try {
    const result = await pool.query(
      "INSERT INTO restaurants (name, location, owner_id) VALUES ($1,$2,$3) RETURNING *",
      [name, location, owner_id]
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