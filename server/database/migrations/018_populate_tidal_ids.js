// Fixed version of 018_populate_tidal_ids.js migration
// Fixed SQL syntax issues with quotes

export async function up(db) {
  console.log('🎵 Populating tidal_id field from existing tidal_url data...');

  // First check if tidal_id column exists, if not add it
  const checkColumnSql = `
    PRAGMA table_info(tracks);
  `;

  const columns = db.prepare(checkColumnSql).all();
  const hastidalIdColumn = columns.some(col => col.name === 'tidal_id');

  if (!hastidalIdColumn) {
    console.log('🔧 Adding tidal_id column to tracks table...');
    db.exec(`ALTER TABLE tracks ADD COLUMN tidal_id TEXT;`);
  }

  // Extract tidal_id from existing tidal_url field using SUBSTR and INSTR
  const updateSql = `
    UPDATE tracks
    SET tidal_id = SUBSTR(tidal_url, INSTR(tidal_url, '/track/') + 7)
    WHERE tidal_url IS NOT NULL
      AND (tidal_id IS NULL OR tidal_id = '')
      AND tidal_url LIKE 'https://tidal.com/browse/track/%'
  `;

  const result = db.prepare(updateSql).run();
  console.log(`✅ Populated ${result.changes} tidal_id records from existing URLs`);

  // Verification query to show results (fixed quotes)
  const verificationSql = `SELECT COUNT(*) as count FROM tracks WHERE tidal_id IS NOT NULL AND tidal_id != ''`;
  const verification = db.prepare(verificationSql).get();
  console.log(`📊 Total tracks with tidal_id: ${verification.count}`);
}

export async function down(db) {
  console.log('🔄 Clearing tidal_id field...');

  const updateSql = `
    UPDATE tracks
    SET tidal_id = NULL
    WHERE tidal_id IS NOT NULL
  `;

  const result = db.prepare(updateSql).run();
  console.log(`✅ Cleared ${result.changes} tidal_id records`);
}
