// RAG con SQLite + embeddings locales (CPU) usando @xenova/transformers
import Database from 'better-sqlite3';
import { pipeline } from '@xenova/transformers';

const DB_PATH = process.env.RAG_DB_PATH || './rag.db';
const db = new Database(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  lang TEXT,
  country TEXT,
  slug TEXT,
  title TEXT,
  url TEXT,
  text TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT,
  idx INTEGER,
  lang TEXT,
  country TEXT,
  text TEXT,
  url TEXT,
  title TEXT,
  embedding BLOB
);
`);

let embedderPromise;
async function getEmbedder(){
  if (!embedderPromise){
    // Modelo pequeño, rápido y suficiente para políticas/FAQ
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedderPromise;
}

function chunkText(txt, max=900, overlap=120){
  const words = txt.split(/\s+/);
  const chunks = [];
  for (let i=0; i<words.length; ){
    const part = words.slice(i, i+max).join(' ');
    chunks.push(part);
    i += (max - overlap);
    if (i < 0) break;
  }
  return chunks.length ? chunks : [txt];
}

function toFloat32(arr){
  const f = new Float32Array(arr.length);
  for (let i=0;i<arr.length;i++) f[i] = arr[i];
  return Buffer.from(f.buffer);
}

function fromFloat32(buf){
  const f = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length/4));
  return Array.from(f);
}

function cosine(a, b){
  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-9);
}

// INGESTA/UPDATE de una página CMS (por idioma)
export async function upsertCMS({ id, lang, country=null, slug, title, url, content }){
  const upDoc = db.prepare(`INSERT INTO docs(id,lang,country,slug,title,url,text,updated_at)
    VALUES(@id,@lang,@country,@slug,@title,@url,@text,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET text=@text, title=@title, url=@url, lang=@lang, country=@country, slug=@slug, updated_at=datetime('now')`);
  upDoc.run({ id:`${id}:${lang}`, lang, country, slug, title, url, text:content });

  // Borra chunks anteriores
  db.prepare(`DELETE FROM chunks WHERE doc_id=?`).run(`${id}:${lang}`);

  const embedder = await getEmbedder();
  const parts = chunkText(content);
  const insertChunk = db.prepare(`INSERT INTO chunks(id,doc_id,idx,lang,country,text,url,title,embedding)
    VALUES(@id,@doc_id,@idx,@lang,@country,@text,@url,@title,@embedding)`);

  let idx = 0;
  for (const p of parts){
    const emb = await embedder(p, { pooling: 'mean', normalize: true });
    const vec = Array.from(emb.data); // normalized already
    insertChunk.run({
      id: `${id}:${lang}:${idx}`,
      doc_id: `${id}:${lang}`,
      idx,
      lang, country, text: p, url, title,
      embedding: toFloat32(vec)
    });
    idx++;
  }
}

export function deleteCMS({ id }){
  const docIds = db.prepare(`SELECT id FROM docs WHERE id LIKE ?`).all(`${id}:%`).map(r=>r.id);
  const delC = db.prepare(`DELETE FROM chunks WHERE doc_id=?`);
  for (const d of docIds) delC.run(d);
  db.prepare(`DELETE FROM docs WHERE id LIKE ?`).run(`${id}:%`);
}

export async function retrievePolicySnippets({ query, lang, country=null, k=4 }){
  const embedder = await getEmbedder();
  const qEmb = await embedder(query, { pooling:'mean', normalize:true });
  const qvec = Array.from(qEmb.data);

  const rows = db.prepare(`
    SELECT id, text, url, title, lang, country, embedding FROM chunks
    WHERE lang = @lang ${country ? 'AND (country IS NULL OR country=@country)' : ''}
    LIMIT 1000
  `).all({ lang, country });

  const scored = rows.map(r => ({
    id: r.id, text: r.text, url: r.url, title: r.title,
    lang: r.lang, country: r.country,
    score: cosine(qvec, fromFloat32(r.embedding))
  })).sort((a,b)=>b.score-a.score).slice(0,k);

  return scored.map(s => ({
    title: s.title, url: s.url, text: s.text, score: s.score
  }));
}
