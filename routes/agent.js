import { Router } from 'express';
import { handleInbound } from '../services/agent.js';
const r = Router();

r.post('/reply', async (req, res) => {
  const { thread_id, message, email, lang, shop_id } = req.body;
  const out = await handleInbound({ message, email, lang, shop_id, thread_id });
  res.json(out);
});

export default r;
