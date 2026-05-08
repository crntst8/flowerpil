#!/usr/bin/env node

import { uploadToR2 } from '../server/utils/r2Storage.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, '../storage/uploads');

async function uploadAllFiles() {
  console.log('🚀 Uploading all local files to R2...\n');

  // Recursively get all files
  function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(function(file) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    });

    return arrayOfFiles;
  }

  const allFiles = getAllFiles(STORAGE_PATH);
  console.log(`📊 Found ${allFiles.length} files to upload\n`);

  let uploadedCount = 0;
  let errorCount = 0;

  for (const filePath of allFiles) {
    try {
      // Get relative path from storage/uploads/
      const relativePath = path.relative(STORAGE_PATH, filePath);

      // Skip if in audio directory (not images)
      if (relativePath.startsWith('audio' + path.sep)) {
        console.log(`⏭️  Skipping audio file: ${relativePath}`);
        continue;
      }

      // Read file
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(relativePath);
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                       ext === '.png' ? 'image/png' :
                       ext === '.webp' ? 'image/webp' :
                       ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';

      // Upload to R2 with the exact relative path
      const r2Key = relativePath.replace(/\\/g, '/'); // Normalize path separators
      const newUrl = await uploadToR2(buffer, r2Key, mimeType);

      uploadedCount++;
      console.log(`✅ Uploaded: ${r2Key}`);

    } catch (error) {
      errorCount++;
      console.log(`❌ Failed: ${filePath.replace(STORAGE_PATH, '')} - ${error.message}`);
    }
  }

  console.log(`\n📊 Upload Summary:`);
  console.log(`   Uploaded: ${uploadedCount}`);
  console.log(`   Errors: ${errorCount}`);
}

uploadAllFiles().catch(console.error);
