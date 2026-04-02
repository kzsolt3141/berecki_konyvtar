const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../../db/database');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', '..', 'public', 'uploads', 'users');

fs.mkdirSync(uploadDirectory, { recursive: true });

function sanitizeFilenamePart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'image';
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const baseName = path.basename(file.originalname || 'image', extension);
    const safeBaseName = sanitizeFilenamePart(baseName);

    callback(null, `${Date.now()}-${safeBaseName}${extension}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Only image uploads are allowed.'));
      return;
    }

    callback(null, true);
  },
});

function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  fs.promises.unlink(file.path).catch(() => {});
}

router.post('/', upload.single('image'), async (req, res) => {
  const {
    name,
    email,
    password,
    confirm_password: confirmPassword,
    address,
    phone,
    occupancy,
    birth_date: birthDate,
    notes,
  } = req.body;

  const requiredFields = [name, email, password, confirmPassword, address, phone, occupancy, birthDate];

  if (requiredFields.some((value) => !String(value || '').trim())) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Please fill in all required fields.' });
    return;
  }

  if (password !== confirmPassword) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Passwords do not match.' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();
    const imagePath = req.file ? `/uploads/users/${req.file.filename}` : null;

    const result = await run(
      `INSERT INTO users (
        name,
        email,
        password_hash,
        admin,
        address,
        phone,
        occupancy,
        birth_date,
        image_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.trim().toLowerCase(),
        passwordHash,
        0,
        address.trim(),
        phone.trim(),
        occupancy.trim(),
        birthDate,
        imagePath,
        createdAt,
      ]
    );

    res.status(201).json({
      message: 'Account created successfully.',
      user: {
        id: result.lastID,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        imagePath,
      },
    });
  } catch (error) {
    removeUploadedFile(req.file);

    if (error.code === 'SQLITE_CONSTRAINT') {
      if ((error.message || '').includes('users.email')) {
        res.status(409).json({ message: 'This email is already registered.' });
        return;
      }

      if ((error.message || '').includes('users.phone')) {
        res.status(409).json({ message: 'This phone number is already registered.' });
        return;
      }

      if ((error.message || '').includes('users.address')) {
        res.status(409).json({ message: 'This address is already registered.' });
        return;
      }

      res.status(409).json({ message: 'A unique field already exists.' });
      return;
    }

    res.status(500).json({ message: 'Could not create account.' });
  }
});

router.use((error, _req, res, _next) => {
  res.status(400).json({ message: error.message || 'Invalid upload.' });
});

// ── GET /api/users/:id – profile data + notes ──────────────────────────────
router.get('/:id', async (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  const id = parseInt(req.params.id, 10);

  if (req.session.user.id !== id) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  try {
    const user = await get(
      'SELECT id, name, email, address, phone, occupancy, birth_date, image_path, admin, created_at FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    const notes = await all(
      'SELECT id, content, created_at FROM user_notes WHERE user_id = ? ORDER BY created_at ASC',
      [id]
    );

    res.json({ user, notes });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch user.' });
  }
});

// ── PUT /api/users/:id – update profile ────────────────────────────────────
router.put('/:id', upload.single('image'), async (req, res) => {
  if (!req.session.user) {
    removeUploadedFile(req.file);
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  const id = parseInt(req.params.id, 10);

  const isSelf = req.session.user.id === id;
  const isAdmin = req.session.user.admin === true;

  if (!isSelf && !isAdmin) {
    removeUploadedFile(req.file);
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const {
    name,
    email,
    address,
    phone,
    occupancy,
    birth_date: birthDate,
    new_password: newPassword,
    confirm_new_password: confirmNewPassword,
    admin: adminField,
  } = req.body;

  if (adminField !== undefined && !isAdmin) {
    removeUploadedFile(req.file);
    res.status(403).json({ message: 'Forbidden: only admins can change the admin flag.' });
    return;
  }

  if (![name, email, address, phone, occupancy, birthDate].every((v) => String(v || '').trim())) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Please fill in all required fields.' });
    return;
  }

  if (newPassword && newPassword !== confirmNewPassword) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Passwords do not match.' });
    return;
  }

  try {
    const existing = await get('SELECT image_path FROM users WHERE id = ?', [id]);

    if (!existing) {
      removeUploadedFile(req.file);
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    let imagePath = existing.image_path;

    if (req.file) {
      if (imagePath) {
        const oldFile = path.join(__dirname, '..', '..', 'public', imagePath);
        fs.promises.unlink(oldFile).catch(() => {});
      }
      imagePath = `/uploads/users/${req.file.filename}`;
    }

    const params = [
      name.trim(),
      email.trim().toLowerCase(),
      address.trim(),
      phone.trim(),
      occupancy.trim(),
      birthDate,
      imagePath,
    ];

    let sql = 'UPDATE users SET name=?, email=?, address=?, phone=?, occupancy=?, birth_date=?, image_path=?';

    if (newPassword) {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      sql += ', password_hash=?';
      params.push(passwordHash);
    }

    // Only admins can change the admin flag, and only on other users' profiles.
    if (isAdmin && !isSelf) {
      sql += ', admin=?';
      params.push(adminField === '1' ? 1 : 0);
    }

    sql += ' WHERE id=?';
    params.push(id);

    await run(sql, params);

    // Only update the session when the user is editing their own profile.
    if (isSelf) {
      req.session.user.name = name.trim();
      req.session.user.imagePath = imagePath;
    }

    res.json({
      message: 'Profile updated successfully.',
      user: { id, name: name.trim(), email: email.trim().toLowerCase(), imagePath },
    });
  } catch (error) {
    removeUploadedFile(req.file);

    if (error.code === 'SQLITE_CONSTRAINT') {
      if ((error.message || '').includes('users.email')) {
        res.status(409).json({ message: 'This email is already registered.' });
        return;
      }
      if ((error.message || '').includes('users.phone')) {
        res.status(409).json({ message: 'This phone number is already registered.' });
        return;
      }
      if ((error.message || '').includes('users.address')) {
        res.status(409).json({ message: 'This address is already registered.' });
        return;
      }
      res.status(409).json({ message: 'A unique field already exists.' });
      return;
    }

    res.status(500).json({ message: 'Could not update profile.' });
  }
});

// ── POST /api/users/:id/notes – append a note ───────────────────────────────
router.post('/:id/notes', async (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  const id = parseInt(req.params.id, 10);
  const isSelf = req.session.user.id === id;
  const isAdmin = req.session.user.admin === true;

  if (!isSelf && !isAdmin) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const { content } = req.body;

  if (!String(content || '').trim()) {
    res.status(400).json({ message: 'Note content is required.' });
    return;
  }

  try {
    const createdAt = new Date().toISOString();
    const result = await run(
      'INSERT INTO user_notes (user_id, content, created_at) VALUES (?, ?, ?)',
      [id, content.trim(), createdAt]
    );

    res.status(201).json({
      message: 'Note added.',
      note: { id: result.lastID, content: content.trim(), created_at: createdAt },
    });
  } catch (error) {
    res.status(500).json({ message: 'Could not add note.' });
  }
});

module.exports = router;