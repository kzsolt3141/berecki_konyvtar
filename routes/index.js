const express = require('express');
const router = express.Router();
const { get, all } = require('../db/database');

const PAGE_SIZE = 10;

function buildBooksQuery(q) {
  if (!q) {
    return {
      countSql: 'SELECT COUNT(*) AS total FROM books',
      rowSql: 'SELECT id, genre, isbn, title, author, year, publ, price, image_path FROM books ORDER BY title ASC LIMIT ? OFFSET ?',
      params: [],
    };
  }

  const like = `%${q}%`;
  const where = `WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? OR genre LIKE ?
    OR publ LIKE ? OR ver LIKE ? OR keys LIKE ? OR notes LIKE ? OR year LIKE ? OR price LIKE ?`;
  const whereParams = [like, like, like, like, like, like, like, like, like, like];

  return {
    countSql: `SELECT COUNT(*) AS total FROM books ${where}`,
    rowSql: `SELECT id, genre, isbn, title, author, year, publ, price, image_path FROM books ${where} ORDER BY title ASC LIMIT ? OFFSET ?`,
    params: whereParams,
  };
}

function buildUsersQuery(q) {
  if (!q) {
    return {
      countSql: 'SELECT COUNT(*) AS total FROM users',
      rowSql: 'SELECT id, name, email, address, phone, occupancy, birth_date, image_path, admin, created_at FROM users ORDER BY name ASC LIMIT ? OFFSET ?',
      params: [],
    };
  }

  const like = `%${q}%`;
  const where = `WHERE name LIKE ? OR email LIKE ? OR address LIKE ? OR phone LIKE ?
    OR occupancy LIKE ? OR birth_date LIKE ?`;
  const whereParams = [like, like, like, like, like, like];

  return {
    countSql: `SELECT COUNT(*) AS total FROM users ${where}`,
    rowSql: `SELECT id, name, email, address, phone, occupancy, birth_date, image_path, admin, created_at FROM users ${where} ORDER BY name ASC LIMIT ? OFFSET ?`,
    params: whereParams,
  };
}

function normalizeTotalPages(total) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

router.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/home');
    return;
  }

  res.render('index', { title: 'Home' });
});

router.get('/signup', (req, res) => {
  res.render('signup');
});

router.get('/books/new', async (req, res) => {
  if (!req.session.user || req.session.user.admin !== true) {
    res.redirect('/home');
    return;
  }

  try {
    const genres = await all('SELECT id, name FROM genres ORDER BY name ASC');
    res.render('book-signup', {
      genres,
      book: null,
      loanHistory: [],
      isEditMode: false,
      submitLabel: 'REGISTER BOOK',
      formTitle: 'Register Book',
      formSubtitle: 'Add a new book to the library catalog.',
      backUrl: '/home',
    });
  } catch {
    res.render('book-signup', {
      genres: [],
      book: null,
      loanHistory: [],
      isEditMode: false,
      submitLabel: 'REGISTER BOOK',
      formTitle: 'Register Book',
      formSubtitle: 'Add a new book to the library catalog.',
      backUrl: '/home',
    });
  }
});

router.get('/books/:id/edit', async (req, res) => {
  if (!req.session.user || req.session.user.admin !== true) {
    res.redirect('/home');
    return;
  }

  const id = parseInt(req.params.id, 10);

  try {
    const [book, genres, loanHistory] = await Promise.all([
      get(
        'SELECT id, genre, isbn, title, author, year, publ, ver, keys, price, notes, image_path FROM books WHERE id = ?',
        [id]
      ),
      all('SELECT id, name FROM genres ORDER BY name ASC'),
      all(
        `SELECT loans.id, loans.loan_date, loans.notes, loans.return_date, users.name as user_name
         FROM loans
         LEFT JOIN users ON loans.user_id = users.id
         WHERE loans.book_id = ?
         ORDER BY loans.loan_date DESC`,
        [id]
      ),
    ]);

    if (!book) {
      res.status(404).send('Book not found.');
      return;
    }

    res.render('book-signup', {
      genres,
      book,
      loanHistory: loanHistory || [],
      isEditMode: true,
      submitLabel: 'SAVE CHANGES',
      formTitle: 'Edit Book',
      formSubtitle: 'Update the selected book details.',
      backUrl: '/books',
    });
  } catch (error) {
    res.status(500).send('Could not load book.');
  }
});

