import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = Router();

// Function to get site password (loaded at runtime)
function getSitePassword() {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    throw new Error('SITE_PASSWORD environment variable not set');
  }
  return password;
}

// Function to get JWT secret (loaded at runtime)
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable not set');
  }
  return secret;
}

// Generate a secure random token for site access
function generateSiteAccessToken() {
  return jwt.sign(
    { 
      access: 'site',
      timestamp: Date.now(),
      // Add random data to make tokens unique
      nonce: crypto.randomBytes(16).toString('hex')
    },
    getJwtSecret(),
    { 
      expiresIn: '24h',
      issuer: 'flowerpil-site-access'
    }
  );
}

// Verify site access password
router.post('/', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        error: 'Password required' 
      });
    }

    // Use crypto.timingSafeEqual to prevent timing attacks
    const sitePassword = getSitePassword();
    const providedPassword = Buffer.from(password, 'utf8');
    const correctPassword = Buffer.from(sitePassword, 'utf8');

    // Pad to same length to prevent timing attacks
    const maxLength = Math.max(providedPassword.length, correctPassword.length);
    const paddedProvided = Buffer.alloc(maxLength);
    const paddedCorrect = Buffer.alloc(maxLength);
    
    providedPassword.copy(paddedProvided);
    correctPassword.copy(paddedCorrect);

    const isValid = crypto.timingSafeEqual(paddedProvided, paddedCorrect) && 
                   providedPassword.length === correctPassword.length;

    if (isValid) {
      const token = generateSiteAccessToken();
      
      // Log successful access
      console.log(`[SITE-ACCESS] Successful authentication from IP: ${req.ip}`);
      
      res.json({ 
        success: true,
        token,
        expiresIn: '24h'
      });
    } else {
      // Log failed attempt
      console.log(`[SITE-ACCESS] Failed authentication attempt from IP: ${req.ip}`);
      
      // Add small delay to prevent brute force
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      res.status(401).json({ 
        error: 'Invalid password' 
      });
    }
  } catch (error) {
    console.error('[SITE-ACCESS] Error:', error);
    res.status(500).json({ 
      error: 'Server error' 
    });
  }
});

// Verify site access token (for future use)
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Token required' 
      });
    }

    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: 'flowerpil-site-access'
    });

    if (decoded.access === 'site') {
      res.json({ 
        valid: true,
        expiresAt: decoded.exp * 1000
      });
    } else {
      res.status(401).json({ 
        error: 'Invalid token' 
      });
    }
  } catch (error) {
    res.status(401).json({ 
      error: 'Invalid token' 
    });
  }
});

export default router;