import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Security configuration
const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = '14d';

// Server startup timestamp - used to invalidate all tokens on restart
// This ensures that when pm2 restarts the API, all users must re-authenticate
let _serverStartupTime = Date.now();

// Generate a cryptographically secure JWT secret
export const generateSecureSecret = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Cache for development JWT secret (persists across function calls)
let _devJWTSecret = null;

// Export getter for server startup time (for logging/debugging)
export const getServerStartupTime = () => _serverStartupTime;

// Get JWT secret from environment or generate one (cached for dev)
const getJWTSecret = () => {
  if (!process.env.JWT_SECRET) {
    if (!_devJWTSecret) {
      console.warn('⚠️  JWT_SECRET not found in environment variables. Generating temporary secret.');
      console.warn('⚠️  For production, set JWT_SECRET environment variable using:');
      console.warn('⚠️  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
      _devJWTSecret = generateSecureSecret();
    }
    return _devJWTSecret;
  }
  return process.env.JWT_SECRET;
};

// Password hashing utilities
export const hashPassword = async (password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    
    console.log(`[AUTH] Password hashed successfully using ${BCRYPT_ROUNDS} rounds`, {
      timestamp: new Date().toISOString(),
      rounds: BCRYPT_ROUNDS
    });
    
    return hash;
  } catch (error) {
    console.error('[AUTH_ERROR] Password hashing failed:', error.message);
    throw new Error('Password hashing failed');
  }
};

export const verifyPassword = async (password, hash) => {
  if (!password || !hash) {
    throw new Error('Password and hash are required');
  }
  
  try {
    const isValid = await bcrypt.compare(password, hash);
    
    console.log(`[AUTH] Password verification ${isValid ? 'successful' : 'failed'}`, {
      timestamp: new Date().toISOString(),
      valid: isValid
    });
    
    return isValid;
  } catch (error) {
    console.error('[AUTH_ERROR] Password verification failed:', error.message);
    throw new Error('Password verification failed');
  }
};

// JWT token utilities
export const generateToken = (userId, role = 'admin', customExpiry = null, additionalPayload = {}) => {
  if (!userId) {
    throw new Error('User ID is required for token generation');
  }

  const payload = {
    userId: parseInt(userId, 10),
    role: String(role),
    type: 'admin_auth',
    iat: Math.floor(Date.now() / 1000),
    serverStart: _serverStartupTime, // Include server startup timestamp
    ...additionalPayload
  };
  
  const options = {
    expiresIn: customExpiry || JWT_EXPIRY,
    issuer: 'flowerpil-admin',
    subject: `admin-${userId}`
  };
  
  try {
    const token = jwt.sign(payload, getJWTSecret(), options);
    
    console.log('[AUTH] JWT token generated successfully', {
      timestamp: new Date().toISOString(),
      userId: payload.userId,
      role: payload.role,
      expiresIn: options.expiresIn,
      type: 'admin_auth'
    });
    
    return token;
  } catch (error) {
    console.error('[AUTH_ERROR] Token generation failed:', error.message);
    throw new Error('Token generation failed');
  }
};

export const verifyToken = (token) => {
  if (!token) {
    throw new Error('Token is required');
  }

  try {
    const decoded = jwt.verify(token, getJWTSecret());

    // Verify token type and structure
    if (!decoded.userId || !decoded.role || decoded.type !== 'admin_auth') {
      throw new Error('Invalid token structure');
    }

    // Verify server startup timestamp - invalidate tokens from previous server instances
    // This ensures all users are logged out when the API is restarted via pm2
    if (decoded.serverStart !== _serverStartupTime) {
      console.warn('[AUTH_WARN] Token from previous server instance', {
        timestamp: new Date().toISOString(),
        tokenServerStart: decoded.serverStart,
        currentServerStart: _serverStartupTime,
        userId: decoded.userId
      });
      throw new Error('Token invalidated by server restart');
    }

    // console.log('[AUTH] JWT token verified successfully', {
    //   timestamp: new Date().toISOString(),
    //   userId: decoded.userId,
    //   role: decoded.role,
    //   type: decoded.type,
    //   exp: new Date(decoded.exp * 1000).toISOString()
    // });

    return {
      userId: decoded.userId,
      role: decoded.role,
      type: decoded.type,
      iat: decoded.iat,
      exp: decoded.exp,
      iss: decoded.iss,
      sub: decoded.sub
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn('[AUTH_WARN] Token expired', {
        timestamp: new Date().toISOString(),
        expiredAt: error.expiredAt
      });
      throw new Error('Token expired');
    }

    if (error.name === 'JsonWebTokenError') {
      console.warn('[AUTH_WARN] Invalid token', {
        timestamp: new Date().toISOString(),
        message: error.message
      });
      throw new Error('Invalid token');
    }

    // Handle server restart invalidation
    if (error.message === 'Token invalidated by server restart') {
      throw error;
    }

    console.error('[AUTH_ERROR] Token verification failed:', error.message);
    throw new Error('Token verification failed');
  }
};

// Token refresh utility
export const refreshToken = (oldToken) => {
  try {
    const decoded = verifyToken(oldToken);
    
    // Generate new token with same user info but fresh expiry
    return generateToken(decoded.userId, decoded.role);
  } catch (error) {
    throw new Error('Cannot refresh invalid token');
  }
};

// Security utilities
export const isTokenExpiringSoon = (token, thresholdMinutes = 60) => {
  try {
    const decoded = verifyToken(token);
    const expirationTime = decoded.exp * 1000; // Convert to milliseconds
    const thresholdTime = Date.now() + (thresholdMinutes * 60 * 1000);
    
    return expirationTime < thresholdTime;
  } catch (error) {
    return true; // Treat invalid tokens as "expiring soon"
  }
};

// Account security utilities
export const isAccountLocked = (user) => {
  if (!user.locked_until) return false;
  
  const lockedUntil = new Date(user.locked_until);
  const now = new Date();
  
  return lockedUntil > now;
};

export const getAccountLockTimeRemaining = (user) => {
  if (!user.locked_until) return 0;
  
  const lockedUntil = new Date(user.locked_until);
  const now = new Date();
  
  return Math.max(0, lockedUntil.getTime() - now.getTime());
};

// Validation utilities
export const validatePassword = (password) => {
  const errors = [];

  if (!password || typeof password !== 'string') {
    errors.push('Password must be provided');
    return { valid: false, errors };
  }

  if (password.length < 10) {
    errors.push('Password must be at least 10 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

export const validateUsername = (username) => {
  const errors = [];
  
  if (!username || typeof username !== 'string') {
    errors.push('Username must be provided');
    return { valid: false, errors };
  }
  
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }
  
  if (username.length > 50) {
    errors.push('Username must be less than 50 characters long');
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};
