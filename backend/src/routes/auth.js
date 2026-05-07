const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../models/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditLog } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();
const SALT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

function generateToken(userId, rememberMe = false) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '30d' : process.env.JWT_EXPIRES_IN || '24h' }
  );
}

// Check if any user exists (for first-run setup)
router.get('/setup-status', (req, res) => {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  res.json({ setupRequired: userCount.count === 0 });
});

// Register first admin user
router.post('/register',
  [
    body('username').trim()
      .isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
    body('email').trim()
      .isEmail().withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number'),
    body('confirmPassword').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validate,
  async (req, res) => {
    try {
      const db = getDb();
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      if (userCount.count > 0) {
        return res.status(403).json({ error: 'Registration is closed. Admin user already exists.' });
      }

      const { username, email, password } = req.body;
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
      if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = uuidv4();

      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, 'admin')
      `).run(userId, username, email, passwordHash);

      // Create default settings
      db.prepare(`
        INSERT INTO settings (id, user_id) VALUES (?, ?)
      `).run(uuidv4(), userId);

      auditLog({ userId, action: 'REGISTER', ipAddress: req.ip, userAgent: req.get('User-Agent') });

      const token = generateToken(userId);
      res.status(201).json({
        message: 'Account created successfully',
        token,
        user: { id: userId, username, email, role: 'admin' },
      });
    } catch (err) {
      logger.error('Registration error', { error: err.message });
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  [
    body('email').trim().isEmail().withMessage('Please enter a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res) => {
    const { email, password, rememberMe } = req.body;
    const db = getDb();

    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      if (!user) {
        auditLog({ action: 'LOGIN_FAILED', details: { email }, ipAddress: req.ip, status: 'failure' });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check lockout
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const unlockTime = new Date(user.locked_until);
        auditLog({ userId: user.id, action: 'LOGIN_LOCKED', ipAddress: req.ip, status: 'failure' });
        return res.status(423).json({
          error: `Account locked. Try again after ${unlockTime.toLocaleTimeString()}`,
          code: 'ACCOUNT_LOCKED',
        });
      }

      const passwordValid = await bcrypt.compare(password, user.password_hash);

      if (!passwordValid) {
        const newAttempts = user.failed_login_attempts + 1;
        let lockedUntil = null;

        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockDate = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          lockedUntil = lockDate.toISOString();
          logger.warn(`Account locked for user ${user.email} after ${newAttempts} failed attempts`);
        }

        db.prepare(`
          UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?
        `).run(newAttempts, lockedUntil, user.id);

        auditLog({ userId: user.id, action: 'LOGIN_FAILED', ipAddress: req.ip, status: 'failure' });

        if (lockedUntil) {
          return res.status(423).json({ error: `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`, code: 'ACCOUNT_LOCKED' });
        }

        return res.status(401).json({
          error: 'Invalid credentials',
          attemptsRemaining: MAX_FAILED_ATTEMPTS - newAttempts,
        });
      }

      // Successful login
      db.prepare(`
        UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = datetime('now') WHERE id = ?
      `).run(user.id);

      auditLog({ userId: user.id, action: 'LOGIN_SUCCESS', ipAddress: req.ip, userAgent: req.get('User-Agent') });

      const token = generateToken(user.id, rememberMe);

      if (rememberMe) {
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }

      res.json({
        message: 'Login successful',
        token,
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
      });
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Logout
router.post('/logout', authenticate, (req, res) => {
  auditLog({ userId: req.user.id, action: 'LOGOUT', ipAddress: req.ip });
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
  res.json({ user: req.user, settings });
});

// Change password
router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain uppercase, lowercase, and a number'),
  ],
  validate,
  async (req, res) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const valid = await bcrypt.compare(req.body.currentPassword, user.password_hash);

      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(req.body.newPassword, SALT_ROUNDS);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(newHash, req.user.id);

      auditLog({ userId: req.user.id, action: 'PASSWORD_CHANGED', ipAddress: req.ip });
      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Password change failed' });
    }
  }
);

// Update settings
router.put('/settings', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const allowed = ['currency', 'currency_symbol', 'theme', 'date_format', 'debt_warning_threshold', 'spending_warning_threshold', 'monthly_budget', 'notifications_enabled'];
    const updates = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE settings SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`)
      .run(...Object.values(updates), req.user.id);

    const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Settings update failed' });
  }
});

module.exports = router;
