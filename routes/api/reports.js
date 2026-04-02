const express = require('express');
const router = express.Router();
const { all } = require('../../db/database');

// Report 1: Loans by Date Range
router.get('/loans-by-date', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Start date and end date are required.' });
  }

  try {
    const loans = await all(
      `SELECT 
        loans.id,
        loans.loan_date,
        loans.return_date,
        users.id AS user_id,
        users.name AS user_name,
        users.birth_date,
        books.id AS book_id,
        books.title AS book_title,
        books.author AS book_author
      FROM loans
      LEFT JOIN users ON loans.user_id = users.id
      LEFT JOIN books ON loans.book_id = books.id
      WHERE DATE(loans.loan_date) >= ? AND DATE(loans.loan_date) <= ?
      ORDER BY loans.loan_date DESC`,
      [startDate, endDate]
    );

    res.json({ loans });
  } catch (error) {
    console.error('Error fetching loans by date:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

// Report 2: Loans by Borrower Age (Current Year)
router.get('/loans-by-age', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { startAge, endAge } = req.query;

  if (!startAge || !endAge) {
    return res.status(400).json({ message: 'Start age and end age are required.' });
  }

  const currentYear = new Date().getFullYear();
  const startOfYear = `${currentYear}-01-01`;
  const endOfYear = `${currentYear}-12-31`;

  try {
    const loans = await all(
      `SELECT 
        loans.id,
        loans.loan_date,
        loans.return_date,
        users.id AS user_id,
        users.name AS user_name,
        users.birth_date,
        CAST((? - CAST(SUBSTR(users.birth_date, 1, 4) AS INTEGER)) AS INTEGER) AS user_age,
        books.id AS book_id,
        books.title AS book_title,
        books.author AS book_author
      FROM loans
      LEFT JOIN users ON loans.user_id = users.id
      LEFT JOIN books ON loans.book_id = books.id
      WHERE CAST((? - CAST(SUBSTR(users.birth_date, 1, 4) AS INTEGER)) AS INTEGER) >= ? 
        AND CAST((? - CAST(SUBSTR(users.birth_date, 1, 4) AS INTEGER)) AS INTEGER) <= ?
        AND DATE(loans.loan_date) >= ? AND DATE(loans.loan_date) <= ?
      ORDER BY loans.loan_date DESC`,
      [currentYear, currentYear, startAge, currentYear, endAge, startOfYear, endOfYear]
    );

    res.json({ loans });
  } catch (error) {
    console.error('Error fetching loans by age:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

// Report 3: Users with active loans, sorted by active loan count
router.get('/users-active-loans', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const users = await all(
      `SELECT
        users.id AS user_id,
        users.name AS user_name,
        COUNT(loans.id) AS active_loans
      FROM users
      INNER JOIN loans ON loans.user_id = users.id
      WHERE loans.return_date IS NULL
      GROUP BY users.id, users.name
      ORDER BY active_loans DESC, users.name ASC`
    );

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users with active loans:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

// Report 4: Books currently lent (active loans)
router.get('/books-lent-now', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const books = await all(
      `SELECT
        books.id AS book_id,
        books.title AS book_title,
        books.author AS book_author,
        users.id AS user_id,
        users.name AS user_name,
        loans.loan_date
      FROM loans
      INNER JOIN books ON loans.book_id = books.id
      INNER JOIN users ON loans.user_id = users.id
      WHERE loans.return_date IS NULL
      ORDER BY loans.loan_date DESC`
    );

    res.json({ books });
  } catch (error) {
    console.error('Error fetching books lent now:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

// Report 5: Users by total number of loans
router.get('/users-total-loans', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const users = await all(
      `SELECT
        users.id AS user_id,
        users.name AS user_name,
        COUNT(loans.id) AS total_loans
      FROM users
      LEFT JOIN loans ON loans.user_id = users.id
      GROUP BY users.id, users.name
      ORDER BY total_loans DESC, users.name ASC`
    );

    res.json({ users });
  } catch (error) {
    console.error('Error fetching users by total loans:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

// Report 6: Books sorted by total number of loans
router.get('/books-total-loans', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const books = await all(
      `SELECT
        books.id AS book_id,
        books.title AS book_title,
        books.author AS book_author,
        COUNT(loans.id) AS total_loans
      FROM books
      LEFT JOIN loans ON loans.book_id = books.id
      GROUP BY books.id, books.title, books.author
      ORDER BY total_loans DESC, books.title ASC`
    );

    res.json({ books });
  } catch (error) {
    console.error('Error fetching books by total loans:', error);
    res.status(500).json({ message: 'Failed to generate report.' });
  }
});

module.exports = router;
