import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Serve the HTML file
router.get('/', (req, res) => {
  try {
    const htmlPath = join(__dirname, '../../public/qobiz-help/index.html');
    
    if (!fs.existsSync(htmlPath)) {
      return res.status(404).send('Help page not found');
    }

    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600' // 1 hour cache
    });
    
    res.send(htmlContent);
  } catch (error) {
    console.error('Error serving qobiz-help:', error);
    res.status(500).send('Error loading help page');
  }
});

// Serve static assets (images) from the qobiz-help directory
router.use('/', express.static(join(__dirname, '../../public/qobiz-help'), {
  maxAge: '1y', // Cache images for 1 year
  immutable: true
}));

export default router;

