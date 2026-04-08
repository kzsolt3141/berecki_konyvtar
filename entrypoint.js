const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { initDatabase } = require('./db/database');
const indexRouter = require('./routes/index');
const userApiRouter = require('./routes/api/users');
const authApiRouter = require('./routes/api/auth');
const bookApiRouter = require('./routes/api/books');
const loanApiRouter = require('./routes/api/loans');
const reportApiRouter = require('./routes/api/reports');
const backupApiRouter = require('./routes/api/backup');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const user = req.session && req.session.user ? req.session.user.email : 'anonymous';
  const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  let location = 'unknown';

  const logMessage = `[${timestamp}] ${req.method} ${req.url} - User: ${user} - IP: ${ip} - Location: ${location}\n`;

  // Print to console
  console.log(logMessage.trim());

  // Log to file
  fs.appendFile(path.join(__dirname, 'activity.txt'), logMessage, (err) => {
    if (err) {
      console.error('Failed to write to activity.txt:', err);
    }
  });

  // Async location lookup using ipapi.co
  if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'unknown' && !ip.startsWith('192.168.') && !ip.startsWith('10.') && !ip.startsWith('172.')) {
    fetch(`https://ipapi.co/${ip}/json/`)
      .then(res => res.json())
      .then(data => {
        if (data.city && data.country_name) {
          location = `${data.city}, ${data.country_name}`;
          const updateMessage = `[${timestamp}] ${req.method} ${req.url} - User: ${user} - IP: ${ip} - Location: ${location}\n`;
          fs.appendFile(path.join(__dirname, 'activity.txt'), `UPDATE: ${updateMessage}`, (err) => {
            if (err) {
              console.error('Failed to update activity.txt:', err);
            }
          });
        }
      })
      .catch(err => {
        // Silently fail location lookup
      });
  }

  next();
});

// Routes
app.use('/', indexRouter);
app.use('/api/users', userApiRouter);
app.use('/api/auth', authApiRouter);
app.use('/api/books', bookApiRouter);
app.use('/api/loans', loanApiRouter);
app.use('/api/reports', reportApiRouter);
app.use('/api/backup', backupApiRouter);

// Global error handler — returns JSON for API routes
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || 'Server error.' });
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize the database.', error);
    process.exit(1);
  });
