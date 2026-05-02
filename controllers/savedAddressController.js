import pool from "../config/db.js";

export const getSavedAddresses = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY id DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addSavedAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { label, address } = req.body;

    const result = await pool.query(
      "INSERT INTO saved_addresses (user_id, label, address) VALUES ($1,$2,$3) RETURNING *",
      [userId, label, address]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteSavedAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await pool.query(
      "DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    res.json({ message: "Address deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};