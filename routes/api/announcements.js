const express = require('express');
const { all, run, get } = require('../../db/database');

const router = express.Router();

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.admin) {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
}

// Get active announcements (or all if admin with all=true)
router.get('/', async (req, res) => {
  try {
    const includeAll = req.query.all === 'true' && req.session.user && req.session.user.admin;
    const query = includeAll 
      ? 'SELECT * FROM announcements ORDER BY created_at DESC'
      : 'SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC';
    const announcements = await all(query);
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch announcements.' });
  }
});

// Add or update announcement
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required.' });
    }

    await run(
      'INSERT INTO announcements (title, content, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
      [title, content, new Date().toISOString(), new Date().toISOString()]
    );

    res.json({ message: 'Announcement added successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add announcement.' });
  }
});

// Update announcement
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;

    await run(
      'UPDATE announcements SET title = ?, content = ?, is_active = ?, updated_at = ? WHERE id = ?',
      [title, content, is_active ? 1 : 0, new Date().toISOString(), id]
    );

    res.json({ message: 'Announcement updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update announcement.' });
  }
});

// Delete announcement
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await run('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ message: 'Announcement deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete announcement.' });
  }
});

module.exports = router;