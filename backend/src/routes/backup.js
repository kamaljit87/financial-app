const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

const BACKUP_DIR = process.env.BACKUP_PATH || '/data/backups';

router.post('/create', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const db = getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.db`);
    db.backup(backupPath);
    auditLog({ userId: req.user.id, action: 'BACKUP_CREATED', details: { path: backupPath } });
    res.json({ message: 'Backup created', filename: `backup-${timestamp}.db`, path: backupPath });
  } catch (err) {
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

router.get('/list', (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [] });
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stats = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stats.size, created_at: stats.ctime };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ backups: files });
});

router.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.db') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found' });
  auditLog({ userId: req.user.id, action: 'BACKUP_DOWNLOADED', details: { filename } });
  res.download(filePath);
});

router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename.endsWith('.db') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found' });
  fs.unlinkSync(filePath);
  res.json({ message: 'Backup deleted' });
});

module.exports = router;
