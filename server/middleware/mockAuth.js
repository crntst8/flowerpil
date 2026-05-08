import { generateToken } from '../utils/authUtils.js';
import { getQueries, getDatabase } from '../database/db.js';

// Mock user configurations for development
const MOCK_USERS = {
  admin: {
    id: 999,
    username: 'dev-admin@flowerpil.io',
    role: 'admin',
    curator_id: null,
    password_hash: 'mock',
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString()
  },
  curator: {
    id: 998,
    username: 'dev-curator@flowerpil.io',
    role: 'curator',
    curator_id: 1000,
    password_hash: 'mock',
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString()
  },
  'site-admin': {
    id: 997,
    username: 'dev-siteadmin@flowerpil.io',
    role: 'admin',
    curator_id: null,
    password_hash: 'mock',
    is_active: 1,
    failed_login_attempts: 0,
    locked_until: null,
    last_login: new Date().toISOString(),
    created_at: new Date().toISOString()
  }
};

// Mock curator profile for the curator user
const MOCK_CURATOR_PROFILE = {
  id: 1000,
  name: 'Dev Curator',
  profile_type: 'curator',
  bio: 'Development test curator account',
  bio_short: 'Test curator',
  profile_image: '',
  location: 'Development',
  website_url: '',
  contact_email: 'dev-curator@flowerpil.io',
  spotify_url: '',
  apple_url: '',
  tidal_url: '',
  bandcamp_url: '',
  social_links: '[]',
  external_links: '[]',
  verification_status: 'verified',
  profile_visibility: 'public',
  upcoming_releases_enabled: 0,
  upcoming_shows_enabled: 0,
  custom_fields: '{}',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

/**
 * Creates mock authentication middleware for development
 * Automatically authenticates requests with mock users based on query parameter
 * Usage: ?auth=admin | ?auth=curator | ?auth=site-admin
 *
 * This should ONLY be used in development environments
 */
export const mockAuthMiddleware = async (req, res, next) => {
  // Only run in development
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }

  // Check if mock auth is enabled
  if (process.env.MOCK_AUTH_ENABLED !== 'true') {
    return next();
  }

  try {
    // Check for auth query parameter
    const authType = req.query.auth || req.headers['x-mock-auth'];

    if (!authType || !MOCK_USERS[authType]) {
      return next();
    }

    const mockUser = MOCK_USERS[authType];

    console.log('[MOCK_AUTH] Authenticating as mock user', {
      timestamp: new Date().toISOString(),
      authType,
      userId: mockUser.id,
      username: mockUser.username,
      role: mockUser.role,
      path: req.path,
      ip: req.ip
    });

    // Ensure mock users exist in database (create if not exists)
    await ensureMockUsersExist();

    // Set up request as if user is authenticated
    req.user = {
      id: mockUser.id,
      username: mockUser.username,
      role: mockUser.role,
      curator_id: mockUser.curator_id,
      lastLogin: mockUser.last_login,
      createdAt: mockUser.created_at
    };

    // Generate a mock token for consistency
    const token = generateToken(mockUser.id, mockUser.role, null,
      mockUser.curator_id ? { curator_id: mockUser.curator_id } : {}
    );

    req.tokenInfo = {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      type: 'mock'
    };

    // Set cookie for frontend compatibility
    const cookieOptions = {
      httpOnly: true,
      secure: false, // Development uses HTTP
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    };

    res.cookie('auth_token', token, cookieOptions);

    next();

  } catch (error) {
    console.error('[MOCK_AUTH] Error in mock authentication:', error);
    next();
  }
};

/**
 * Ensures mock users and related data exist in the database
 */