router.get('/home', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/');
    return;
  }

  const isAdmin = req.session.user.admin === true;
  const bookQuery = String(req.query.bq || req.query.q || '').trim();
  const bookPage = Math.max(1, parseInt(req.query.bp || req.query.page, 10) || 1);
  const userQuery = String(req.query.uq || '').trim();
  const userPage = Math.max(1, parseInt(req.query.up, 10) || 1);

  let books = [];
  let users = [];
  let bookTotalPages = 1;
  let userTotalPages = 1;
  let allLoans = [];
  let loansByBookId = {};
  let loansByUserId = {};

  try {
    const { countSql: bookCountSql, rowSql: bookRowSql, params: bookParams } = buildBooksQuery(bookQuery);
    const bookOffset = (bookPage - 1) * PAGE_SIZE;

    const queries = [
      get(bookCountSql, bookParams),
      all(bookRowSql, [...bookParams, PAGE_SIZE, bookOffset]),
    ];

    if (isAdmin) {
      const { countSql: userCountSql, rowSql: userRowSql, params: userParams } = buildUsersQuery(userQuery);
      const userOffset = (userPage - 1) * PAGE_SIZE;
      queries.push(get(userCountSql, userParams), all(userRowSql, [...userParams, PAGE_SIZE, userOffset]));
    }

    const results = await Promise.all(queries);
    const bookCount = results[0];
    books = results[1];
    bookTotalPages = normalizeTotalPages(bookCount.total);

    if (isAdmin) {
      const userCount = results[2];
      users = results[3];
      userTotalPages = normalizeTotalPages(userCount.total);

      // Fetch all active loans with book details
      allLoans = await all(
        `SELECT loans.id, loans.book_id, loans.user_id, loans.loan_date, 
                users.name as user_name, users.image_path as user_image_path,
                books.title as book_title, books.author as book_author,
                books.image_path as book_image_path
         FROM loans
         LEFT JOIN users ON loans.user_id = users.id
         LEFT JOIN books ON loans.book_id = books.id
         WHERE loans.return_date IS NULL`
      );

      // Index loans by book_id for quick lookup
      allLoans.forEach(loan => {
        loansByBookId[loan.book_id] = loan;
        
        // Also index by user_id (as array since user can have multiple loans)
        if (!loansByUserId[loan.user_id]) {
          loansByUserId[loan.user_id] = [];
        }
        loansByUserId[loan.user_id].push(loan);
      });
    }

    // Attach loan info to each book
    books = books.map(book => ({
      ...book,
      activeLoan: loansByBookId[book.id] || null,
    }));
  } catch {
    // Keep the page usable even when a query fails.
  }

  res.render('home', {
    name: req.session.user.name,
    imagePath: req.session.user.imagePath,
    isAdmin,
    books,
    users,
    loansByUserId,
    bookQuery,
    bookPage,
    bookTotalPages,
    userQuery,
    userPage,
    userTotalPages,
  });
});

router.get('/profile', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/');
    return;
  }

  try {
    const user = await get(
      'SELECT id, name, email, address, phone, occupancy, birth_date, image_path FROM users WHERE id = ?',
      [req.session.user.id]
    );

    const notes = await all(
      'SELECT id, content, created_at FROM user_notes WHERE user_id = ? ORDER BY created_at ASC',
      [req.session.user.id]
    );

    const loanHistory = await all(
      `SELECT loans.id, loans.loan_date, loans.return_date, loans.notes, books.id AS book_id, books.title AS book_title
       FROM loans
       LEFT JOIN books ON loans.book_id = books.id
       WHERE loans.user_id = ?
       ORDER BY loans.loan_date DESC`,
      [req.session.user.id]
    );

    res.render('profile', {
      user,
      notes,
      loanHistory: loanHistory || [],
      isOwnProfile: true,
      isAdmin: req.session.user.admin === true,
      backUrl: '/home',
    });
  } catch (error) {
    res.status(500).send('Could not load profile.');
  }
});

router.get('/users/:id/edit', async (req, res) => {
  if (!req.session.user || req.session.user.admin !== true) {
    res.redirect('/home');
    return;
  }

  const id = parseInt(req.params.id, 10);

  try {
    const user = await get(
      'SELECT id, name, email, address, phone, occupancy, birth_date, image_path, admin FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      res.status(404).send('User not found.');
      return;
    }

    const [notes, loanHistory] = await Promise.all([
      all('SELECT id, content, created_at FROM user_notes WHERE user_id = ? ORDER BY created_at ASC', [id]),
      all(
        `SELECT loans.id, loans.loan_date, loans.return_date, loans.notes, books.id AS book_id, books.title AS book_title
         FROM loans
         LEFT JOIN books ON loans.book_id = books.id
         WHERE loans.user_id = ?
         ORDER BY loans.loan_date DESC`,
        [id]
      ),
    ]);

    res.render('profile', {
      user,
      notes,
      loanHistory: loanHistory || [],
      isOwnProfile: false,
      isAdmin: true,
      backUrl: '/users',
    });
  } catch (error) {
    res.status(500).send('Could not load user.');
  }
});

router.get('/users', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/');
    return;
  }

  try {
    const users = await all(
      'SELECT id, name, email, address, phone, occupancy, birth_date, image_path, admin, created_at FROM users ORDER BY name ASC'
    );
    res.render('users-list', { users, isAdmin: req.session.user.admin === true });
  } catch (error) {
    res.status(500).send('Could not load users.');
  }
});

router.get('/books', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/');
    return;
  }

  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const { countSql, rowSql, params } = buildBooksQuery(q);

  try {
    const [{ total }, books] = await Promise.all([
      get(countSql, params),
      all(rowSql, [...params, PAGE_SIZE, offset]),
    ]);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    res.render('books-list', { books, q, page, totalPages, isAdmin: req.session.user.admin === true });
  } catch (error) {
    res.status(500).send('Could not load books.');
  }
});

router.get('/reports', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/');
    return;
  }

  try {
    res.render('reports', {
      name: req.session.user.name,
      imagePath: req.session.user.imagePath,
      isAdmin: req.session.user.admin === true,
    });
  } catch (error) {
    res.status(500).send('Could not load reports page.');
  }
});

module.exports = router;
