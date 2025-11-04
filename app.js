// app.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import agent from './routes/agent.js';
import sync from './routes/sync.js';

const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

// Auth por token
app.use((req, res, next) => {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!process.env.API_TOKEN || auth !== process.env.API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.use('/agent', agent);
app.use('/sync', sync);

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`IA API listening on http://localhost:${port}`));