async function ensureMockUsersExist() {
  try {
    const queries = getQueries();

    // Check and create mock users
    for (const [authType, userData] of Object.entries(MOCK_USERS)) {
      const existing = queries.findAdminUserById.get(userData.id);

      if (!existing) {
        console.log(`[MOCK_AUTH] Creating mock user: ${authType} (${userData.username})`);

        // Insert mock user
        const db = getDatabase();
        db.prepare(`
          INSERT OR REPLACE INTO admin_users (
            id, username, password_hash, role, is_active,
            failed_login_attempts, locked_until, last_login, created_at,
            curator_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userData.id,
          userData.username,
          userData.password_hash,
          userData.role,
          userData.is_active,
          userData.failed_login_attempts,
          userData.locked_until,
          userData.last_login,
          userData.created_at,
          userData.curator_id
        );
      }
    }

    // Create mock curator profile if needed
    const db = getDatabase();
    const existingCurator = db.prepare('SELECT id FROM curators WHERE id = ?').get(MOCK_CURATOR_PROFILE.id);

    if (!existingCurator) {
      console.log('[MOCK_AUTH] Creating mock curator profile');

      db.prepare(`
        INSERT OR REPLACE INTO curators (
          id, name, profile_type, bio, bio_short, profile_image,
          location, website_url, contact_email, spotify_url, apple_url,
          tidal_url, bandcamp_url, social_links, external_links,
          verification_status, profile_visibility, upcoming_releases_enabled,
          upcoming_shows_enabled, custom_fields, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        MOCK_CURATOR_PROFILE.id,
        MOCK_CURATOR_PROFILE.name,
        MOCK_CURATOR_PROFILE.profile_type,
        MOCK_CURATOR_PROFILE.bio,
        MOCK_CURATOR_PROFILE.bio_short,
        MOCK_CURATOR_PROFILE.profile_image,
        MOCK_CURATOR_PROFILE.location,
        MOCK_CURATOR_PROFILE.website_url,
        MOCK_CURATOR_PROFILE.contact_email,
        MOCK_CURATOR_PROFILE.spotify_url,
        MOCK_CURATOR_PROFILE.apple_url,
        MOCK_CURATOR_PROFILE.tidal_url,
        MOCK_CURATOR_PROFILE.bandcamp_url,
        MOCK_CURATOR_PROFILE.social_links,
        MOCK_CURATOR_PROFILE.external_links,
        MOCK_CURATOR_PROFILE.verification_status,
        MOCK_CURATOR_PROFILE.profile_visibility,
        MOCK_CURATOR_PROFILE.upcoming_releases_enabled,
        MOCK_CURATOR_PROFILE.upcoming_shows_enabled,
        MOCK_CURATOR_PROFILE.custom_fields,
        MOCK_CURATOR_PROFILE.created_at,
        MOCK_CURATOR_PROFILE.updated_at
      );
    }

  } catch (error) {
    console.error('[MOCK_AUTH] Error ensuring mock users exist:', error);
  }
}

/**
 * Mock login endpoint that returns user info based on mock auth type
 */
export const handleMockLogin = async (req, res) => {
  if (process.env.NODE_ENV !== 'development' || process.env.MOCK_AUTH_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { authType } = req.body;

  if (!authType || !MOCK_USERS[authType]) {
    return res.status(400).json({
      error: 'Invalid auth type',
      availableTypes: Object.keys(MOCK_USERS)
    });
  }

  const mockUser = MOCK_USERS[authType];

  // Ensure mock users exist
  await ensureMockUsersExist();

  // Generate token
  const token = generateToken(mockUser.id, mockUser.role, null,
    mockUser.curator_id ? { curator_id: mockUser.curator_id } : {}
  );

  // Set cookie
  const cookieOptions = {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  };

  res.cookie('auth_token', token, cookieOptions);

  console.log('[MOCK_AUTH] Mock login successful', {
    timestamp: new Date().toISOString(),
    authType,
    userId: mockUser.id,
    username: mockUser.username,
    role: mockUser.role,
    ip: req.ip
  });

  res.json({
    success: true,
    message: `Mock login as ${authType}`,
    user: {
      id: mockUser.id,
      username: mockUser.username,
      role: mockUser.role,
      curator_id: mockUser.curator_id,
      lastLogin: mockUser.last_login,
      createdAt: mockUser.created_at
    },
    tokenExpiry: new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString(),
    mockAuth: true
  });
};

export default mockAuthMiddleware;