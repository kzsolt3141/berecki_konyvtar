const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDirectory = path.join(__dirname, '..', 'data');
const databasePath = path.join(dataDirectory, 'app.db');

fs.mkdirSync(dataDirectory, { recursive: true });

const database = new sqlite3.Database(databasePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function initDatabase() {
  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      admin INTEGER NOT NULL DEFAULT 0,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      occupancy TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      notes TEXT,
      image_path TEXT,
      created_at TEXT NOT NULL
    )`
  );

  // Backward-compatible migration for existing databases created before admin flag existed.
  const userColumns = await all('PRAGMA table_info(users)');
  const hasAdminColumn = userColumns.some((column) => column.name === 'admin');

  if (!hasAdminColumn) {
    await run('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
  }

  await run('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS users_address_unique_idx ON users(address)');

  await run(
    `CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      genre TEXT,
      isbn TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      year TEXT,
      publ TEXT,
      ver TEXT,
      keys TEXT,
      price TEXT,
      notes TEXT,
      image_path TEXT,
      created_at TEXT NOT NULL
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS user_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS genres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      loan_date TEXT NOT NULL,
      notes TEXT,
      return_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS working_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_of_week TEXT NOT NULL,
      open_time TEXT,
      close_time TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  );

  // Backward-compatible migration for loan notes column.
  const loanColumns = await all('PRAGMA table_info(loans)');
  const hasLoanNotesColumn = loanColumns.some((column) => column.name === 'notes');
  if (!hasLoanNotesColumn) {
    await run('ALTER TABLE loans ADD COLUMN notes TEXT');
  }

  // Migrate any pre-existing inline notes to the new user_notes table.
  const usersWithNotes = await all(
    "SELECT id, notes FROM users WHERE notes IS NOT NULL AND TRIM(notes) != ''"
  );
  for (const u of usersWithNotes) {
    const existing = await get(
      'SELECT 1 FROM user_notes WHERE user_id = ? AND content = ?',
      [u.id, u.notes]
    );
    if (!existing) {
      await run(
        'INSERT INTO user_notes (user_id, content, created_at) VALUES (?, ?, ?)',
        [u.id, u.notes, new Date().toISOString()]
      );
    }
  }

  // Initialize with default announcements if none exist
  try {
    const existingAnnouncements = await all('SELECT id FROM announcements LIMIT 1');
    if (!existingAnnouncements || existingAnnouncements.length === 0) {
      const now = new Date().toISOString();
      await run(
        'INSERT INTO announcements (title, content, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
        ['Welcome to Berecki Library', 'Welcome to our municipal library. We are open Monday-Friday 9:00-17:00, Saturday 10:00-14:00, and closed on Sundays.', now, now]
      );
      console.log('✓ Default announcement created');
    }
  } catch (error) {
    console.error('Error initializing announcements:', error);
  }
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

module.exports = {
  databasePath,
  initDatabase,
  run,
  get,
  all,
};