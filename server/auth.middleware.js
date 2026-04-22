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
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
