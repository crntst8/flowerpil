import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve database path with proper fallback
const getDBPath = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace('sqlite://', '');
  }

  if (process.env.DATABASE_PATH) {
    // If path is relative, resolve from project root
    if (process.env.DATABASE_PATH.startsWith('./')) {
      return join(__dirname, '../..', process.env.DATABASE_PATH);
    }
    return process.env.DATABASE_PATH;
  }

  // Default fallback
  return join(__dirname, '../../data/flowerpil.db');
};

const DB_PATH = getDBPath();


let db = null;
let schemaInitialized = false;

const ensurePlaylistCustomActionColumns = (database) => {
  if (!database) return;
  const statements = [
    'ALTER TABLE playlists ADD COLUMN custom_action_label TEXT',
    'ALTER TABLE playlists ADD COLUMN custom_action_url TEXT',
    'ALTER TABLE playlists ADD COLUMN custom_action_icon TEXT',
    'ALTER TABLE playlists ADD COLUMN custom_action_icon_source TEXT'
  ];

  for (const statement of statements) {
    try {
      database.exec(statement);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('duplicate column name') && !message.includes('no such table')) {
        throw error;
      }
    }
  }
};

const ensurePlaylistAutoReferralColumn = (database) => {
  if (!database) return;

  try {
    database.exec('ALTER TABLE playlists ADD COLUMN auto_referral_enabled INTEGER DEFAULT 0');
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name') && !message.includes('no such table')) {
      throw error;
    }
  }
};

const ensurePlaylistPublishedAtColumn = (database) => {
  if (!database) return;

  try {
    database.exec('ALTER TABLE playlists ADD COLUMN published_at DATETIME');
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('duplicate column name') && !message.includes('no such table')) {
      throw error;
    }
  }

  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_playlists_published_at
      ON playlists(published, published_at DESC)
    `);
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('no such table')) {
      throw error;
    }
  }

  try {
    database.exec(`
      UPDATE playlists
      SET published_at = CASE
        WHEN publish_date IS NOT NULL AND publish_date != ''
          THEN datetime(publish_date || ' 00:00:00', '+' || (ABS(id) % 86400) || ' seconds')
        ELSE COALESCE(created_at, CURRENT_TIMESTAMP)
      END
      WHERE published = 1 AND (published_at IS NULL OR published_at = '');
    `);
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('no such table')) {
      throw error;
    }
  }
};

const ensureTrackExtendedColumns = (database) => {
  if (!database) return;
  const statements = [
    'ALTER TABLE tracks ADD COLUMN soundcloud_url TEXT',
    'ALTER TABLE tracks ADD COLUMN quote TEXT',
    'ALTER TABLE tracks ADD COLUMN apple_music_url TEXT',
    'ALTER TABLE tracks ADD COLUMN tidal_url TEXT',
    'ALTER TABLE tracks ADD COLUMN custom_sources TEXT',
    "ALTER TABLE tracks ADD COLUMN linking_status TEXT DEFAULT 'pending'",
    'ALTER TABLE tracks ADD COLUMN match_confidence_apple INTEGER',
    'ALTER TABLE tracks ADD COLUMN match_confidence_tidal INTEGER',
    'ALTER TABLE tracks ADD COLUMN match_source_apple TEXT',
    'ALTER TABLE tracks ADD COLUMN match_source_tidal TEXT',
    'ALTER TABLE tracks ADD COLUMN flagged_for_review BOOLEAN DEFAULT 0',
    'ALTER TABLE tracks ADD COLUMN linking_max_age_exceeded BOOLEAN DEFAULT 0',
    'ALTER TABLE tracks ADD COLUMN linking_updated_at DATETIME',
    'ALTER TABLE tracks ADD COLUMN linking_error TEXT',
    'ALTER TABLE tracks ADD COLUMN manual_override_apple TEXT',
    'ALTER TABLE tracks ADD COLUMN manual_override_tidal TEXT',
    'ALTER TABLE tracks ADD COLUMN flagged_reason TEXT',
    'ALTER TABLE tracks ADD COLUMN manual_override_reason TEXT'
  ];

  for (const statement of statements) {
    try {
      database.exec(statement);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('duplicate column name') && !message.includes('no such table')) {
        throw error;
      }
    }
  }

  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_tracks_linking_status ON tracks(linking_status)',
    'CREATE INDEX IF NOT EXISTS idx_tracks_flagged_review ON tracks(flagged_for_review)',
    'CREATE INDEX IF NOT EXISTS idx_tracks_apple_confidence ON tracks(match_confidence_apple)',
    'CREATE INDEX IF NOT EXISTS idx_tracks_tidal_confidence ON tracks(match_confidence_tidal)',
    'CREATE INDEX IF NOT EXISTS idx_tracks_linking_updated ON tracks(linking_updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_tracks_linking_deadletter ON tracks(linking_max_age_exceeded, linking_updated_at)'
  ];

  for (const statement of indexStatements) {
    try {
      database.exec(statement);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }
};

const ensureFeaturePieceColumns = (database) => {
  if (!database) return;

  const columnStatements = [
    'ALTER TABLE feature_pieces ADD COLUMN curator_id INTEGER',
    'ALTER TABLE feature_pieces ADD COLUMN excerpt TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN seo_title TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN seo_description TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN canonical_url TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN newsletter_cta_label TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN newsletter_cta_url TEXT',
    'ALTER TABLE feature_pieces ADD COLUMN featured_on_homepage INTEGER DEFAULT 0',
    'ALTER TABLE feature_pieces ADD COLUMN homepage_display_order INTEGER DEFAULT 0',
    'ALTER TABLE feature_pieces ADD COLUMN view_count INTEGER DEFAULT 0',
    'ALTER TABLE feature_pieces ADD COLUMN last_viewed_at DATETIME'
  ];

  for (const statement of columnStatements) {
    try {
      database.exec(statement);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('duplicate column name') && !message.includes('no such table')) {
        throw error;
      }
    }
  }

  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_feature_pieces_curator ON feature_pieces(curator_id)',
    'CREATE INDEX IF NOT EXISTS idx_feature_pieces_homepage ON feature_pieces(featured_on_homepage, homepage_display_order)',
    'CREATE INDEX IF NOT EXISTS idx_feature_pieces_view_count ON feature_pieces(view_count DESC)'
  ];

  for (const statement of indexStatements) {
    try {
      database.exec(statement);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('already exists') && !message.includes('no such table')) {
        throw error;
      }
    }
  }

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS feature_piece_flag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_piece_id INTEGER NOT NULL,
        flag_id INTEGER NOT NULL,
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (feature_piece_id, flag_id),
        FOREIGN KEY (feature_piece_id) REFERENCES feature_pieces(id) ON DELETE CASCADE,
        FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_piece
      ON feature_piece_flag_assignments(feature_piece_id)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_flag
      ON feature_piece_flag_assignments(flag_id)
    `);
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('no such table')) {
      throw error;
    }
  }
};

export const getDatabase = () => {
  if (!db) {
    // Ensure data directory exists
    const dbDir = dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 30000'); // 30 seconds - increased for multi-process contention
    db.pragma('foreign_keys = ON');

    // Best-effort ensure critical playlist columns exist before any prepared statements run
    try {
      ensurePlaylistCustomActionColumns(db);
      ensurePlaylistAutoReferralColumn(db);
      ensurePlaylistPublishedAtColumn(db);
      ensureFeaturePieceColumns(db);
    } catch (error) {
      console.warn('[DB] Failed to ensure playlist column migrations during database initialization:', error.message);
    }
  }
  return db;
};

