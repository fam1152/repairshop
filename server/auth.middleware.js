const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  let token = null;
  const header = req.headers.authorization;
  if (header) {
    token = header.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const db = require('./db');
    const settings = db.prepare('SELECT jwt_secret FROM settings WHERE id=1').get();
    const secret = process.env.JWT_SECRET || settings?.jwt_secret || 'devsecret';
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
