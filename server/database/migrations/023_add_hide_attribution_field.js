// Migration 023: Add hide_attribution field to releases table
// Date: 2025-08-30
// Description: Adds option to hide "POSTED BY:" attribution in release cards

export const up = (db) => {
  console.log('🔄 Running migration 023_add_hide_attribution_field - UP');
  
  try {
    // Add hide_attribution field to releases table
    console.log('  📝 Adding hide_attribution field...');
    db.exec(`
      ALTER TABLE releases 
      ADD COLUMN hide_attribution INTEGER DEFAULT 0
    `);
    
    console.log('✅ Successfully added hide_attribution field to releases table');
    
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('⚠️  hide_attribution column already exists - skipping');
    } else {
      console.error('❌ Error adding hide_attribution field:', error.message);
      throw error;
    }
  }
};

export const down = (db) => {
  console.log('🔄 Running migration 023_add_hide_attribution_field - DOWN');
  
  try {
    // SQLite doesn't support DROP COLUMN directly
    console.log('⚠️ SQLite downgrade would require table recreation - not implemented');
    console.log('✅ Migration 023 downgrade logged');
    
  } catch (error) {
    console.error('❌ Error in migration 023 downgrade:', error.message);
    throw error;
  }
};