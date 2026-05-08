import { getDatabase, closeDatabase } from '../server/database/db.js';
import fs from 'fs';
import path from 'path';

const BRIGHTNESS_THRESHOLD = 200;

const getLuminance = (hex) => {
  if (!hex) return 200;
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const hashString = (str) => {
  let hash = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const run = async () => {
  const db = getDatabase();
  try {
    console.log('Refreshing placeholder flower colors for curators...');

    // 1. Load colors
    const colorsPath = path.join(process.cwd(), 'public', 'placeholder', 'colors.json');
    const colorsFile = fs.readFileSync(colorsPath, 'utf8');
    const allColors = JSON.parse(colorsFile).colors;
    
    const nonBrightColors = allColors.filter(c => getLuminance(c.hex) <= BRIGHTNESS_THRESHOLD);
    if(nonBrightColors.length === 0) {
      console.error('No non-bright colors found. Aborting.');
      return;
    }
    
    console.log(`Loaded ${allColors.length} total colors, using ${nonBrightColors.length} non-bright colors.`);

    // 2. Get all curators
    const curators = db.prepare('SELECT id, name, fallback_flower_color_index FROM curators').all();
    console.log(`Found ${curators.length} curators to update.`);

    const updateStmt = db.prepare('UPDATE curators SET fallback_flower_color_index = ? WHERE id = ?');
    
    let updatedCount = 0;

    db.transaction(() => {
        for (const curator of curators) {
            const hash = hashString(String(curator.id));
            const indexInFilteredList = hash % nonBrightColors.length;
            const selectedColor = nonBrightColors[indexInFilteredList];
            const newColorIndex = selectedColor.index;

            if (curator.fallback_flower_color_index !== newColorIndex) {
                updateStmt.run(newColorIndex, curator.id);
                console.log(`Updated curator ${curator.name} (${curator.id}): ${curator.fallback_flower_color_index || 'null'} -> ${newColorIndex}`);
                updatedCount++;
            }
        }
    })();

    console.log(`
Successfully updated ${updatedCount} curators.`);

  } catch (error) {
    console.error('An error occurred during placeholder color refresh:', error);
  } finally {
    if (db) {
        closeDatabase();
    }
  }
};

run();
