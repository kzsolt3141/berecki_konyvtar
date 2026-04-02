const express = require('express');
const bcrypt = require('bcryptjs');
const { get } = require('../../db/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' });
    return;
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      imagePath: user.image_path,
      admin: user.admin === 1,
    };

    res.json({ message: 'Login successful.' });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out.' });
  });
});

module.exports = router;
