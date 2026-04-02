const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { run, get, all } = require('../../db/database');

const router = express.Router();
const uploadDirectory = path.join(__dirname, '..', '..', 'public', 'uploads', 'books');

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

async function generateNextIsbn() {
  const latestNumericIsbn = await get(
    `SELECT isbn
     FROM books
     WHERE TRIM(isbn) != '' AND isbn GLOB '[0-9]*'
     ORDER BY CAST(isbn AS INTEGER) DESC
     LIMIT 1`
  );

  return String((parseInt(latestNumericIsbn?.isbn, 10) || 0) + 1);
}

// ── GET /api/books/genres ──────────────────────────────────────────────────
router.get('/genres', async (_req, res) => {
  try {
    const genres = await all('SELECT id, name FROM genres ORDER BY name ASC');
    res.json({ genres });
  } catch {
    res.status(500).json({ message: 'Could not fetch genres.' });
  }
});

// ── POST /api/books/genres ──────────────────────────────────────────────────
router.post('/genres', async (req, res) => {
  if (!req.session || !req.session.user) {
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  if (req.session.user.admin !== true) {
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const name = String(req.body.name || '').trim().toLowerCase();

  if (!name) {
    res.status(400).json({ message: 'Genre name is required.' });
    return;
  }

  try {
    const existing = await get('SELECT id FROM genres WHERE name = ?', [name]);

    if (existing) {
      res.status(409).json({ message: `Genre "${name}" already exists.` });
      return;
    }

    const result = await run('INSERT INTO genres (name) VALUES (?)', [name]);
    res.status(201).json({ genre: { id: result.lastID, name } });
  } catch {
    res.status(500).json({ message: 'Could not add genre.' });
  }
});

router.post('/', upload.single('image'), async (req, res) => {
  if (!req.session?.user) {
    removeUploadedFile(req.file);
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  if (req.session.user.admin !== true) {
    removeUploadedFile(req.file);
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const {
    genre,
    isbn,
    title,
    author,
    year,
    publ,
    ver,
    keys,
    price,
    notes,
  } = req.body;

  if (![title, author].every((value) => String(value || '').trim())) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Title and author are required.' });
    return;
  }

  try {
    const createdAt = new Date().toISOString();
    const imagePath = req.file ? `/uploads/books/${req.file.filename}` : null;
    const resolvedIsbn = String(isbn || '').trim() || await generateNextIsbn();

    const result = await run(
      `INSERT INTO books (
        genre,
        isbn,
        title,
        author,
        year,
        publ,
        ver,
        keys,
        price,
        notes,
        image_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (genre || '').trim(),
        resolvedIsbn,
        title.trim(),
        author.trim(),
        (year || '').trim(),
        (publ || '').trim(),
        (ver || '').trim(),
        (keys || '').trim(),
        (price || '').trim(),
        (notes || '').trim(),
        imagePath,
        createdAt,
      ]
    );

    res.status(201).json({
      message: 'Book registered successfully.',
      book: {
        id: result.lastID,
        isbn: resolvedIsbn,
        title: title.trim(),
        imagePath,
      },
    });
  } catch (error) {
    removeUploadedFile(req.file);

    if (error.code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ message: 'A book with this ISBN already exists.' });
      return;
    }

    res.status(500).json({ message: 'Could not register the book.' });
  }
});

router.put('/:id', upload.single('image'), async (req, res) => {
  if (!req.session?.user) {
    removeUploadedFile(req.file);
    res.status(401).json({ message: 'Not authenticated.' });
    return;
  }

  if (req.session.user.admin !== true) {
    removeUploadedFile(req.file);
    res.status(403).json({ message: 'Forbidden.' });
    return;
  }

  const id = parseInt(req.params.id, 10);
  const {
    genre,
    isbn,
    title,
    author,
    year,
    publ,
    ver,
    keys,
    price,
    notes,
  } = req.body;

  if (![title, author].every((value) => String(value || '').trim())) {
    removeUploadedFile(req.file);
    res.status(400).json({ message: 'Title and author are required.' });
    return;
  }

  try {
    const existing = await get('SELECT image_path, isbn FROM books WHERE id = ?', [id]);

    if (!existing) {
      removeUploadedFile(req.file);
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    let imagePath = existing.image_path;

    if (req.file) {
      if (imagePath) {
        const oldFile = path.join(__dirname, '..', '..', 'public', imagePath);
        fs.promises.unlink(oldFile).catch(() => {});
      }
      imagePath = `/uploads/books/${req.file.filename}`;
    }

    const resolvedIsbn = String(isbn || '').trim() || existing.isbn || await generateNextIsbn();

    await run(
      `UPDATE books
       SET genre = ?, isbn = ?, title = ?, author = ?, year = ?, publ = ?, ver = ?, keys = ?, price = ?, notes = ?, image_path = ?
       WHERE id = ?`,
      [
        String(genre || '').trim(),
        resolvedIsbn,
        title.trim(),
        author.trim(),
        String(year || '').trim(),
        String(publ || '').trim(),
        String(ver || '').trim(),
        String(keys || '').trim(),
        String(price || '').trim(),
        String(notes || '').trim(),
        imagePath,
        id,
      ]
    );

    res.json({
      message: 'Book updated successfully.',
      book: {
        id,
        isbn: resolvedIsbn,
        title: title.trim(),
        imagePath,
      },
    });
  } catch (error) {
    removeUploadedFile(req.file);

    if (error.code === 'SQLITE_CONSTRAINT') {
      res.status(409).json({ message: 'A book with this ISBN already exists.' });
      return;
    }

    res.status(500).json({ message: 'Could not update the book.' });
  }
});

router.use((error, _req, res, _next) => {
  res.status(400).json({ message: error.message || 'Invalid upload.' });
});

module.exports = router;