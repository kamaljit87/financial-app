require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { initDatabase } = require('./models/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const incomeRoutes = require('./routes/income');
const dashboardRoutes = require('./routes/dashboard');
const insightsRoutes = require('./routes/insights');
const exportRoutes = require('./routes/export');
const backupRoutes = require('./routes/backup');
const aiRoutes = require('./routes/ai');
const remindersRoutes = require('./routes/reminders');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the immediate proxy (NPM on host network)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS - only allow frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:7200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Slow down repeated auth attempts (adds 1s delay per request after 3 in window)
const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 3,
  delayMs: (used) => (used - 3) * 1000,
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authSlowDown, authRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/income', incomeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reminders', remindersRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    logger.info('Database initialized successfully');
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`DebtWise API running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app;
