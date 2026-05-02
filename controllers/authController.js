import pool from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const register = async (req, res) => {
  const { name, phone, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await pool.query(
      "INSERT INTO users (name, phone, password, role) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, phone, hashedPassword, role || "customer"]
    );

    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json(err.message);
  }
};

export const login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const user = await pool.query(
      "SELECT * FROM users WHERE phone=$1",
      [phone]
    );

    if (user.rows.length === 0) {
      return res.status(400).json("User not found");
    }

    const valid = await bcrypt.compare(password, user.rows[0].password);

    if (!valid) {
      return res.status(400).json("Wrong password");
    }

   const token = jwt.sign(
  { id: user.rows[0].id, role: user.rows[0].role },
  process.env.JWT_SECRET,
{ expiresIn: "7d" }
);

    res.json({
  token,
  role: user.rows[0].role,
  name: user.rows[0].name,  // ✅ add name
  phone: user.rows[0].phone // ✅ add phone
});
  } catch (err) {
  console.error("LOGIN ERROR:", err);
  res.status(500).json(err.message);
}
};
export const saveFcmToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fcm_token } = req.body;

    await pool.query(
      "UPDATE users SET fcm_token = $1 WHERE id = $2",
      [fcm_token, userId]
    );

    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Update profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    const result = await pool.query(
      "UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, name, phone, role",
      [name, phone, userId]
    );

    res.json({ message: "Profile updated", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    const user = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(
      current_password,
      user.rows[0].password
    );

    if (!valid) {
      return res.status(400).json({ error: "Current password is wrong" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await pool.query(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hashedPassword, userId]
    );

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get order statistics for customer

export const getMyStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_orders,
        COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS total_spent
       FROM orders
       WHERE user_id = $1`,
      [userId]
    );

    // get loyalty points
    const user = await pool.query(
      "SELECT loyalty_points FROM users WHERE id = $1",
      [userId]
    );

    res.json({
      ...result.rows[0],
      loyalty_points: user.rows[0]?.loyalty_points || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};