const fs = require('fs');
const path = require('path');
const express = require('express');
const archiver = require('archiver');

const router = express.Router();

router.get('/download', async (req, res) => {
  if (!req.session.user || req.session.user.admin !== true) {
    res.status(403).json({ message: 'Admin access required.' });
    return;
  }

  const projectRoot = path.join(__dirname, '..', '..');
  const dataPath = path.join(projectRoot, 'data');
  const uploadsPath = path.join(projectRoot, 'public', 'uploads');

  if (!fs.existsSync(dataPath)) {
    res.status(404).json({ message: 'Data folder not found.' });
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const zipFilename = `backup_${datePart}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (error) => {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to create backup archive.' });
      return;
    }

    res.end();
  });

  archive.pipe(res);

  archive.directory(dataPath, 'data');

  if (fs.existsSync(uploadsPath)) {
    archive.directory(uploadsPath, 'uploads');
  }

  archive.finalize();
});

module.exports = router;
