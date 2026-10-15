import 'dotenv/config';
import express from 'express';
import statusHandler from './api/status.js';
import redeemHandler from './api/redeem.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

// These endpoints are called through Vite's /api proxy during local development.
// Secrets stay on this server and are never exposed to the React bundle.
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.get('/api/status', async (req, res) => {
  try {
    await statusHandler(req, res);
  } catch (error) {
    console.error('[local-api] GET /api/status failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Could not check pass status.' });
  }
});

app.post('/api/redeem', async (req, res) => {
  try {
    await redeemHandler(req, res);
  } catch (error) {
    console.error('[local-api] POST /api/redeem failed:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Redemption service failed. Please try again.' });
  }
});

// In production, Express serves the built React app and API from one service.
app.use(express.static(distPath, { index: false }));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error && !res.headersSent) next(error);
  });
});

app.listen(PORT, HOST, () => {
  console.log(`[visit-pass-api] listening at http://${HOST}:${PORT}`);
});