export const initializeDatabase = () => {
  const database = getDatabase();
  if (schemaInitialized) {
    return;
  }
  
  try {
    // Create playlists table
    database.exec(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        publish_date DATE,
        curator_id INTEGER,
        curator_name TEXT NOT NULL,
        curator_type TEXT DEFAULT 'artist',
        description TEXT,
        description_short TEXT,
        tags TEXT,
        image TEXT,
        published BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        spotify_url TEXT,
        apple_url TEXT,
        tidal_url TEXT,
        -- URLs created by our own export flows (used to detect re-export vs manual entry)
        exported_spotify_url TEXT,
        exported_tidal_url TEXT,
        custom_action_label TEXT,
        custom_action_url TEXT,
        custom_action_icon TEXT,
        custom_action_icon_source TEXT,
        auto_referral_enabled INTEGER DEFAULT 0,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tracks table
    database.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        year INTEGER,
        duration TEXT,
        spotify_id TEXT,
        apple_id TEXT,
        tidal_id TEXT,
        bandcamp_url TEXT,
        label TEXT,
        genre TEXT,
        artwork_url TEXT,
        album_artwork_url TEXT,
        isrc TEXT,
        explicit BOOLEAN DEFAULT FALSE,
        popularity INTEGER,
        preview_url TEXT,
        deezer_id TEXT,
        deezer_preview_url TEXT,
        preview_source TEXT,
        preview_confidence REAL,
        preview_updated_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    ensureTrackExtendedColumns(database);

    // Create curators table
    database.exec(`
      CREATE TABLE IF NOT EXISTS curators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'artist',
        profile_type TEXT DEFAULT 'artist',
        tester INTEGER DEFAULT 0,
        is_demo INTEGER DEFAULT 0,
        bio TEXT,
        bio_short TEXT,
        profile_image TEXT,
        fallback_flower_color_index INTEGER,
        location TEXT,
        website_url TEXT,
        contact_email TEXT,
        spotify_url TEXT,
        apple_url TEXT,
        tidal_url TEXT,
        bandcamp_url TEXT,
        social_links TEXT,
        external_links TEXT,
        verification_status TEXT DEFAULT 'verified',
        meta_oauth_approved INTEGER DEFAULT 0,
        profile_visibility TEXT DEFAULT 'public',
        upcoming_releases_enabled BOOLEAN DEFAULT FALSE,
        upcoming_releases_display_order INTEGER DEFAULT 0,
        upcoming_releases_open_on_load BOOLEAN DEFAULT FALSE,
        upcoming_shows_enabled BOOLEAN DEFAULT FALSE,
        upcoming_shows_display_order INTEGER DEFAULT 0,
        upcoming_shows_open_on_load BOOLEAN DEFAULT FALSE,
        custom_fields TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try { database.exec(`ALTER TABLE curators ADD COLUMN tester INTEGER DEFAULT 0`); } catch {}
    try { database.exec(`ALTER TABLE curators ADD COLUMN is_demo INTEGER DEFAULT 0`); } catch {}
    try { database.exec(`ALTER TABLE curators ADD COLUMN meta_oauth_approved INTEGER DEFAULT 0`); } catch {}

    // Create user_content_flags table
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_content_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        playlist_id INTEGER,
        issue_type VARCHAR(50) NOT NULL,
        track_title VARCHAR(255),
        track_artist VARCHAR(255),
        status VARCHAR(20) DEFAULT 'unresolved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by VARCHAR(100),
        FOREIGN KEY (track_id) REFERENCES tracks(id)
      )
    `);

    // Create admin_users table
    database.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME
      )
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS tester_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        curator_id INTEGER,
        request_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        url TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced_remote INTEGER DEFAULT 0,
        sync_attempts INTEGER DEFAULT 0,
        last_sync_attempt DATETIME,
        synced_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
        FOREIGN KEY(curator_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_tester_feedback_request ON tester_feedback(request_id);
      CREATE INDEX IF NOT EXISTS idx_tester_feedback_user_created ON tester_feedback(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tester_feedback_url_created ON tester_feedback(url, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tester_feedback_action ON tester_feedback(action_id);
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS demo_account_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        path TEXT,
        from_path TEXT,
        duration_ms INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(curator_id) REFERENCES curators(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES admin_users(id) ON DELETE CASCADE
      )
    `);

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_demo_activity_curator_time
        ON demo_account_activity(curator_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_demo_activity_session
        ON demo_account_activity(session_id);
    `);

    // Create oauth_tokens table (export auth tokens)
    database.exec(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        platform TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expires_at DATETIME,
        scope TEXT,
        token_type TEXT,
        user_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure required columns exist (for reconstructed DBs)
    try { database.exec(`ALTER TABLE oauth_tokens ADD COLUMN user_id INTEGER`); } catch {}
    try { database.exec(`ALTER TABLE oauth_tokens ADD COLUMN scope TEXT`); } catch {}
    try { database.exec(`ALTER TABLE oauth_tokens ADD COLUMN token_type TEXT`); } catch {}
    try { database.exec(`ALTER TABLE oauth_tokens ADD COLUMN user_info TEXT`); } catch {}
    try { database.exec(`ALTER TABLE oauth_tokens ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch {}

    // Ensure export URL columns exist on playlists (used to differentiate manual vs exported links)
    try { database.exec(`ALTER TABLE playlists ADD COLUMN exported_spotify_url TEXT`); } catch {}
    try { database.exec(`ALTER TABLE playlists ADD COLUMN exported_tidal_url TEXT`); } catch {}
    try { database.exec(`ALTER TABLE playlists ADD COLUMN exported_apple_url TEXT`); } catch {}
    ensurePlaylistCustomActionColumns(database);

    // Indexes and trigger
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_platform ON oauth_tokens(platform);
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_platform ON oauth_tokens(user_id, platform);
      CREATE TRIGGER IF NOT EXISTS update_oauth_tokens_timestamp 
      AFTER UPDATE ON oauth_tokens
      BEGIN
        UPDATE oauth_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Export requests + cross-linking core tables
    database.exec(`
      CREATE TABLE IF NOT EXISTS export_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        requested_by TEXT NOT NULL DEFAULT 'curator' CHECK (requested_by IN ('curator','system')),
        destinations TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auth_required','in_progress','completed','failed','confirmed')),
        results TEXT,
        last_error TEXT,
        execution_mode TEXT NOT NULL DEFAULT 'worker' CHECK (execution_mode IN ('worker','inline')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_export_requests_playlist_id ON export_requests(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status);
      CREATE INDEX IF NOT EXISTS idx_export_requests_created_at ON export_requests(created_at DESC);
    `);

    // URL import jobs (playlist/track resolution from pasted URLs)
    database.exec(`
      CREATE TABLE IF NOT EXISTS url_import_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_curator_id INTEGER NOT NULL,
        target_playlist_id INTEGER,
        kind TEXT NOT NULL CHECK (kind IN ('playlist','track')),
        source_platform TEXT NOT NULL,
        source_url TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'append' CHECK (mode IN ('append','replace')),
        append_position TEXT NOT NULL DEFAULT 'bottom' CHECK (append_position IN ('top','bottom')),
        update_metadata BOOLEAN NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (
          status IN ('pending','resolving','matching','saving','completed','failed','cancelled')
        ),
        total_items INTEGER DEFAULT 0,
        processed_items INTEGER DEFAULT 0,
        result_json TEXT,
        last_error TEXT,
        error_count INTEGER DEFAULT 0,
        draft_session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE CASCADE,
        FOREIGN KEY (target_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_url_import_jobs_owner ON url_import_jobs(owner_curator_id);
      CREATE INDEX IF NOT EXISTS idx_url_import_jobs_status ON url_import_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_url_import_jobs_created ON url_import_jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_url_import_jobs_dedupe ON url_import_jobs(
        owner_curator_id,
        source_url,
        target_playlist_id,
        mode,
        append_position,
        update_metadata,
        created_at DESC
      );
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS playlist_dsp_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('spotify', 'apple', 'tidal', 'youtube_music')),
        account_type TEXT NOT NULL DEFAULT 'flowerpil' CHECK (account_type IN ('flowerpil', 'curator')),
        owner_curator_id INTEGER,
        remote_playlist_id TEXT,
        remote_playlist_url TEXT,
        remote_playlist_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        last_synced_at DATETIME,
        last_snapshot_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE SET NULL,
        UNIQUE (playlist_id, platform)
      );

      CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_playlist_id
        ON playlist_dsp_exports(playlist_id, platform);
      CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_status
        ON playlist_dsp_exports(status);
      CREATE INDEX IF NOT EXISTS idx_playlist_dsp_exports_last_synced
        ON playlist_dsp_exports(last_synced_at DESC);
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS playlist_export_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('spotify', 'apple', 'tidal', 'youtube_music')),
        playlist_dsp_export_id INTEGER,
        mode TEXT NOT NULL CHECK (mode IN ('replace_existing', 'create_new')),
        request_id INTEGER,
        account_type TEXT NOT NULL DEFAULT 'flowerpil' CHECK (account_type IN ('flowerpil', 'curator')),
        owner_curator_id INTEGER,
        remote_playlist_id TEXT,
        remote_playlist_url TEXT,
        flowerpil_payload_json TEXT,
        remote_state_json TEXT,
        rollback_capability TEXT NOT NULL DEFAULT 'audit_only' CHECK (rollback_capability IN ('full', 'audit_only')),
        status TEXT NOT NULL DEFAULT 'created',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (playlist_dsp_export_id) REFERENCES playlist_dsp_exports(id) ON DELETE SET NULL,
        FOREIGN KEY (owner_curator_id) REFERENCES curators(id) ON DELETE SET NULL,
        FOREIGN KEY (request_id) REFERENCES export_requests(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_export
        ON playlist_export_snapshots(playlist_dsp_export_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_request
        ON playlist_export_snapshots(request_id);
      CREATE INDEX IF NOT EXISTS idx_playlist_export_snapshots_playlist
        ON playlist_export_snapshots(playlist_id, platform, created_at DESC);
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_url_import_jobs_timestamp
      AFTER UPDATE ON url_import_jobs
      BEGIN
        UPDATE url_import_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_export_requests_timestamp
      AFTER UPDATE ON export_requests
      BEGIN
        UPDATE export_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Add columns for failed export tracking and email notifications
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN failed_tracks TEXT`); } catch {}
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN admin_note TEXT`); } catch {}
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN email_sent BOOLEAN DEFAULT FALSE`); } catch {}
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN account_preferences TEXT`); } catch {}
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN job_metadata TEXT`); } catch {}
    try { database.exec(`ALTER TABLE export_requests ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'worker' CHECK (execution_mode IN ('worker','inline'))`); } catch {}
    try { database.exec(`ALTER TABLE url_import_jobs ADD COLUMN draft_session_id TEXT`); } catch {}

    // Telemetry tables for DSP automation
    database.exec(`
      CREATE TABLE IF NOT EXISTS dsp_worker_heartbeats (
        worker_id TEXT PRIMARY KEY,
        hostname TEXT,
        pid INTEGER,
        status TEXT NOT NULL DEFAULT 'starting',
        queue_depth INTEGER DEFAULT 0,
        active_requests INTEGER DEFAULT 0,
        processed_total INTEGER DEFAULT 0,
        failed_total INTEGER DEFAULT 0,
        last_error TEXT,
        metrics TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_last_seen
      ON dsp_worker_heartbeats(last_seen)
    `);
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_dsp_worker_heartbeats_timestamp
      AFTER UPDATE ON dsp_worker_heartbeats
      BEGIN
        UPDATE dsp_worker_heartbeats
        SET updated_at = CURRENT_TIMESTAMP
        WHERE worker_id = NEW.worker_id;
      END;
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS dsp_auto_export_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER,
        curator_id INTEGER,
        trigger TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        outcome TEXT NOT NULL DEFAULT 'unknown',
        reason TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_auto_export_events_created_at
      ON dsp_auto_export_events(created_at DESC)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_auto_export_events_severity
      ON dsp_auto_export_events(severity)
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS cross_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        confidence REAL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_links_track_platform ON cross_links(track_id, platform);
      CREATE INDEX IF NOT EXISTS idx_cross_links_platform ON cross_links(platform);
      CREATE INDEX IF NOT EXISTS idx_cross_links_confidence ON cross_links(confidence);
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_cross_links_timestamp 
      AFTER UPDATE ON cross_links
      BEGIN
        UPDATE cross_links SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS track_match_cache (
        spotify_id TEXT PRIMARY KEY,
        apple_music_url TEXT,
        apple_music_id TEXT,
        match_confidence_apple INTEGER,
        match_source_apple TEXT,
        tidal_url TEXT,
        tidal_id TEXT,
        match_confidence_tidal INTEGER,
        match_source_tidal TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_track_match_cache_updated_at ON track_match_cache(updated_at DESC);
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_track_match_cache_updated
      AFTER UPDATE ON track_match_cache
      BEGIN
        UPDATE track_match_cache SET updated_at = CURRENT_TIMESTAMP WHERE spotify_id = NEW.spotify_id;
      END;
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS apple_share_resolutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        apple_library_id TEXT NOT NULL,
        apple_storefront TEXT NOT NULL DEFAULT 'us',
        playlist_title TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolving','waiting_auth','resolved','failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempted_at DATETIME,
        next_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_url TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_apple_share_resolutions_playlist ON apple_share_resolutions(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_apple_share_resolutions_status ON apple_share_resolutions(status);
      CREATE INDEX IF NOT EXISTS idx_apple_share_resolutions_next_attempt ON apple_share_resolutions(next_attempt_at);
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_apple_share_resolutions_updated
      AFTER UPDATE ON apple_share_resolutions
      BEGIN
        UPDATE apple_share_resolutions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS curator_dsp_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('spotify','apple','tidal')),
        email TEXT,
        uses_flowerpil_account BOOLEAN NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_curator_dsp_accounts_unique ON curator_dsp_accounts(curator_id, platform);
      CREATE INDEX IF NOT EXISTS idx_curator_dsp_accounts_platform ON curator_dsp_accounts(platform);
    `);

    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_curator_dsp_accounts_timestamp
      AFTER UPDATE ON curator_dsp_accounts
      BEGIN
        UPDATE curator_dsp_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Add pending_admin_approval column for Spotify guardrails
    try { database.exec(`ALTER TABLE curator_dsp_accounts ADD COLUMN pending_admin_approval BOOLEAN DEFAULT 0`); } catch {}

    // Security tracking tables (ensure present in dev without running migrations)
    database.exec(`
      CREATE TABLE IF NOT EXISTS failed_login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        username TEXT,
        attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT
      );
      CREATE TABLE IF NOT EXISTS account_lockouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        locked_until DATETIME NOT NULL,
        attempt_count INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_id INTEGER,
        username TEXT,
        details TEXT,
        user_agent TEXT,
        endpoint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS csrf_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );
    `);

    // User accounts (for saved tracks, lists, DSP linker features)
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        is_private_saved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Public user privilege columns (Phase 1A schema additions)
    try { database.exec(`ALTER TABLE users ADD COLUMN user_type TEXT DEFAULT 'public'`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN exports_unlocked INTEGER DEFAULT 0`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN exports_unlocked_at DATETIME`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN exports_unlocked_by INTEGER`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'pending'`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN status_reason TEXT`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN status_updated_at DATETIME`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN status_updated_by INTEGER`); } catch {}
    try { database.exec(`ALTER TABLE users ADD COLUMN badges TEXT DEFAULT '[]'`); } catch {}

    // Admin user actions log (for comprehensive action logging)
    database.exec(`
      CREATE TABLE IF NOT EXISTS admin_user_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        target_user_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_admin_user_actions_target ON admin_user_actions(target_user_id, target_user_type);
      CREATE INDEX IF NOT EXISTS idx_admin_user_actions_admin ON admin_user_actions(admin_user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_user_actions_created ON admin_user_actions(created_at DESC);
    `);

    // User import log (for rolling 24h import tracking)
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_import_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        import_type TEXT NOT NULL,
        source_platform TEXT,
        item_count INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_import_log_user ON user_import_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_import_log_created ON user_import_log(created_at DESC);
    `);

    // Export access requests (for admin queue workflow)
    database.exec(`
      CREATE TABLE IF NOT EXISTS export_access_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        review_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_export_access_requests_status ON export_access_requests(status);
      CREATE INDEX IF NOT EXISTS idx_export_access_requests_user ON export_access_requests(user_id);
    `);

    // User groups for bulk operations
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_groups_name ON user_groups(name);
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS user_group_members (
        group_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        added_by INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_group_members_group ON user_group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members(user_id);
    `);

    // Admin email templates
    database.exec(`
      CREATE TABLE IF NOT EXISTS admin_email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Email verification codes
    database.exec(`
      CREATE TABLE IF NOT EXISTS email_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        code_hash TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('signup','verify_email','login','reset_password')),
        attempts INTEGER DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_email_codes_user ON email_codes(user_id);
    `);

    database.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_type TEXT NOT NULL CHECK (user_type IN ('admin','user')),
        token_hash TEXT NOT NULL UNIQUE,
        requested_ip TEXT,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_type, user_id);
    `);

    // Track cross-platform links (DSP Linker)
    database.exec(`
      CREATE TABLE IF NOT EXISTS track_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('spotify','apple','tidal','youtube','bandcamp','deezer')),
        url TEXT NOT NULL,
        isrc TEXT,
        confidence REAL DEFAULT 1.0,
        source TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(track_id, platform),
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_track_links_isrc ON track_links(isrc);
      CREATE INDEX IF NOT EXISTS idx_track_links_track_id ON track_links(track_id);
    `);

    // Saved tracks (user's personal collection)
    database.exec(`
      CREATE TABLE IF NOT EXISTS saved_tracks (
        user_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, track_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_saved_tracks_user ON saved_tracks(user_id);
      CREATE INDEX IF NOT EXISTS idx_saved_tracks_saved_at ON saved_tracks(saved_at DESC);
    `);

    // Playlist loves (for saved playlists tab + public love button)
    database.exec(`
      CREATE TABLE IF NOT EXISTS playlist_loves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        account_role TEXT NOT NULL CHECK (account_role IN ('user','curator','admin')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (playlist_id, account_id, account_role),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_loves_playlist ON playlist_loves(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_playlist_loves_account ON playlist_loves(account_id, account_role, created_at DESC);
    `);

    // Playlist comments (threaded with one-level replies in UI)
    database.exec(`
      CREATE TABLE IF NOT EXISTS playlist_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        account_role TEXT NOT NULL CHECK (account_role IN ('user','curator','admin')),
        parent_comment_id INTEGER,
        comment_text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES playlist_comments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_comments_playlist_created ON playlist_comments(playlist_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_playlist_comments_parent ON playlist_comments(parent_comment_id, created_at ASC);
    `);

    // User-created lists
    database.exec(`
      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        is_private INTEGER DEFAULT 0,
        cover_art_url TEXT,
        share_slug TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);
      CREATE INDEX IF NOT EXISTS idx_lists_share_slug ON lists(share_slug);
    `);

    // List items
    database.exec(`
      CREATE TABLE IF NOT EXISTS list_items (
        list_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        position INTEGER,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(list_id, track_id),
        FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE,
        FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
      CREATE INDEX IF NOT EXISTS idx_list_items_position ON list_items(list_id, position);
    `);

    // Share pages (public URLs for songs, lists, saved collections, profiles)
    database.exec(`
      CREATE TABLE IF NOT EXISTS share_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('song','list','saved','profile')),
        entity_id INTEGER NOT NULL,
        owner_user_id INTEGER,
        slug TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_share_pages_slug ON share_pages(slug);
      CREATE INDEX IF NOT EXISTS idx_share_pages_owner ON share_pages(owner_user_id);
      CREATE INDEX IF NOT EXISTS idx_share_pages_entity ON share_pages(entity_type, entity_id);
    `);

    // Custom playlist tags (formerly custom flags)
    database.exec(`
      CREATE TABLE IF NOT EXISTS custom_playlist_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#ffffff',
        text_color TEXT NOT NULL DEFAULT '#ffffff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES admin_users(id)
      );
    `);

    // Playlist tag assignments (playlist -> custom tag)
    database.exec(`
      CREATE TABLE IF NOT EXISTS playlist_flag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        flag_id INTEGER NOT NULL,
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (playlist_id, flag_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
      );
    `);

    // Create indexes for better performance
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_tracks_playlist_id ON tracks(playlist_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_position ON tracks(playlist_id, position);
      CREATE INDEX IF NOT EXISTS idx_playlists_published ON playlists(published);
      CREATE INDEX IF NOT EXISTS idx_playlists_published_date ON playlists(published, publish_date DESC);
       CREATE INDEX IF NOT EXISTS idx_playlists_published_at ON playlists(published, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_playlists_curator ON playlists(curator_name);
      CREATE INDEX IF NOT EXISTS idx_user_content_flags_track_id ON user_content_flags(track_id);
      CREATE INDEX IF NOT EXISTS idx_user_content_flags_status ON user_content_flags(status);
      CREATE INDEX IF NOT EXISTS idx_user_content_flags_created_at ON user_content_flags(created_at);
    `);

    // Create trigger to update updated_at timestamp
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS update_playlists_timestamp 
      AFTER UPDATE ON playlists
      BEGIN
        UPDATE playlists SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    // Create blog_posts table
    database.exec(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        author_id INTEGER,
        excerpt TEXT,
        content TEXT,
        featured_image TEXT,
        published INTEGER DEFAULT 0,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        featured_on_homepage INTEGER DEFAULT 1,
        homepage_display_order INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        FOREIGN KEY (author_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    // Create blog_posts indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published, published_at DESC)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_posts_featured ON blog_posts(featured_on_homepage, homepage_display_order)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id)
    `);

    // Create blog_post_flag_assignments table
    database.exec(`
      CREATE TABLE IF NOT EXISTS blog_post_flag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        flag_id INTEGER NOT NULL,
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, flag_id),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
      )
    `);

    // Create blog post flag indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_post_flag_assignments_post ON blog_post_flag_assignments(post_id)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_blog_post_flag_assignments_flag ON blog_post_flag_assignments(flag_id)
    `);

    // Create feature_pieces table (premium editorial content)
    database.exec(`
      CREATE TABLE IF NOT EXISTS feature_pieces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        author_name TEXT,
        curator_id INTEGER,
        excerpt TEXT,
        metadata_type TEXT DEFAULT 'Feature',
        metadata_date TEXT,
        hero_image TEXT,
        hero_image_caption TEXT,
        seo_title TEXT,
        seo_description TEXT,
        canonical_url TEXT,
        newsletter_cta_label TEXT,
        newsletter_cta_url TEXT,
        featured_on_homepage INTEGER DEFAULT 0,
        homepage_display_order INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        last_viewed_at DATETIME,
        content_blocks TEXT NOT NULL DEFAULT '[]',
        status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE SET NULL
      )
    `);

    // Create feature_pieces indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_status ON feature_pieces(status)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_slug ON feature_pieces(slug)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_published_at ON feature_pieces(status, published_at DESC)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_curator ON feature_pieces(curator_id)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_homepage ON feature_pieces(featured_on_homepage, homepage_display_order)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_pieces_view_count ON feature_pieces(view_count DESC)
    `);

    // Create feature_piece_flag_assignments table
    database.exec(`
      CREATE TABLE IF NOT EXISTS feature_piece_flag_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_piece_id INTEGER NOT NULL,
        flag_id INTEGER NOT NULL,
        assigned_by INTEGER,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (feature_piece_id, flag_id),
        FOREIGN KEY (feature_piece_id) REFERENCES feature_pieces(id) ON DELETE CASCADE,
        FOREIGN KEY (flag_id) REFERENCES custom_playlist_flags(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES admin_users(id)
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_piece ON feature_piece_flag_assignments(feature_piece_id)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_feature_piece_flag_assignments_flag ON feature_piece_flag_assignments(flag_id)
    `);

    // Create feature_pieces update trigger
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_feature_pieces_updated_at
      AFTER UPDATE ON feature_pieces
      FOR EACH ROW
      BEGIN
        UPDATE feature_pieces SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END
    `);

    // Create spotify_imports table
    database.exec(`
      CREATE TABLE IF NOT EXISTS spotify_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curator_id INTEGER NOT NULL,
        spotify_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'not_added' CHECK (status IN ('not_added', 'added')),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (curator_id) REFERENCES curators(id) ON DELETE CASCADE
      )
    `);

    // Create spotify_imports indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_spotify_imports_curator_id ON spotify_imports(curator_id)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_spotify_imports_status ON spotify_imports(status)
    `);

    // Create spotify_imports update trigger
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_spotify_imports_updated_at
      AFTER UPDATE ON spotify_imports
      FOR EACH ROW
      BEGIN
        UPDATE spotify_imports SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END
    `);

    // Invite codes for signup campaigns
    database.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        enabled INTEGER DEFAULT 0,
        use_count INTEGER DEFAULT 0,
        max_uses INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        enabled_at DATETIME,
        disabled_at DATETIME
      )
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code)
    `);
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_invite_codes_enabled ON invite_codes(enabled)
    `);

    console.log('✅ Database tables and indexes created successfully');

    // Check if we have any data
    const playlistCount = database.prepare('SELECT COUNT(*) as count FROM playlists').get();
    console.log(`📊 Current playlists in database: ${playlistCount.count}`);

    schemaInitialized = true;
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

export const closeDatabase = () => {
  if (db) {
    db.close();
    db = null;
  }
};

/**
 * Reset database for testing
 * Closes current database and resets initialization flags
 * This allows tests to get a fresh database instance
 */
export const resetDatabaseForTests = () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDatabaseForTests can only be called in test environment');
  }

  closeDatabase();
  schemaInitialized = false;

  // Re-initialize with fresh schema
  initializeDatabase();
};

