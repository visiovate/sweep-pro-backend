/**
 * IP Whitelist Middleware for Admin Access
 * 
 * Restricts admin access to specific IP addresses if configured.
 * If ALLOWED_ADMIN_IPS is not set or empty, this middleware is skipped.
 */

const ipWhitelistMiddleware = (req, res, next) => {
  const allowedIps = process.env.ALLOWED_ADMIN_IPS;
  
  // If no whitelist configured, allow all IPs
  if (!allowedIps || allowedIps.trim() === '') {
    return next();
  }
  
  // Parse allowed IPs (comma-separated)
  const allowedIpList = allowedIps.split(',').map(ip => ip.trim()).filter(ip => ip);
  
  // Get client IP (handle proxy headers)
  const clientIp = req.ip || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  
  // Check if client IP is whitelisted
  if (!allowedIpList.includes(clientIp)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied from this IP address',
      code: 'IP_NOT_ALLOWED'
    });
  }
  
  next();
};

module.exports = { ipWhitelistMiddleware };
