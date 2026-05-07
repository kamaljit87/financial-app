const { getDb } = require('../models/database');
const { v4: uuidv4 } = require('uuid');

function auditLog({ userId, action, resource, resourceId, ipAddress, userAgent, details, status = 'success' }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource, resource_id, ip_address, user_agent, details, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      userId || null,
      action,
      resource || null,
      resourceId || null,
      ipAddress || null,
      userAgent || null,
      details ? JSON.stringify(details) : null,
      status
    );
  } catch (err) {
    // Never throw from audit logging
  }
}

module.exports = { auditLog };
