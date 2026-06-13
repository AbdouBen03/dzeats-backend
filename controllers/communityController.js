import pool from "../config/db.js";

// ─────────────────────────────────────────────────────────────────────────────
// Community reviews feed
//
// Tables (run COMMUNITY_SETUP.sql once on the database):
//   community_posts(id, user_id, restaurant_id, rating, caption, photo_url, created_at)
//   community_likes(post_id, user_id)         -- composite PK
//   community_comments(id, post_id, user_id, comment, created_at)
// ─────────────────────────────────────────────────────────────────────────────

// CREATE A POST — multipart: photo (file), rating, caption, restaurant_id
export const createPost = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rating, caption, restaurant_id } = req.body;
    // Cloudinary upload middleware puts the hosted URL on req.file.path.
    const photoUrl = req.file ? req.file.path : null;

    if (!photoUrl && (!caption || !caption.trim())) {
      return res
        .status(400)
        .json({ error: "Add a photo or write something" });
    }

    const result = await pool.query(
      `INSERT INTO community_posts (user_id, restaurant_id, rating, caption, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        restaurant_id ? Number(restaurant_id) : null,
        rating ? Number(rating) : 0,
        caption ? caption.trim() : null,
        photoUrl,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET FEED — newest first, with author + restaurant names, counts, liked flag
export const getFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT p.id, p.user_id, p.restaurant_id, p.rating, p.caption,
              p.photo_url, p.created_at,
              u.name AS author_name,
              r.name AS restaurant_name,
              (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id) AS like_count,
              (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id) AS comment_count,
              EXISTS(
                SELECT 1 FROM community_likes l
                WHERE l.post_id = p.id AND l.user_id = $1
              ) AS liked
       FROM community_posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN restaurants r ON r.id = p.restaurant_id
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// TOGGLE LIKE — returns { liked, like_count }
export const toggleLike = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = Number(req.params.id);

    const existing = await pool.query(
      "SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2",
      [postId, userId]
    );

    let liked;
    if (existing.rows.length > 0) {
      await pool.query(
        "DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2",
        [postId, userId]
      );
      liked = false;
    } else {
      await pool.query(
        "INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)",
        [postId, userId]
      );
      liked = true;
    }

    const count = await pool.query(
      "SELECT COUNT(*) AS c FROM community_likes WHERE post_id = $1",
      [postId]
    );

    res.json({ liked, like_count: Number(count.rows[0].c) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET COMMENTS — oldest first
export const getComments = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const result = await pool.query(
      `SELECT c.id, c.user_id, c.comment, c.created_at, u.name AS author_name
       FROM community_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [postId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ADD COMMENT — returns the created comment with author_name
export const addComment = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = Number(req.params.id);
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "Comment is empty" });
    }

    const inserted = await pool.query(
      `INSERT INTO community_comments (post_id, user_id, comment)
       VALUES ($1, $2, $3) RETURNING *`,
      [postId, userId, comment.trim()]
    );

    const u = await pool.query("SELECT name FROM users WHERE id = $1", [
      userId,
    ]);

    res.status(201).json({
      ...inserted.rows[0],
      author_name: u.rows[0]?.name || "",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE POST — only the author can delete their own post
export const deletePost = async (req, res) => {
  try {
    const userId = req.user.id;
    const postId = Number(req.params.id);

    const result = await pool.query(
      "DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING id",
      [postId, userId]
    );

    if (result.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "Not allowed or post not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
