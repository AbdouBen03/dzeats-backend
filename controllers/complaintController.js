import pool from "../config/db.js";

export const submitComplaint = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id, type, description } = req.body;

    const result = await pool.query(
      `INSERT INTO complaints (user_id, order_id, type, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, order_id, type, description]
    );

    res.json({ message: "Complaint submitted", complaint: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM complaints WHERE user_id = $1 ORDER BY id DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllComplaints = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name AS customer_name, u.phone AS customer_phone
       FROM complaints c
       LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      "UPDATE complaints SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    res.json({ message: "Status updated", complaint: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};