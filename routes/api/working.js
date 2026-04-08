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

// Get working hours
router.get('/', async (req, res) => {
  try {
    const hours = await all('SELECT * FROM working_hours ORDER BY id');
    res.json(hours);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch working hours.' });
  }
});

// Update working hours
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { hours } = req.body; // Array of hour objects
    if (!Array.isArray(hours)) {
      return res.status(400).json({ message: 'Hours must be an array.' });
    }

    // Clear existing hours
    await run('DELETE FROM working_hours');

    // Insert new hours
    for (const hour of hours) {
      await run(
        'INSERT INTO working_hours (day_of_week, open_time, close_time, is_closed, updated_at) VALUES (?, ?, ?, ?, ?)',
        [hour.day_of_week, hour.open_time, hour.close_time, hour.is_closed, new Date().toISOString()]
      );
    }

    res.json({ message: 'Working hours updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update working hours.' });
  }
});

module.exports = router;