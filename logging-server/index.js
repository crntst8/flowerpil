import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const envPath = process.env.LOGGING_ENV_PATH || path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

const feedbackRoutesModule = await import('./routes/feedback.js');
await import('./db.js');

const feedbackRoutes = feedbackRoutesModule.default || feedbackRoutesModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Flowerpil-Logging');
  next();
});

app.use(feedbackRoutes);

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = Number.parseInt(process.env.PORT || '4600', 10);
app.listen(PORT, () => {
  console.log(`Logging UI listening on port ${PORT}`);
});
