const express = require('express');
const { run, get, all } = require('../../db/database');

const router = express.Router();

// Create a new loan (admin-only)
router.post('/', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.admin !== true) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const { book_id, user_id } = req.body;

    if (!book_id || !user_id) {
      res.status(400).json({ message: 'Book ID and User ID are required.' });
      return;
    }

    // Check if book exists
    const book = await get('SELECT id FROM books WHERE id = ?', [book_id]);
    if (!book) {
      res.status(404).json({ message: 'Book not found.' });
      return;
    }

    // Check if user exists
    const user = await get('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }

    // Check if book is already lent (has active loan)
    const activeLoan = await get(
      'SELECT id FROM loans WHERE book_id = ? AND return_date IS NULL',
      [book_id]
    );
    if (activeLoan) {
      res.status(400).json({ message: 'This book is already lent.' });
      return;
    }

    const loanDate = new Date().toISOString();
    const now = new Date().toISOString();

    const result = await run(
      'INSERT INTO loans (book_id, user_id, loan_date, created_at) VALUES (?, ?, ?, ?)',
      [book_id, user_id, loanDate, now]
    );

    res.json({
      message: 'Loan created successfully.',
      loanId: result.lastID,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Return a book (mark loan as returned, admin-only)
router.put('/:id', async (req, res) => {
  try {
    if (!req.session.user || req.session.user.admin !== true) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;
    const notes = String(req.body?.notes || '').trim() || null;

    // Check if loan exists
    const loan = await get('SELECT * FROM loans WHERE id = ?', [id]);
    if (!loan) {
      res.status(404).json({ message: 'Loan not found.' });
      return;
    }

    // Check if already returned
    if (loan.return_date) {
      res.status(400).json({ message: 'Book already returned.' });
      return;
    }

    const returnDate = new Date().toISOString();

    await run(
      'UPDATE loans SET return_date = ?, notes = ? WHERE id = ?',
      [returnDate, notes, id]
    );

    res.json({ message: 'Book returned successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get loan history for a book
router.get('/book/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    const history = await all(
      `SELECT 
        loans.id,
        loans.book_id,
        loans.user_id,
        loans.loan_date,
        loans.notes,
        loans.return_date,
        users.name as user_name
       FROM loans
       LEFT JOIN users ON loans.user_id = users.id
       WHERE loans.book_id = ?
       ORDER BY loans.loan_date DESC`,
      [bookId]
    );

    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get currently active loan for a book
router.get('/active/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    const activeLoan = await get(
      `SELECT 
        loans.id,
        loans.loan_date,
        users.name as user_name
       FROM loans
       LEFT JOIN users ON loans.user_id = users.id
       WHERE loans.book_id = ? AND loans.return_date IS NULL`,
      [bookId]
    );

    res.json(activeLoan || null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
