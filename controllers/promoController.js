import pool from "../config/db.js";

export const validatePromoCode = async (req, res) => {
  try {
    const { code, total } = req.body;

    const result = await pool.query(
      `SELECT * FROM promo_codes 
       WHERE code = $1 
       AND is_active = TRUE 
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired promo code" });
    }

    const promo = result.rows[0];
    const discount = (Number(total) * promo.discount_percent) / 100;

    res.json({
      valid: true,
      code: promo.code,
      discount_percent: promo.discount_percent,
      discount_amount: discount.toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllPromoCodes = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM promo_codes ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createPromoCode = async (req, res) => {
  try {
    const { code, discount_percent, max_uses, expires_at } = req.body;

    const result = await pool.query(
      `INSERT INTO promo_codes (code, discount_percent, max_uses, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [code.toUpperCase(), discount_percent, max_uses, expires_at]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM promo_codes WHERE id = $1", [id]);
    res.json({ message: "Promo code deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};