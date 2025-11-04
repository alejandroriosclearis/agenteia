import { Router } from 'express';
import { upsertCMS, deleteCMS } from '../services/rag.js';

const r = Router();

r.post('/cms', async (req, res) => {
  // body: { id, active, title:{es}, content:{es}, links:{es} }
  const { id, title={}, content={}, links={}, active } = req.body;
  for (const lang of Object.keys(content)){
    // country opcional si tus CMS varían por país; aquí null
    await upsertCMS({
      id,
      lang,
      slug: (title[lang] || '').toLowerCase().replace(/\s+/g,'-').slice(0,60),
      title: title[lang] || 'CMS',
      url: links[lang] || '',
      content: content[lang] || ''
    });
  }
  res.json({ ok:true, indexed_langs: Object.keys(content) });
});

r.post('/cms-delete', async (req,res)=>{
  deleteCMS({ id: req.body.id });
  res.json({ ok:true });
});

r.post('/languages', async (_req,res)=> res.json({ ok:true })); // guardado simple si quieres
r.post('/countries', async (_req,res)=> res.json({ ok:true }));

export default r;