// Database query wrapper for logging
const createLoggedQuery = (statement, queryName) => {
  const originalAll = statement.all ? statement.all.bind(statement) : null;
  const originalGet = statement.get ? statement.get.bind(statement) : null;
  const originalRun = statement.run ? statement.run.bind(statement) : null;

  if (originalAll) {
    statement.all = (...args) => {
      const start = Date.now();
      try {
        const result = originalAll(...args);
        // try { logger.dbQuery(`${queryName} [all]`, args, Date.now() - start); } catch {}
        return result;
      } catch (error) {
        try { logger.dbError(`${queryName} [all]`, error, args); } catch {}
        console.error(`[DB_ERROR] ${queryName} [all]: ${error.message}`);
        throw error;
      }
    };
  }

  if (originalGet) {
    statement.get = (...args) => {
      const start = Date.now();
      try {
        const result = originalGet(...args);
        // try { logger.dbQuery(`${queryName} [get]`, args, Date.now() - start); } catch {}
        return result;
      } catch (error) {
        try { logger.dbError(`${queryName} [get]`, error, args); } catch {}
        console.error(`[DB_ERROR] ${queryName} [get]: ${error.message}`);
        throw error;
      }
    };
  }

  if (originalRun) {
    statement.run = (...args) => {
      const start = Date.now();
      try {
        const result = originalRun(...args);
        // try { logger.dbQuery(`${queryName} [run]`, args, Date.now() - start); } catch {}
        return result;
      } catch (error) {
        try { logger.dbError(`${queryName} [run]`, error, args); } catch {}
        console.error(`[DB_ERROR] ${queryName} [run]: ${error.message}`);
        throw error;
      }
    };
  }

  return statement;
};

