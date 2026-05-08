/**
 * Migration 092: DSP OAuth Gating
 *
 * Adds spotify_oauth_approved and youtube_oauth_approved columns to curators table.
 * These columns gate whether a curator can use their own OAuth tokens for these platforms.
 *
 * Due to Spotify's API limitations (25 user limit), we need to:
 * - Default new curators to 0 (use Flowerpil account only)
 * - Auto-grandfather existing curators who already have tokens
 * - Allow admins to manually approve curators
 */

export async function up(db) {
  console.log('Adding DSP OAuth approval columns to curators table...');

  // Add spotify_oauth_approved column
  try {
    db.exec(`ALTER TABLE curators ADD COLUMN spotify_oauth_approved INTEGER DEFAULT 0`);
    console.log('Added spotify_oauth_approved column');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('spotify_oauth_approved column already exists');
    } else {
      throw error;
    }
  }

  // Add youtube_oauth_approved column
  try {
    db.exec(`ALTER TABLE curators ADD COLUMN youtube_oauth_approved INTEGER DEFAULT 0`);
    console.log('Added youtube_oauth_approved column');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('youtube_oauth_approved column already exists');
    } else {
      throw error;
    }
  }

  // Auto-grandfather existing curators with Spotify tokens
  console.log('Grandfathering existing curators with Spotify tokens...');
  const spotifyResult = db.prepare(`
    UPDATE curators
    SET spotify_oauth_approved = 1
    WHERE id IN (
      SELECT DISTINCT owner_curator_id
      FROM export_oauth_tokens
      WHERE platform = 'spotify'
        AND account_type = 'curator'
        AND owner_curator_id IS NOT NULL
        AND is_active = 1
    )
  `).run();
  console.log(`Grandfathered ${spotifyResult.changes} curator(s) with Spotify tokens`);

  // Auto-grandfather existing curators with YouTube tokens
  console.log('Grandfathering existing curators with YouTube tokens...');
  const youtubeResult = db.prepare(`
    UPDATE curators
    SET youtube_oauth_approved = 1
    WHERE id IN (
      SELECT DISTINCT owner_curator_id
      FROM export_oauth_tokens
      WHERE platform = 'youtube_music'
        AND account_type = 'curator'
        AND owner_curator_id IS NOT NULL
        AND is_active = 1
    )
  `).run();
  console.log(`Grandfathered ${youtubeResult.changes} curator(s) with YouTube tokens`);

  console.log('Migration 092 completed successfully');
}

export async function down(db) {
  console.log('Rolling back DSP OAuth gating migration...');

  // SQLite doesn't support DROP COLUMN easily, but we can document this
  // The columns will remain but be unused after rollback
  console.log('Note: spotify_oauth_approved and youtube_oauth_approved columns remain (unused)');

  // Reset all approvals to 0
  db.prepare('UPDATE curators SET spotify_oauth_approved = 0').run();
  db.prepare('UPDATE curators SET youtube_oauth_approved = 0').run();

  console.log('Reset all OAuth approvals to 0');
}