// Prepared statements for common operations
export const getQueries = () => {
  const database = getDatabase();
  if (!schemaInitialized) {
    try {
      initializeDatabase();
    } catch (error) {
      console.error('Failed to initialize database schema before preparing queries:', error);
      throw error;
    }
  }
  
  // try { logger.info('DATABASE', 'Preparing queries', { dbPath: DB_PATH }); } catch {}

  const hasTable = (tableName) => database.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName);

  const optionalStatement = (tableName, sql) => {
    if (hasTable(tableName)) {
      return database.prepare(sql);
    }

    const missingTableError = () => {
      throw new Error(`Table "${tableName}" is not available in this database`);
    };

    return {
      run: missingTableError,
      get: missingTableError,
      all: missingTableError,
      pluck() {
        return this;
      },
      expand() {
        return this;
      },
      raw() {
        return this;
      }
    };
  };
  
  const queries = {
    // Playlist queries
    getAllPlaylists: database.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM tracks t WHERE t.playlist_id = p.id) AS tracks_count,
        json_group_array(DISTINCT json_object(
          'id', cpf.id,
          'text', cpf.text,
          'color', cpf.color,
          'text_color', cpf.text_color,
          'url_slug', cpf.url_slug
        )) AS flags_json
      FROM playlists p
      LEFT JOIN playlist_flag_assignments pfa ON pfa.playlist_id = p.id
      LEFT JOIN custom_playlist_flags cpf ON cpf.id = pfa.flag_id
      GROUP BY p.id
      ORDER BY
        CASE
          WHEN p.published = 1 THEN COALESCE(
            p.published_at,
            CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
            p.created_at
          )
          ELSE p.updated_at
        END DESC,
        p.id DESC
    `),
    
    getPlaylistById: database.prepare('SELECT * FROM playlists WHERE id = ?'),
    
    getPublishedPlaylists: database.prepare(`
      SELECT
        p.*,
        c.location as curator_location,
        (
          SELECT COUNT(*) > 0
          FROM tracks t
          WHERE t.playlist_id = p.id
            AND t.quote IS NOT NULL
            AND t.quote != ''
        ) as has_quotes,
        (
          SELECT COUNT(*) > 0
          FROM tracks t
          WHERE t.playlist_id = p.id
            AND (t.spotify_id IS NOT NULL OR p.spotify_url IS NOT NULL)
        ) as has_spotify,
        (
          SELECT COUNT(*) > 0
          FROM tracks t
          WHERE t.playlist_id = p.id
            AND (t.apple_id IS NOT NULL OR t.apple_music_url IS NOT NULL OR p.apple_url IS NOT NULL)
        ) as has_apple,
        (
          SELECT COUNT(*) > 0
          FROM tracks t
          WHERE t.playlist_id = p.id
            AND (t.tidal_id IS NOT NULL OR t.tidal_url IS NOT NULL OR p.tidal_url IS NOT NULL)
        ) as has_tidal,
        json_group_array(DISTINCT json_object(
          'id', cpf.id,
          'text', cpf.text,
          'color', cpf.color,
          'text_color', cpf.text_color,
          'url_slug', cpf.url_slug
        )) AS flags_json
      FROM playlists p
      LEFT JOIN curators c ON p.curator_id = c.id
      LEFT JOIN playlist_flag_assignments pfa ON pfa.playlist_id = p.id
      LEFT JOIN custom_playlist_flags cpf ON cpf.id = pfa.flag_id
      WHERE p.published = 1
      GROUP BY p.id
      ORDER BY 
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
    `),

    getLeanPublishedPlaylists: database.prepare(`
      SELECT
        p.id,
        p.title,
        p.image,
        p.tags,
        p.curator_id,
        p.curator_name,
        p.curator_type,
        p.publish_date,
        p.published_at
      FROM playlists p
      WHERE p.published = 1
      ORDER BY 
        COALESCE(
          p.published_at,
          CASE WHEN p.publish_date IS NOT NULL AND p.publish_date != '' THEN datetime(p.publish_date || ' 00:00:00') END,
          p.created_at
        ) DESC,
        p.id DESC
      LIMIT ?
    `),
    
    insertPlaylist: database.prepare(`
      INSERT INTO playlists (
        title, publish_date, curator_id, curator_name, curator_type, 
        description, description_short, tags, image, published,
        spotify_url, apple_url, tidal_url, soundcloud_url, youtube_music_url,
        custom_action_label, custom_action_url, custom_action_icon, custom_action_icon_source,
        auto_referral_enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updatePlaylist: database.prepare(`
      UPDATE playlists SET 
        title = ?, publish_date = ?, curator_id = ?, curator_name = ?, curator_type = ?,
        description = ?, description_short = ?, tags = ?, image = ?, published = ?,
        spotify_url = ?, apple_url = ?, tidal_url = ?, soundcloud_url = ?, youtube_music_url = ?,
        custom_action_label = ?, custom_action_url = ?, custom_action_icon = ?, custom_action_icon_source = ?,
        auto_referral_enabled = ?
      WHERE id = ?
    `),
    
    deletePlaylist: database.prepare('DELETE FROM playlists WHERE id = ?'),
    
    publishPlaylist: database.prepare(`
      UPDATE playlists
      SET published = 1,
          published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `),

    markPublishedTimestamp: database.prepare(`
      UPDATE playlists
      SET published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `),

    clearPublishedTimestamp: database.prepare(`
      UPDATE playlists
      SET published_at = NULL
      WHERE id = ?
    `),

    schedulePlaylistPublish: database.prepare(`
      UPDATE playlists SET scheduled_publish_at = ? WHERE id = ?
    `),

    getScheduledPublishes: database.prepare(`
      SELECT * FROM playlists
      WHERE published = 0
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= datetime('now')
    `),

    clearScheduledPublish: database.prepare(`
      UPDATE playlists SET scheduled_publish_at = NULL WHERE id = ?
    `),

    // Track queries
    getTracksByPlaylistId: database.prepare(`
      SELECT * FROM tracks
      WHERE playlist_id = ?
      ORDER BY position ASC
    `),

    getTracksByPlaylistIdPaginated: database.prepare(`
      SELECT * FROM tracks
      WHERE playlist_id = ?
      ORDER BY position ASC
      LIMIT ? OFFSET ?
    `),

    getTrackCountByPlaylistId: database.prepare(`
      SELECT COUNT(*) as count FROM tracks WHERE playlist_id = ?
    `),

    getTrackById: database.prepare('SELECT * FROM tracks WHERE id = ?'),
    
    insertTrack: database.prepare(`
      INSERT INTO tracks (
        playlist_id, position, title, artist, album, year, duration,
        spotify_id, apple_id, tidal_id, youtube_music_id, youtube_music_url, bandcamp_url, soundcloud_url, label, genre, artwork_url,
        album_artwork_url, isrc, explicit, popularity, preview_url, linking_status, custom_sources
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    updateTrack: database.prepare(`
      UPDATE tracks SET
        title = ?, artist = ?, album = ?, year = ?, duration = ?,
        spotify_id = ?, apple_id = ?, tidal_id = ?, bandcamp_url = ?, soundcloud_url = ?, label = ?, genre = ?,
        artwork_url = ?, album_artwork_url = ?, isrc = ?, explicit = ?,
        popularity = ?, preview_url = ?, quote = ?, apple_music_url = ?, tidal_url = ?, custom_sources = ?, deezer_preview_url = ?
      WHERE id = ?
    `),

    updateTrackCustomSources: database.prepare(`
      UPDATE tracks SET
        custom_sources = ?
      WHERE id = ?
    `),
    
    deleteTracksByPlaylistId: database.prepare('DELETE FROM tracks WHERE playlist_id = ?'),
    
    // Preview-related track queries
    updateTrackPreview: database.prepare(`
      UPDATE tracks SET 
        deezer_id = ?, deezer_preview_url = ?, preview_source = ?, 
        preview_confidence = ?, preview_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),
    
    removeTrackPreview: database.prepare(`
      UPDATE tracks SET 
        deezer_preview_url = NULL, 
        preview_confidence = NULL, 
        preview_url = NULL,
        deezer_id = NULL,
        preview_source = NULL,
        preview_updated_at = NULL
      WHERE id = ?
    `),
    
    getTracksWithoutPreviews: database.prepare(`
      SELECT * FROM tracks 
      WHERE playlist_id = ? AND (deezer_preview_url IS NULL OR deezer_preview_url = '')
      ORDER BY position ASC
    `),
    
    getTracksWithExpiredPreviews: database.prepare(`
      SELECT * FROM tracks 
      WHERE preview_updated_at IS NULL 
         OR datetime(preview_updated_at, '+24 hours') < datetime('now')
      ORDER BY position ASC
    `),
    
    getTrackPreviewStats: database.prepare(`
      SELECT 
        COUNT(*) as total_tracks,
        COUNT(CASE WHEN deezer_preview_url IS NOT NULL THEN 1 END) as with_previews,
        COUNT(CASE WHEN preview_source = 'deezer-isrc' THEN 1 END) as isrc_matches,
        COUNT(CASE WHEN preview_source = 'deezer-metadata' THEN 1 END) as metadata_matches,
        AVG(preview_confidence) as avg_confidence
      FROM tracks 
      WHERE playlist_id = ?
    `),

    getTrackMatchCacheBySpotifyId: database.prepare(`
      SELECT *
      FROM track_match_cache
      WHERE spotify_id = ?
    `),

    // Track lookup queries (for track-overlap-cache feature)
    findTrackByIsrc: database.prepare(`
      SELECT * FROM tracks WHERE isrc = ? COLLATE NOCASE LIMIT 1
    `),

    findTrackBySpotifyId: database.prepare(`
      SELECT * FROM tracks WHERE spotify_id = ? LIMIT 1
    `),

    findTrackByTitleArtist: database.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)
      ORDER BY popularity DESC, deezer_preview_url IS NOT NULL DESC
      LIMIT 1
    `),

    findTrackWithPreviewByIsrc: database.prepare(`
      SELECT * FROM tracks
      WHERE isrc = ? COLLATE NOCASE AND deezer_preview_url IS NOT NULL
      LIMIT 1
    `),

    findTrackWithPreviewByMetadata: database.prepare(`
      SELECT * FROM tracks
      WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)
      AND deezer_preview_url IS NOT NULL
      ORDER BY popularity DESC
      LIMIT 1
    `),

    // Curator queries
    getAllCurators: database.prepare(`
      SELECT * FROM curators 
      WHERE profile_visibility != 'private'
      ORDER BY verification_status DESC, name ASC
    `),
    
    getCuratorById: database.prepare('SELECT * FROM curators WHERE id = ?'),
    
    getCuratorByName: database.prepare('SELECT * FROM curators WHERE name = ?'),
    
    insertCurator: database.prepare(`
      INSERT INTO curators (
        name, type, profile_type, tester, bio, bio_short, profile_image,
        location, website_url, contact_email, spotify_url, apple_url, tidal_url, bandcamp_url,
        social_links, external_links, verification_status, profile_visibility,
        upcoming_releases_enabled, upcoming_shows_enabled, dsp_implementation_status, custom_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    
    insertCuratorSimple: database.prepare(`
      INSERT OR IGNORE INTO curators (name, type, profile_type, verification_status, profile_visibility) 
      VALUES (?, ?, ?, 'verified', 'public')
    `),
    
    updateCurator: database.prepare(`
      UPDATE curators SET
        name = ?,
        type = ?,
        profile_type = ?,
        tester = ?,
        spotify_oauth_approved = ?,
        youtube_oauth_approved = ?,
        bio = ?,
        bio_short = ?,
        profile_image = ?,
        location = ?,
        website_url = ?,
        contact_email = ?,
        spotify_url = ?,
        apple_url = ?,
        tidal_url = ?,
        bandcamp_url = ?,
        social_links = ?,
        external_links = ?,
        verification_status = ?,
        profile_visibility = ?,
        upcoming_releases_enabled = ?,
        upcoming_shows_enabled = ?,
        dsp_implementation_status = ?,
        custom_fields = ?
      WHERE id = ?
    `),

    updateCuratorDSPStatus: database.prepare(`
      UPDATE curators
      SET dsp_implementation_status = ?
      WHERE id = ?
    `),
    
    deleteCurator: database.prepare('DELETE FROM curators WHERE id = ?'),
    
    getCuratorPlaylists: database.prepare(`
      SELECT * FROM playlists 
      WHERE curator_id = ? AND published = 1 
      ORDER BY 
        COALESCE(
          published_at,
          CASE WHEN publish_date IS NOT NULL AND publish_date != '' THEN datetime(publish_date || ' 00:00:00') END,
          created_at
        ) DESC,
        id DESC
    `),
    
    searchCurators: database.prepare(`
      SELECT * FROM curators 
      WHERE profile_visibility != 'private' 
      AND (name LIKE ? OR bio_short LIKE ? OR location LIKE ?)
      ORDER BY verification_status DESC, name ASC
    `),
    
    // Filtered curator queries for admin interface
    getCuratorsFiltered: database.prepare(`
      SELECT * FROM curators 
      WHERE profile_visibility != 'private'
      AND (? IS NULL OR profile_type = ?)
      AND (? IS NULL OR verification_status = ?)
      ORDER BY verification_status DESC, name ASC
    `),
    
    searchCuratorsFiltered: database.prepare(`
      SELECT * FROM curators 
      WHERE profile_visibility != 'private' 
      AND (name LIKE ? OR bio_short LIKE ? OR location LIKE ?)
      AND (? IS NULL OR profile_type = ?)
      AND (? IS NULL OR verification_status = ?)
      ORDER BY verification_status DESC, name ASC
    `),
    
    // Section configuration queries
    updateCuratorSectionConfig: database.prepare(`
      UPDATE curators SET 
        upcoming_releases_enabled = ?, upcoming_releases_display_order = ?, upcoming_releases_open_on_load = ?,
        upcoming_shows_enabled = ?, upcoming_shows_display_order = ?, upcoming_shows_open_on_load = ?
      WHERE id = ?
    `),
    
    // Upcoming releases queries
    getCuratorReleases: database.prepare(`
      SELECT * FROM releases 
      WHERE curator_id = ? 
      ORDER BY sort_order ASC, release_date ASC
    `),
    
    // Upcoming shows queries with guests
    getCuratorShows: database.prepare(`
      SELECT 
        s.*,
        GROUP_CONCAT(g.name ORDER BY g.sort_order ASC) as guest_names
      FROM upcoming_shows s
      LEFT JOIN show_guests g ON s.id = g.show_id
      WHERE s.curator_id = ?
      GROUP BY s.id
      ORDER BY s.sort_order ASC, s.show_date ASC
    `),

    getCuratorDSPAccounts: database.prepare(`
      SELECT platform, email, uses_flowerpil_account, metadata, pending_admin_approval
      FROM curator_dsp_accounts
      WHERE curator_id = ?
      ORDER BY platform ASC
    `),

    upsertCuratorDSPAccount: database.prepare(`
      INSERT INTO curator_dsp_accounts (curator_id, platform, email, uses_flowerpil_account, metadata, pending_admin_approval)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(curator_id, platform) DO UPDATE SET
        email = excluded.email,
        uses_flowerpil_account = excluded.uses_flowerpil_account,
        metadata = excluded.metadata,
        pending_admin_approval = excluded.pending_admin_approval,
        updated_at = CURRENT_TIMESTAMP
    `),

    deleteCuratorDSPAccount: database.prepare(`
      DELETE FROM curator_dsp_accounts WHERE curator_id = ? AND platform = ?
    `),

    listExportRequests: database.prepare(`
      SELECT 
        er.*, 
        p.title AS playlist_title,
        p.curator_id,
        c.name AS curator_name
      FROM export_requests er
      LEFT JOIN playlists p ON er.playlist_id = p.id
      LEFT JOIN curators c ON p.curator_id = c.id
      ORDER BY er.created_at DESC
    `),

    getExportRequestById: database.prepare(`
      SELECT 
        er.*, 
        p.title AS playlist_title,
        p.curator_id,
        c.name AS curator_name
      FROM export_requests er
      LEFT JOIN playlists p ON er.playlist_id = p.id
      LEFT JOIN curators c ON p.curator_id = c.id
      WHERE er.id = ?
    `),

    updateExportRequestStatus: database.prepare(`
      UPDATE export_requests
      SET status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateExportRequestResults: database.prepare(`
      UPDATE export_requests
      SET results = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateExportRequestJobMetadata: database.prepare(`
      UPDATE export_requests
      SET job_metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    createExportRequest: database.prepare(`
      INSERT INTO export_requests (
        playlist_id,
        requested_by,
        destinations,
        status,
        results,
        last_error,
        account_preferences,
        execution_mode
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    findActiveExportRequestsForPlaylist: database.prepare(`
      SELECT * FROM export_requests
      WHERE playlist_id = ?
        AND status IN ('pending','auth_required','in_progress')
      ORDER BY created_at DESC
    `),

    findExportRequestById: database.prepare(`
      SELECT * FROM export_requests WHERE id = ?
    `),

    findLatestExportRequestForPlaylist: database.prepare(`
      SELECT * FROM export_requests
      WHERE playlist_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `),

    requeueExportRequest: database.prepare(`
      UPDATE export_requests
      SET destinations = ?,
          requested_by = ?,
          account_preferences = ?,
          execution_mode = ?,
          status = 'pending',
          results = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    listExportRequestsByPlaylist: database.prepare(`
      SELECT * FROM export_requests
      WHERE playlist_id = ?
      ORDER BY created_at DESC
    `),

    // Check for recent exports (for cooldown/deduplication)
    findRecentExportsForPlaylist: database.prepare(`
      SELECT * FROM export_requests
      WHERE playlist_id = ?
        AND updated_at > datetime('now', ?)
      ORDER BY updated_at DESC
    `),

    upsertPlaylistDspExport: database.prepare(`
      INSERT INTO playlist_dsp_exports (
        playlist_id,
        platform,
        account_type,
        owner_curator_id,
        remote_playlist_id,
        remote_playlist_url,
        remote_playlist_name,
        status,
        last_synced_at,
        last_snapshot_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(playlist_id, platform) DO UPDATE SET
        account_type = excluded.account_type,
        owner_curator_id = excluded.owner_curator_id,
        remote_playlist_id = excluded.remote_playlist_id,
        remote_playlist_url = excluded.remote_playlist_url,
        remote_playlist_name = excluded.remote_playlist_name,
        status = excluded.status,
        last_synced_at = CURRENT_TIMESTAMP,
        last_snapshot_id = excluded.last_snapshot_id,
        updated_at = CURRENT_TIMESTAMP
    `),

    findPlaylistDspExport: database.prepare(`
      SELECT * FROM playlist_dsp_exports
      WHERE playlist_id = ? AND platform = ?
      LIMIT 1
    `),

    findPlaylistDspExports: database.prepare(`
      SELECT * FROM playlist_dsp_exports
      WHERE playlist_id = ?
      ORDER BY platform ASC
    `),

    createExportSnapshot: database.prepare(`
      INSERT INTO playlist_export_snapshots (
        playlist_id,
        platform,
        playlist_dsp_export_id,
        mode,
        request_id,
        account_type,
        owner_curator_id,
        remote_playlist_id,
        remote_playlist_url,
        flowerpil_payload_json,
        remote_state_json,
        rollback_capability,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    findLatestSnapshot: database.prepare(`
      SELECT * FROM playlist_export_snapshots
      WHERE playlist_dsp_export_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `),

    // Count exports in last hour (for rate limiting)
    countRecentExportsForPlaylist: database.prepare(`
      SELECT COUNT(*) as count FROM export_requests
      WHERE playlist_id = ?
        AND created_at > datetime('now', '-1 hour')
    `),


    // Admin user queries
    createAdminUser: database.prepare(`
      INSERT INTO admin_users (username, password_hash, role, is_active)
      VALUES (?, ?, ?, ?)
    `),
    
    findAdminUserByUsername: database.prepare(`
      SELECT * FROM admin_users WHERE username = ?
    `),
    
    findAdminUserById: database.prepare(`
      SELECT * FROM admin_users WHERE id = ?
    `),
    
    updateLastLogin: database.prepare(`
      UPDATE admin_users 
      SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0 
      WHERE id = ?
    `),
    
    updateAdminUser: database.prepare(`
      UPDATE admin_users 
      SET username = ?, role = ?, is_active = ?, locked_until = ?
      WHERE id = ?
    `),
    
    incrementFailedLogins: database.prepare(`
      UPDATE admin_users 
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE 
            WHEN failed_login_attempts >= 4 THEN datetime('now', '+30 minutes')
            ELSE locked_until
          END
      WHERE username = ?
    `),
    
    resetFailedLogins: database.prepare(`
      UPDATE admin_users 
      SET failed_login_attempts = 0, locked_until = NULL 
      WHERE username = ?
    `),
    
    getAllAdminUsers: database.prepare(`
      SELECT id, username, role, created_at, last_login, is_active, 
             failed_login_attempts, locked_until, curator_id
      FROM admin_users 
      ORDER BY created_at DESC
    `),
    
    // Curator account management queries
    setCuratorId: database.prepare(`
      UPDATE admin_users SET curator_id = ? WHERE id = ?
    `),

    setCuratorDemoStatus: database.prepare(`
      UPDATE curators
      SET is_demo = ?
      WHERE id = ?
    `),

    getDemoCurators: database.prepare(`
      SELECT
        c.*,
        au.id AS admin_user_id,
        au.username AS admin_username,
        au.last_login,
        au.is_active
      FROM curators c
      LEFT JOIN admin_users au ON au.curator_id = c.id
      WHERE c.is_demo = 1
      ORDER BY c.name ASC
    `),
    
    // Referral system queries
    createReferral: database.prepare(`
      INSERT INTO curator_referrals (
        code, curator_name, curator_type, email, 
        issued_by_user_id, issued_by_curator_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    
    getReferralByCode: database.prepare(`
      SELECT * FROM curator_referrals WHERE code = ?
    `),
    
    listReferralsByIssuerUser: database.prepare(`
      SELECT * FROM curator_referrals 
      WHERE issued_by_user_id = ? 
      ORDER BY created_at DESC
    `),
    
    listReferralsByIssuerCurator: database.prepare(`
      SELECT * FROM curator_referrals 
      WHERE issued_by_curator_id = ? 
      ORDER BY created_at DESC
    `),
    
    markReferralUsed: database.prepare(`
      UPDATE curator_referrals 
      SET status = 'used', used_by_user_id = ?, used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `),
    
    adminListAllReferrals: database.prepare(`
      SELECT * FROM curator_referrals 
      ORDER BY created_at DESC
    `),
    
    deleteReferralByCode: database.prepare(`
      DELETE FROM curator_referrals WHERE code = ?
    `),

    // Admin user cleanup helpers
    deleteAdminUsersByCuratorId: database.prepare(`
      DELETE FROM admin_users WHERE curator_id = ? AND role = 'curator'
    `),

    // Nullify curator_referrals foreign keys before deleting admin_users
    nullifyCuratorReferralsByAdminUserId: database.prepare(`
      UPDATE curator_referrals
      SET issued_by_user_id = NULL
      WHERE issued_by_user_id IN (SELECT id FROM admin_users WHERE curator_id = ?)
    `),

    nullifyCuratorReferralsUsedByAdminUserId: database.prepare(`
      UPDATE curator_referrals
      SET used_by_user_id = NULL
      WHERE used_by_user_id IN (SELECT id FROM admin_users WHERE curator_id = ?)
    `),
    
    // Bio profiles handle change queries
    updateHandleWithLimit: database.prepare(`
      UPDATE bio_profiles 
      SET handle = ?, last_handle_change_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `),
    
    getLastHandleChange: database.prepare(`
      SELECT last_handle_change_at FROM bio_profiles WHERE id = ?
    `),
    
    deleteAdminUser: database.prepare(`
      DELETE FROM admin_users WHERE id = ?
    `),

    // Curator tester management
    getCuratorTesterStatus: database.prepare(`
      SELECT tester FROM curators WHERE id = ?
    `),

    setCuratorTester: database.prepare(`
      UPDATE curators SET tester = ? WHERE id = ?
    `),

    // Tester feedback storage + sync
    insertTesterFeedback: database.prepare(`
      INSERT INTO tester_feedback (
        user_id, curator_id, request_id, action_id, url, message, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    getTesterFeedbackByAction: database.prepare(`
      SELECT * FROM tester_feedback WHERE action_id = ?
    `),

    listTesterFeedbackByUser: database.prepare(`
      SELECT * FROM tester_feedback
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `),

    getTesterFeedbackForSync: database.prepare(`
      SELECT * FROM tester_feedback
      WHERE synced_remote = 0
      ORDER BY created_at ASC
      LIMIT ?
    `),

    setTesterFeedbackSynced: database.prepare(`
      UPDATE tester_feedback
      SET synced_remote = 1,
          synced_at = CURRENT_TIMESTAMP,
          last_sync_attempt = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateTesterFeedbackSyncAttempt: database.prepare(`
      UPDATE tester_feedback
      SET sync_attempts = sync_attempts + 1,
          last_sync_attempt = CURRENT_TIMESTAMP
      WHERE id = ?
    `),
    
    // Bio Profiles queries
    getAllBioProfiles: database.prepare(`
      SELECT bp.*, c.name as curator_name, c.profile_type as curator_type
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
      ORDER BY bp.updated_at DESC
    `),
    
    getBioProfileById: database.prepare('SELECT * FROM bio_profiles WHERE id = ?'),
    
    getBioProfileByHandle: database.prepare(`
      SELECT bp.*, c.name as curator_name, c.profile_type as curator_type,
             c.spotify_url, c.apple_url, c.tidal_url, c.bandcamp_url
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
      WHERE bp.handle = ? AND bp.is_published = 1
    `),
    
    getPublishedBioProfile: database.prepare(`
      SELECT bp.*, c.name as curator_name, c.profile_type as curator_type,
             c.bio, c.bio_short, c.profile_image, c.location, c.website_url,
             c.spotify_url, c.apple_url, c.tidal_url, c.bandcamp_url,
             c.social_links, c.external_links
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
      WHERE bp.handle = ? AND bp.is_published = 1
    `),
    
    getBioProfileByHandleAdmin: database.prepare(`
      SELECT bp.*, c.name as curator_name, c.profile_type as curator_type,
             c.spotify_url, c.apple_url, c.tidal_url, c.bandcamp_url
      FROM bio_profiles bp
      LEFT JOIN curators c ON bp.curator_id = c.id
      WHERE bp.handle = ?
    `),
    
    checkHandleAvailability: database.prepare('SELECT id FROM bio_profiles WHERE handle = ?'),
    getHandleReservationByHandle: database.prepare('SELECT * FROM bio_handle_reservations WHERE handle = ?'),
    assignHandleReservation: database.prepare(`
      UPDATE bio_handle_reservations
      SET status = 'assigned', assigned_at = CURRENT_TIMESTAMP
      WHERE handle = ? AND status != 'released'
    `),

    insertBioProfile: database.prepare(`
      INSERT INTO bio_profiles (
        handle, curator_id, display_settings, theme_settings, seo_metadata,
        draft_content, is_published, version_number, last_handle_change_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `),
    
    updateBioProfile: database.prepare(`
      UPDATE bio_profiles SET 
        handle = ?,
        display_settings = ?,
        theme_settings = ?,
        seo_metadata = ?,
        draft_content = ?,
        version_number = ?,
        last_handle_change_at = CASE WHEN ? <> ? THEN CURRENT_TIMESTAMP ELSE last_handle_change_at END
      WHERE id = ?
    `),
    
    publishBioProfile: database.prepare(`
      UPDATE bio_profiles SET 
        is_published = 1, published_at = CURRENT_TIMESTAMP, 
        published_content = draft_content
      WHERE id = ?
    `),
    
    unpublishBioProfile: database.prepare(`
      UPDATE bio_profiles SET is_published = 0 WHERE id = ?
    `),
    
    deleteBioProfile: database.prepare('DELETE FROM bio_profiles WHERE id = ?'),
    
    // Bio Featured Links queries
    getBioFeaturedLinks: database.prepare(`
      SELECT * FROM bio_featured_links 
      WHERE bio_profile_id = ? AND is_enabled = 1 
      ORDER BY position ASC
    `),
    
    getBioFeaturedLinksAll: database.prepare(`
      SELECT * FROM bio_featured_links 
      WHERE bio_profile_id = ? 
      ORDER BY position ASC
    `),
    
    insertBioFeaturedLink: database.prepare(`
      INSERT INTO bio_featured_links (
        bio_profile_id, position, link_type, link_data, display_settings, is_enabled
      ) VALUES (?, ?, ?, ?, ?, ?)
    `),
    
    updateBioFeaturedLink: database.prepare(`
      UPDATE bio_featured_links SET 
        link_type = ?, link_data = ?, display_settings = ?, is_enabled = ?
      WHERE id = ?
    `),
    
    deleteBioFeaturedLink: database.prepare('DELETE FROM bio_featured_links WHERE id = ?'),
    
    deleteBioFeaturedLinksByProfile: database.prepare('DELETE FROM bio_featured_links WHERE bio_profile_id = ?'),
    
    // Bio Versions queries
    getBioVersions: database.prepare(`
      SELECT bv.*, au.username as created_by_username
      FROM bio_versions bv
      LEFT JOIN admin_users au ON bv.created_by = au.id
      WHERE bv.bio_profile_id = ?
      ORDER BY bv.version_number DESC
    `),
    
    getBioVersionById: database.prepare('SELECT * FROM bio_versions WHERE id = ?'),
    
    getLatestBioVersion: database.prepare(`
      SELECT * FROM bio_versions 
      WHERE bio_profile_id = ? 
      ORDER BY version_number DESC 
      LIMIT 1
    `),
    
    insertBioVersion: database.prepare(`
      INSERT INTO bio_versions (
        bio_profile_id, version_number, content_snapshot, change_summary, created_by
      ) VALUES (?, ?, ?, ?, ?)
    `),
    
    deleteBioVersionsByProfile: database.prepare('DELETE FROM bio_versions WHERE bio_profile_id = ?'),
    
    // Feature Flags queries
    getAllFeatureFlags: database.prepare(`
      SELECT ff.*, au.username as created_by_username
      FROM feature_flags ff
      LEFT JOIN admin_users au ON ff.created_by = au.id
      ORDER BY ff.flag_name ASC
    `),
    
    getFeatureFlagByName: database.prepare('SELECT * FROM feature_flags WHERE flag_name = ?'),
    
    insertFeatureFlag: database.prepare(`
      INSERT INTO feature_flags (
        flag_name, is_enabled, rollout_percentage, environment, target_users, conditions, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    
    updateFeatureFlag: database.prepare(`
      UPDATE feature_flags SET 
        is_enabled = ?, rollout_percentage = ?, environment = ?, 
        target_users = ?, conditions = ?, emergency_disabled = ?, emergency_reason = ?
      WHERE flag_name = ?
    `),
    
    deleteFeatureFlag: database.prepare('DELETE FROM feature_flags WHERE flag_name = ?'),
    
    emergencyDisableFlag: database.prepare(`
      UPDATE feature_flags SET 
        is_enabled = 0, rollout_percentage = 0, emergency_disabled = 1, emergency_reason = ?
      WHERE flag_name = ?
    `),
    
    // Handle management queries
    searchSimilarHandles: database.prepare(`
      SELECT handle FROM bio_profiles 
      WHERE handle LIKE ? 
      ORDER BY handle ASC 
      LIMIT 10
    `),
    
    // Playlist flags queries
    getPlaylistFlags: database.prepare(`
      SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
      FROM playlist_flag_assignments pfa
      JOIN custom_playlist_flags cpf ON pfa.flag_id = cpf.id
      WHERE pfa.playlist_id = ?
      ORDER BY cpf.text ASC
    `),
    
    // User content flags queries
    insertUserContentFlag: database.prepare(`
      INSERT INTO user_content_flags (
        track_id, playlist_id, issue_type, track_title, track_artist
      ) VALUES (?, ?, ?, ?, ?)
    `),
    
    getAllUserContentFlags: database.prepare(`
      SELECT * FROM user_content_flags 
      ORDER BY created_at DESC
    `),
    
    getUserContentFlagsByStatus: database.prepare(`
      SELECT * FROM user_content_flags 
      WHERE status = ?
      ORDER BY created_at DESC
    `),
    
    getUserContentFlagById: database.prepare(`
      SELECT * FROM user_content_flags WHERE id = ?
    `),
    
    resolveUserContentFlag: database.prepare(`
      UPDATE user_content_flags SET 
        status = 'resolved', 
        resolved_at = CURRENT_TIMESTAMP, 
        resolved_by = ?
      WHERE id = ?
    `),
    
    deleteUserContentFlag: database.prepare(`
      DELETE FROM user_content_flags WHERE id = ?
    `),

    // Users table queries
    createUser: database.prepare(`
      INSERT INTO users (email, username, password_hash, display_name, bio, is_private_saved)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    getUserByEmail: database.prepare(`
      SELECT * FROM users WHERE email = ?
    `),

    getUserById: database.prepare(`
      SELECT * FROM users WHERE id = ?
    `),

    getUserByUsername: database.prepare(`
      SELECT * FROM users WHERE username = ?
    `),

    updateUserProfile: database.prepare(`
      UPDATE users
      SET display_name = ?, bio = ?, avatar_url = ?, is_private_saved = ?, username = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateUserVerified: database.prepare(`
      UPDATE users
      SET is_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deleteUser: database.prepare(`
      DELETE FROM users WHERE id = ?
    `),

    // Email codes queries
    createEmailCode: database.prepare(`
      INSERT INTO email_codes (user_id, code_hash, purpose, expires_at)
      VALUES (?, ?, ?, ?)
    `),

    getActiveCode: database.prepare(`
      SELECT * FROM email_codes
      WHERE user_id = ? AND purpose = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `),

    incrementCodeAttempt: database.prepare(`
      UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?
    `),

    invalidateCodes: database.prepare(`
      DELETE FROM email_codes WHERE user_id = ? AND purpose = ?
    `),

    // Curator email codes (for open signup verification)
    createCuratorEmailCode: database.prepare(`
      INSERT INTO curator_email_codes (email, code_hash, expires_at, request_ip)
      VALUES (?, ?, ?, ?)
    `),

    getCuratorEmailCode: database.prepare(`
      SELECT * FROM curator_email_codes
      WHERE email = ? AND expires_at > datetime('now') AND verified_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `),

    getVerifiedCuratorEmail: database.prepare(`
      SELECT * FROM curator_email_codes
      WHERE email = ? AND verified_at IS NOT NULL
        AND verified_at > datetime('now', '-10 minutes')
      ORDER BY verified_at DESC LIMIT 1
    `),

    incrementCuratorCodeAttempt: database.prepare(`
      UPDATE curator_email_codes SET attempts = attempts + 1 WHERE id = ?
    `),

    markCuratorEmailVerified: database.prepare(`
      UPDATE curator_email_codes SET verified_at = CURRENT_TIMESTAMP WHERE id = ?
    `),

    updateCuratorCodeLastSent: database.prepare(`
      UPDATE curator_email_codes SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?
    `),

    deleteCuratorEmailCodes: database.prepare(`
      DELETE FROM curator_email_codes WHERE email = ?
    `),

    purgeExpiredCuratorEmailCodes: database.prepare(`
      DELETE FROM curator_email_codes WHERE expires_at <= datetime('now')
    `),

    // Password reset tokens
    createPasswordResetToken: database.prepare(`
      INSERT INTO password_reset_tokens (user_id, user_type, token_hash, requested_ip, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `),

    getActivePasswordResetToken: database.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ?
        AND used_at IS NULL
        AND expires_at > datetime('now')
      LIMIT 1
    `),

    markPasswordResetTokenUsed: database.prepare(`
      UPDATE password_reset_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    invalidatePasswordResetTokensForUser: database.prepare(`
      DELETE FROM password_reset_tokens
      WHERE user_id = ? AND user_type = ?
    `),

    purgeExpiredPasswordResetTokens: database.prepare(`
      DELETE FROM password_reset_tokens
      WHERE expires_at <= datetime('now')
         OR (used_at IS NOT NULL AND used_at <= datetime('now', '-7 days'))
    `),

    // Track links queries
    getLinksForTrack: database.prepare(`
      SELECT * FROM track_links WHERE track_id = ? ORDER BY platform
    `),

    upsertTrackLink: database.prepare(`
      INSERT INTO track_links (track_id, platform, url, isrc, confidence, source)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id, platform) DO UPDATE SET
        url = excluded.url,
        isrc = excluded.isrc,
        confidence = excluded.confidence,
        source = excluded.source,
        created_at = CURRENT_TIMESTAMP
    `),

    getTrackLinkByISRC: database.prepare(`
      SELECT * FROM track_links WHERE isrc = ?
    `),

    removeTrackLink: database.prepare(`
      DELETE FROM track_links WHERE track_id = ? AND platform = ?
    `),

    // Saved tracks queries
    addSavedTrack: database.prepare(`
      INSERT OR IGNORE INTO saved_tracks (user_id, track_id) VALUES (?, ?)
    `),

    removeSavedTrack: database.prepare(`
      DELETE FROM saved_tracks WHERE user_id = ? AND track_id = ?
    `),

    listSavedTracks: database.prepare(`
      SELECT t.*, st.saved_at
      FROM saved_tracks st
      JOIN tracks t ON st.track_id = t.id
      WHERE st.user_id = ?
      ORDER BY st.saved_at DESC
      LIMIT ? OFFSET ?
    `),

    getSavedTrackCount: database.prepare(`
      SELECT COUNT(*) as count FROM saved_tracks WHERE user_id = ?
    `),

    checkTrackSaved: database.prepare(`
      SELECT 1 FROM saved_tracks WHERE user_id = ? AND track_id = ?
    `),

    // Playlist engagement queries (love + comments)
    addPlaylistLove: database.prepare(`
      INSERT OR IGNORE INTO playlist_loves (playlist_id, account_id, account_role)
      VALUES (?, ?, ?)
    `),

    removePlaylistLove: database.prepare(`
      DELETE FROM playlist_loves
      WHERE playlist_id = ? AND account_id = ? AND account_role = ?
    `),

    checkPlaylistLovedByAccount: database.prepare(`
      SELECT 1
      FROM playlist_loves
      WHERE playlist_id = ? AND account_id = ? AND account_role = ?
      LIMIT 1
    `),

    getPlaylistLoveCount: database.prepare(`
      SELECT COUNT(*) AS count
      FROM playlist_loves
      WHERE playlist_id = ?
    `),

    listLovedPlaylistsByAccount: database.prepare(`
      SELECT
        p.*,
        pl.created_at AS loved_at,
        (SELECT COUNT(*) FROM tracks t WHERE t.playlist_id = p.id) AS tracks_count
      FROM playlist_loves pl
      JOIN playlists p ON p.id = pl.playlist_id
      WHERE pl.account_id = ?
        AND pl.account_role = ?
        AND p.published = 1
      ORDER BY pl.created_at DESC
    `),

    insertPlaylistComment: database.prepare(`
      INSERT INTO playlist_comments (
        playlist_id,
        account_id,
        account_role,
        parent_comment_id,
        comment_text
      ) VALUES (?, ?, ?, ?, ?)
    `),

    getPlaylistCommentById: database.prepare(`
      SELECT *
      FROM playlist_comments
      WHERE id = ?
      LIMIT 1
    `),

    listPlaylistCommentsWithAuthors: database.prepare(`
      SELECT
        pc.id,
        pc.playlist_id,
        pc.account_id,
        pc.account_role,
        pc.parent_comment_id,
        pc.comment_text,
        pc.created_at,
        CASE
          WHEN pc.account_role = 'user'
            THEN COALESCE(u.display_name, u.username, u.email, 'Listener')
          WHEN pc.account_role = 'curator'
            THEN COALESCE(c.name, au.username, 'Curator')
          WHEN pc.account_role = 'admin'
            THEN COALESCE(au.username, 'Admin')
          ELSE 'User'
        END AS username
      FROM playlist_comments pc
      LEFT JOIN users u
        ON pc.account_role = 'user' AND u.id = pc.account_id
      LEFT JOIN admin_users au
        ON pc.account_role IN ('curator', 'admin') AND au.id = pc.account_id
      LEFT JOIN curators c
        ON pc.account_role = 'curator' AND c.id = au.curator_id
      WHERE pc.playlist_id = ?
      ORDER BY pc.created_at ASC, pc.id ASC
    `),

    // Lists queries
    createList: optionalStatement('lists', `
      INSERT INTO lists (user_id, title, description, is_private, cover_art_url, share_slug)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    updateList: optionalStatement('lists', `
      UPDATE lists
      SET title = ?, description = ?, is_private = ?, cover_art_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `),

    deleteList: optionalStatement('lists', `
      DELETE FROM lists WHERE id = ? AND user_id = ?
    `),

    getListById: optionalStatement('lists', `
      SELECT * FROM lists WHERE id = ?
    `),

    getListBySlug: optionalStatement('lists', `
      SELECT * FROM lists WHERE share_slug = ?
    `),

    listUserLists: optionalStatement('lists', `
      SELECT * FROM lists WHERE user_id = ? ORDER BY created_at DESC
    `),

    addListItem: optionalStatement('list_items', `
      INSERT OR IGNORE INTO list_items (list_id, track_id, position) VALUES (?, ?, ?)
    `),

    removeListItem: optionalStatement('list_items', `
      DELETE FROM list_items WHERE list_id = ? AND track_id = ?
    `),

    getListItems: optionalStatement('list_items', `
      SELECT t.*, li.position, li.added_at
      FROM list_items li
      JOIN tracks t ON li.track_id = t.id
      WHERE li.list_id = ?
      ORDER BY li.position ASC
    `),

    getListItemCount: optionalStatement('list_items', `
      SELECT COUNT(*) as count FROM list_items WHERE list_id = ?
    `),

    getMaxListItemPosition: optionalStatement('list_items', `
      SELECT COALESCE(MAX(position), 0) as max_position FROM list_items WHERE list_id = ?
    `),

    // Share pages queries
    createSharePage: database.prepare(`
      INSERT INTO share_pages (entity_type, entity_id, owner_user_id, slug, is_active)
      VALUES (?, ?, ?, ?, 1)
    `),

    getSharePageBySlug: database.prepare(`
      SELECT * FROM share_pages WHERE slug = ? AND is_active = 1
    `),

    revokeSharePage: database.prepare(`
      UPDATE share_pages SET is_active = 0 WHERE slug = ?
    `),

    getSharePagesByOwner: database.prepare(`
      SELECT * FROM share_pages WHERE owner_user_id = ? AND is_active = 1
    `),

    // Demo account activity
    insertDemoActivity: database.prepare(`
      INSERT INTO demo_account_activity (
        curator_id,
        user_id,
        session_id,
        event_type,
        path,
        from_path,
        duration_ms,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    // Password management queries (security-critical - use prepared statements)
    updateAdminUserPassword: database.prepare(`
      UPDATE admin_users
      SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL
      WHERE id = ?
    `),

    updateUserPassword: database.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    // Blog posts queries
    getAllBlogPosts: database.prepare(`
      SELECT
        bp.*,
        c.name as author_name,
        c.profile_image as author_image
      FROM blog_posts bp
      LEFT JOIN curators c ON bp.author_id = c.id
      ORDER BY bp.created_at DESC
    `),

    getBlogPostById: database.prepare(`
      SELECT
        bp.*,
        c.name as author_name,
        c.profile_image as author_image
      FROM blog_posts bp
      LEFT JOIN curators c ON bp.author_id = c.id
      WHERE bp.id = ?
    `),

    getBlogPostBySlug: database.prepare(`
      SELECT
        bp.*,
        c.name as author_name,
        c.profile_image as author_image
      FROM blog_posts bp
      LEFT JOIN curators c ON bp.author_id = c.id
      WHERE bp.slug = ?
    `),

    getPublishedBlogPosts: database.prepare(`
      SELECT
        bp.*,
        c.name as author_name,
        c.profile_image as author_image
      FROM blog_posts bp
      LEFT JOIN curators c ON bp.author_id = c.id
      WHERE bp.published = 1
      ORDER BY bp.published_at DESC
    `),

    insertBlogPost: database.prepare(`
      INSERT INTO blog_posts (
        slug, title, author_id, excerpt, content, featured_image,
        published, published_at, featured_on_homepage, homepage_display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateBlogPost: database.prepare(`
      UPDATE blog_posts
      SET slug = ?, title = ?, author_id = ?, excerpt = ?, content = ?,
          featured_image = ?, published = ?, published_at = ?,
          featured_on_homepage = ?, homepage_display_order = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deleteBlogPost: database.prepare(`
      DELETE FROM blog_posts WHERE id = ?
    `),

    incrementBlogPostViews: database.prepare(`
      UPDATE blog_posts
      SET view_count = view_count + 1
      WHERE id = ?
    `),

    // Blog post flags queries
    getBlogPostFlags: database.prepare(`
      SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
      FROM blog_post_flag_assignments bpfa
      JOIN custom_playlist_flags cpf ON bpfa.flag_id = cpf.id
      WHERE bpfa.post_id = ?
      ORDER BY cpf.text ASC
    `),

    assignBlogPostFlag: database.prepare(`
      INSERT OR IGNORE INTO blog_post_flag_assignments (post_id, flag_id, assigned_by)
      VALUES (?, ?, ?)
    `),

    removeBlogPostFlag: database.prepare(`
      DELETE FROM blog_post_flag_assignments
      WHERE post_id = ? AND flag_id = ?
    `),

    // Feature pieces queries (premium editorial content)
    getAllFeaturePieces: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      ORDER BY fp.created_at DESC
    `),

    getPublishedFeaturePieces: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.status = 'published'
      ORDER BY fp.published_at DESC
    `),

    getDraftFeaturePieces: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.status = 'draft'
      ORDER BY fp.updated_at DESC
    `),

    getFeaturePiecesByCurator: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.curator_id = ?
      ORDER BY fp.updated_at DESC
    `),

    getPublishedFeaturePiecesForHomepage: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.status = 'published' AND fp.featured_on_homepage = 1
      ORDER BY fp.homepage_display_order ASC, fp.published_at DESC
    `),

    getFeaturePieceById: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.id = ?
    `),

    getFeaturePieceBySlug: database.prepare(`
      SELECT fp.*, c.name as curator_name
      FROM feature_pieces fp
      LEFT JOIN curators c ON fp.curator_id = c.id
      WHERE fp.slug = ?
    `),

    insertFeaturePiece: database.prepare(`
      INSERT INTO feature_pieces (
        slug, title, subtitle, author_name, curator_id, excerpt, metadata_type, metadata_date,
        hero_image, hero_image_caption, seo_title, seo_description, canonical_url,
        newsletter_cta_label, newsletter_cta_url, featured_on_homepage, homepage_display_order,
        content_blocks, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateFeaturePiece: database.prepare(`
      UPDATE feature_pieces
      SET slug = ?, title = ?, subtitle = ?, author_name = ?, curator_id = ?, excerpt = ?,
          metadata_type = ?, metadata_date = ?, hero_image = ?, hero_image_caption = ?,
          seo_title = ?, seo_description = ?, canonical_url = ?, newsletter_cta_label = ?,
          newsletter_cta_url = ?, featured_on_homepage = ?, homepage_display_order = ?,
          content_blocks = ?
      WHERE id = ?
    `),

    deleteFeaturePiece: database.prepare(`
      DELETE FROM feature_pieces WHERE id = ?
    `),

    publishFeaturePiece: database.prepare(`
      UPDATE feature_pieces
      SET status = 'published', published_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    unpublishFeaturePiece: database.prepare(`
      UPDATE feature_pieces
      SET status = 'draft', published_at = NULL
      WHERE id = ?
    `),

    incrementFeaturePieceViews: database.prepare(`
      UPDATE feature_pieces
      SET view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    // Feature piece flags queries
    getFeaturePieceFlags: database.prepare(`
      SELECT cpf.id, cpf.text, cpf.color, cpf.text_color, cpf.url_slug
      FROM feature_piece_flag_assignments fpfa
      JOIN custom_playlist_flags cpf ON fpfa.flag_id = cpf.id
      WHERE fpfa.feature_piece_id = ?
      ORDER BY cpf.text ASC
    `),

    assignFeaturePieceFlag: database.prepare(`
      INSERT OR IGNORE INTO feature_piece_flag_assignments (feature_piece_id, flag_id, assigned_by)
      VALUES (?, ?, ?)
    `),

    removeFeaturePieceFlag: database.prepare(`
      DELETE FROM feature_piece_flag_assignments
      WHERE feature_piece_id = ? AND flag_id = ?
    `),

    // Inline editor utility queries
    checkUrlDuplicate: database.prepare(`
      SELECT id, title, apple_url
      FROM playlists
      WHERE apple_url = ? AND id != ?
      LIMIT 1
    `),

    getPlaylistTrackCount: database.prepare(`
      SELECT COUNT(*) as count
      FROM tracks
      WHERE playlist_id = ?
    `),

    getLatestExportRequestForPlaylist: database.prepare(`
      SELECT
        er.id,
        er.playlist_id,
        er.requested_by,
        er.destinations,
        er.status,
        er.results,
        er.last_error,
        er.created_at,
        er.updated_at
      FROM export_requests er
      WHERE er.playlist_id = ?
      ORDER BY er.created_at DESC
      LIMIT 1
    `),

    getPlaylistUpdatedAt: database.prepare(`
      SELECT updated_at
      FROM playlists
      WHERE id = ?
    `),

    // ========================================
    // Spotify Imports
    // ========================================

    createSpotifyImport: database.prepare(`
      INSERT INTO spotify_imports (curator_id, spotify_email, status)
      VALUES (?, ?, 'not_added')
    `),

    getSpotifyImportById: database.prepare(`
      SELECT * FROM spotify_imports
      WHERE id = ?
    `),

    getSpotifyImportByCuratorId: database.prepare(`
      SELECT * FROM spotify_imports
      WHERE curator_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `),

    getAllSpotifyImports: database.prepare(`
      SELECT
        si.*,
        c.name as curator_name,
        c.type as curator_type,
        COALESCE(u.email, c.contact_email, au.username) as curator_email
      FROM spotify_imports si
      JOIN curators c ON si.curator_id = c.id
      LEFT JOIN admin_users au ON au.curator_id = c.id
      LEFT JOIN users u ON u.id = c.id
      ORDER BY si.created_at DESC
    `),

    updateSpotifyImportStatus: database.prepare(`
      UPDATE spotify_imports
      SET status = ?, notes = ?
      WHERE id = ?
    `),

    // Playlist transfer job queries
    insertTransferJob: database.prepare(`
      INSERT INTO playlist_transfer_jobs (
        source_platform,
        source_playlist_id,
        source_playlist_name,
        destinations,
        status,
        match_threshold,
        use_enhanced_matching,
        requested_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    getTransferJobById: database.prepare(`
      SELECT * FROM playlist_transfer_jobs WHERE id = ?
    `),

    listTransferJobs: database.prepare(`
      SELECT * FROM playlist_transfer_jobs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),

    listTransferJobsByStatus: database.prepare(`
      SELECT * FROM playlist_transfer_jobs
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),

    updateTransferJobStatus: database.prepare(`
      UPDATE playlist_transfer_jobs
      SET status = ?,
          started_at = CASE WHEN ? = 'processing' THEN COALESCE(started_at, CURRENT_TIMESTAMP) ELSE started_at END,
          completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?
    `),

    updateTransferJobProgress: database.prepare(`
      UPDATE playlist_transfer_jobs
      SET total_tracks = ?,
          tracks_processed = ?,
          tracks_matched = ?,
          tracks_failed = ?
      WHERE id = ?
    `),

    updateTransferJobResults: database.prepare(`
      UPDATE playlist_transfer_jobs
      SET results = ?
      WHERE id = ?
    `),

    updateTransferJobTrackResults: database.prepare(`
      UPDATE playlist_transfer_jobs
      SET track_results = ?
      WHERE id = ?
    `),

    updateTransferJobError: database.prepare(`
      UPDATE playlist_transfer_jobs
      SET last_error = ?,
          error_count = error_count + 1
      WHERE id = ?
    `),

    deleteTransferJob: database.prepare(`
      DELETE FROM playlist_transfer_jobs WHERE id = ?
    `),

    countTransferJobs: database.prepare(`
      SELECT COUNT(*) as count FROM playlist_transfer_jobs
    `),

    countTransferJobsByStatus: database.prepare(`
      SELECT COUNT(*) as count FROM playlist_transfer_jobs WHERE status = ?
    `),

    // URL import jobs
    insertUrlImportJob: database.prepare(`
      INSERT INTO url_import_jobs (
        owner_curator_id,
        target_playlist_id,
        kind,
        source_platform,
        source_url,
        mode,
        append_position,
        update_metadata,
        status,
        draft_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    getUrlImportJobById: database.prepare(`
      SELECT * FROM url_import_jobs WHERE id = ?
    `),

    listUrlImportJobsForCurator: database.prepare(`
      SELECT * FROM url_import_jobs
      WHERE owner_curator_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),

    findRecentImportJob: database.prepare(`
      SELECT * FROM url_import_jobs
      WHERE owner_curator_id = ?
        AND source_url = ?
        AND COALESCE(target_playlist_id, 0) = COALESCE(?, 0)
        AND mode = ?
        AND append_position = ?
        AND update_metadata = ?
        AND created_at >= datetime('now', '-30 seconds')
        AND status IN ('pending', 'resolving', 'matching', 'saving', 'completed')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `),

    findDraftBySessionId: database.prepare(`
      SELECT j.id, json_extract(j.result_json, '$.playlist_id') AS created_playlist_id
      FROM url_import_jobs j
      WHERE j.draft_session_id = ?
        AND j.owner_curator_id = ?
        AND j.target_playlist_id IS NULL
        AND j.status IN ('completed', 'saving', 'matching')
        AND j.result_json IS NOT NULL
        AND json_extract(j.result_json, '$.playlist_id') IS NOT NULL
      ORDER BY j.created_at DESC
      LIMIT 1
    `),

    updateUrlImportJobStatus: database.prepare(`
      UPDATE url_import_jobs
      SET status = ?,
          started_at = CASE
            WHEN ? IN ('resolving','matching','saving') THEN COALESCE(started_at, CURRENT_TIMESTAMP)
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ? IN ('completed','failed','cancelled') THEN CURRENT_TIMESTAMP
            ELSE completed_at
          END
      WHERE id = ?
    `),

    updateUrlImportJobProgress: database.prepare(`
      UPDATE url_import_jobs
      SET total_items = ?,
          processed_items = ?
      WHERE id = ?
    `),

    updateUrlImportJobResult: database.prepare(`
      UPDATE url_import_jobs
      SET result_json = ?
      WHERE id = ?
    `),

    updateUrlImportJobError: database.prepare(`
      UPDATE url_import_jobs
      SET last_error = ?,
          error_count = error_count + 1
      WHERE id = ?
    `),

    // Landing page link queries
    getAllLandingPageLinks: database.prepare(`
      SELECT * FROM landing_page_links
      ORDER BY priority DESC, created_at DESC
    `),

    getPublishedLandingPageLinks: database.prepare(`
      SELECT * FROM landing_page_links
      WHERE published = 1
      ORDER BY priority DESC, created_at DESC
    `),

    getLandingPageLinkById: database.prepare(`
      SELECT * FROM landing_page_links WHERE id = ?
    `),

    insertLandingPageLink: database.prepare(`
      INSERT INTO landing_page_links (
        title, subtitle, url, image, tags, content_tag, content_tag_color, published, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateLandingPageLink: database.prepare(`
      UPDATE landing_page_links
      SET title = ?, subtitle = ?, url = ?, image = ?, tags = ?,
          content_tag = ?, content_tag_color = ?, published = ?, priority = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deleteLandingPageLink: database.prepare(`
      DELETE FROM landing_page_links WHERE id = ?
    `),

// ========================================
    // Public User Management (Phase 1A)
    // ========================================

    // User queries with extended fields
    getAllPublicUsers: database.prepare(`
      SELECT * FROM users
      WHERE user_type = 'public'
      ORDER BY created_at DESC
    `),

    getPublicUsersPaginated: database.prepare(`
      SELECT * FROM users
      WHERE user_type = 'public'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),

    countPublicUsers: database.prepare(`
      SELECT COUNT(*) as count FROM users WHERE user_type = 'public'
    `),

    searchPublicUsers: database.prepare(`
      SELECT * FROM users
      WHERE user_type = 'public'
        AND (email LIKE ? OR username LIKE ? OR CAST(id AS TEXT) LIKE ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `),

    countSearchPublicUsers: database.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE user_type = 'public'
        AND (email LIKE ? OR username LIKE ? OR CAST(id AS TEXT) LIKE ?)
    `),

    updateUserStatus: database.prepare(`
      UPDATE users
      SET status = ?, status_reason = ?, status_updated_at = CURRENT_TIMESTAMP, status_updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateUserActive: database.prepare(`
      UPDATE users
      SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateUserExportsUnlocked: database.prepare(`
      UPDATE users
      SET exports_unlocked = ?, exports_unlocked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, exports_unlocked_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    updateUserBadges: database.prepare(`
      UPDATE users
      SET badges = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    // Admin user actions log
    insertAdminUserAction: database.prepare(`
      INSERT INTO admin_user_actions (admin_user_id, target_user_id, target_user_type, action_type, reason, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    getAdminUserActionsByTarget: database.prepare(`
      SELECT aua.*, au.username as admin_username
      FROM admin_user_actions aua
      LEFT JOIN admin_users au ON aua.admin_user_id = au.id
      WHERE aua.target_user_id = ? AND aua.target_user_type = ?
      ORDER BY aua.created_at DESC
      LIMIT ? OFFSET ?
    `),

    getAllAdminUserActions: database.prepare(`
      SELECT aua.*, au.username as admin_username
      FROM admin_user_actions aua
      LEFT JOIN admin_users au ON aua.admin_user_id = au.id
      ORDER BY aua.created_at DESC
      LIMIT ? OFFSET ?
    `),

    // User import log
    insertUserImportLog: database.prepare(`
      INSERT INTO user_import_log (user_id, import_type, source_platform, item_count)
      VALUES (?, ?, ?, ?)
    `),

    getUserImportCountLast24h: database.prepare(`
      SELECT COUNT(*) as count FROM user_import_log
      WHERE user_id = ? AND created_at > datetime('now', '-24 hours')
    `),

    getUserImportLogsLast24h: database.prepare(`
      SELECT * FROM user_import_log
      WHERE user_id = ? AND created_at > datetime('now', '-24 hours')
      ORDER BY created_at DESC
    `),

    // Export access requests
    createExportAccessRequest: database.prepare(`
      INSERT OR REPLACE INTO export_access_requests (user_id, status, created_at)
      VALUES (?, 'pending', CURRENT_TIMESTAMP)
    `),

    getExportAccessRequestByUser: database.prepare(`
      SELECT * FROM export_access_requests WHERE user_id = ?
    `),

    getPendingExportAccessRequests: database.prepare(`
      SELECT ear.*, u.email, u.username, u.display_name
      FROM export_access_requests ear
      JOIN users u ON ear.user_id = u.id
      WHERE ear.status = 'pending'
      ORDER BY ear.created_at ASC
    `),

    updateExportAccessRequest: database.prepare(`
      UPDATE export_access_requests
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_reason = ?
      WHERE id = ?
    `),

    countPendingExportAccessRequests: database.prepare(`
      SELECT COUNT(*) as count FROM export_access_requests WHERE status = 'pending'
    `),

    // Public user analytics
    getPublicUserSignupStats: database.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7_days,
        SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as last_30_days,
        SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN exports_unlocked = 1 THEN 1 ELSE 0 END) as exports_unlocked_count,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_count
      FROM users
      WHERE user_type = 'public'
    `),

    getPublicUserImportStats: database.prepare(`
      SELECT
        COUNT(*) as total_imports,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as last_7_days
      FROM user_import_log
    `),

    // User groups
    getAllUserGroups: database.prepare(`
      SELECT ug.*, COUNT(ugm.user_id) as member_count
      FROM user_groups ug
      LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id
      GROUP BY ug.id
      ORDER BY ug.name ASC
    `),

    getUserGroupById: database.prepare(`
      SELECT ug.*, COUNT(ugm.user_id) as member_count
      FROM user_groups ug
      LEFT JOIN user_group_members ugm ON ug.id = ugm.group_id
      WHERE ug.id = ?
      GROUP BY ug.id
    `),

    createUserGroup: database.prepare(`
      INSERT INTO user_groups (name, description, created_by)
      VALUES (?, ?, ?)
    `),

    updateUserGroup: database.prepare(`
      UPDATE user_groups
      SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deleteUserGroup: database.prepare(`
      DELETE FROM user_groups WHERE id = ?
    `),

    getUserGroupMembers: database.prepare(`
      SELECT u.id, u.email, u.username, u.display_name, u.status, u.exports_unlocked, ugm.added_at
      FROM user_group_members ugm
      JOIN users u ON ugm.user_id = u.id
      WHERE ugm.group_id = ?
      ORDER BY ugm.added_at DESC
    `),

    addUserToGroup: database.prepare(`
      INSERT OR IGNORE INTO user_group_members (group_id, user_id, added_by)
      VALUES (?, ?, ?)
    `),

    removeUserFromGroup: database.prepare(`
      DELETE FROM user_group_members
      WHERE group_id = ? AND user_id = ?
    `),

    getUserGroupMemberIds: database.prepare(`
      SELECT user_id FROM user_group_members WHERE group_id = ?
    `),

    // Admin email templates
    getAllEmailTemplates: database.prepare(`
      SELECT * FROM admin_email_templates ORDER BY name ASC
    `),

    getEmailTemplateById: database.prepare(`
      SELECT * FROM admin_email_templates WHERE id = ?
    `),

    createEmailTemplate: database.prepare(`
      INSERT INTO admin_email_templates (name, subject, body, created_by)
      VALUES (?, ?, ?, ?)
    `),

    updateEmailTemplate: database.prepare(`
      UPDATE admin_email_templates
      SET name = ?, subject = ?, body = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    deleteEmailTemplate: database.prepare(`
      DELETE FROM admin_email_templates WHERE id = ?
    `),

    // Invite codes queries
    getInviteCodeByCode: database.prepare(`
      SELECT * FROM invite_codes WHERE code = ?
    `),

    getAllInviteCodes: database.prepare(`
      SELECT * FROM invite_codes ORDER BY created_at DESC
    `),

    getActiveInviteCode: database.prepare(`
      SELECT * FROM invite_codes WHERE enabled = 1 LIMIT 1
    `),

    createInviteCode: database.prepare(`
      INSERT INTO invite_codes (code, description, enabled, enabled_at)
      VALUES (?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
    `),

    enableInviteCode: database.prepare(`
      UPDATE invite_codes
      SET enabled = 1, enabled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    disableInviteCode: database.prepare(`
      UPDATE invite_codes
      SET enabled = 0, disabled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `),

    disableAllInviteCodes: database.prepare(`
      UPDATE invite_codes
      SET enabled = 0, disabled_at = CURRENT_TIMESTAMP
      WHERE enabled = 1
    `),

    incrementInviteCodeUse: database.prepare(`
      UPDATE invite_codes
      SET use_count = use_count + 1
      WHERE code = ?
    `)
  };

  // Wrap all queries with logging
  const loggedQueries = {};
  for (const [key, statement] of Object.entries(queries)) {
    loggedQueries[key] = createLoggedQuery(statement, key);
  }

  return loggedQueries;
};
