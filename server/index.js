import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { db } from './database.js';

export const categories = ['อาหารตามสั่ง', 'ก๋วยเตี๋ยว', 'ข้าวจานเดียว', 'อีสาน', 'มังสวิรัติ', 'อื่น ๆ'];
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/debug.html', ['debug.html', 'text/html; charset=utf-8']],
  ['/debug.js', ['debug.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
const publicDir = new URL('../public/', import.meta.url);
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function json(res, status, data) { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); }
function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('ข้อมูลต้องเป็น JSON object');
  const result = {};
  for (const [key, max] of [['name',100], ['location',200], ['menu',100], ['category',30], ['review',1000]]) {
    if (typeof data[key] !== 'string' || data[key].trim().length > max || (key !== 'review' && !data[key].trim())) fail(`ข้อมูล ${key} ไม่ถูกต้อง (สูงสุด ${max} ตัวอักษร)`);
    result[key] = data[key].trim();
  }
  if (!categories.includes(result.category)) fail('ประเภทอาหารไม่ถูกต้อง');
  if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0 || data.price > 10000 || Math.abs(data.price*100-Math.round(data.price*100)) > 0.00001) fail('ราคาต้องมากกว่า 0 ถึง 10,000 บาท และทศนิยมไม่เกิน 2 ตำแหน่ง');
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) fail('คะแนนต้องเป็นจำนวนเต็ม 1–5');
  return {...result, price:data.price, rating:data.rating};
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail('กรุณาส่ง Content-Type: application/json', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 16384) fail('ข้อมูลมีขนาดใหญ่เกินไป', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('รูปแบบ JSON ไม่ถูกต้อง'); }
}
function filtered(params) {
  const conditions = []; const values = [];
  if (params.has('budget') && params.get('budget') !== '') {
    const budget = Number(params.get('budget'));
    if (!Number.isFinite(budget) || budget < 0 || budget > 10000) fail('งบต้องอยู่ระหว่าง 0–10,000 บาท');
    conditions.push('price <= ?'); values.push(budget);
  }
  const category = params.get('category');
  if (category) { if (!categories.includes(category)) fail('ประเภทอาหารไม่ถูกต้อง'); conditions.push('category = ?'); values.push(category); }
  const q = params.get('q')?.trim();
  if (q) { if (q.length > 100) fail('คำค้นยาวเกินไป'); conditions.push('(instr(name, ?) > 0 OR instr(menu, ?) > 0 OR instr(location, ?) > 0)'); values.push(q,q,q); }
  return db.prepare(`SELECT * FROM restaurants ${conditions.length ? 'WHERE '+conditions.join(' AND ') : ''} ORDER BY id DESC`).all(...values);
}
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
    if (req.method === 'GET' && staticFiles.has(path)) {
      const [name, type] = staticFiles.get(path); const file = await readFile(fileURLToPath(new URL(name,publicDir)));
      res.writeHead(200, {'Content-Type':type}); res.end(file); return;
    }
    if (req.method === 'GET' && path === '/api/health') return json(res,200,{status:'ok',database:'SQLite',restaurants:db.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n});
    if (req.method === 'GET' && path === '/api/restaurants') return json(res,200,{restaurants:filtered(url.searchParams)});
    if (req.method === 'GET' && path === '/api/restaurants/random') {
      const rows = filtered(url.searchParams);
      if (!rows.length) fail('ยังไม่มีร้านที่ตรงกับงบและตัวกรองนี้ ลองเพิ่มงบหรือเปลี่ยนตัวกรองนะ',404);
      return json(res,200,{restaurant:rows[randomInt(rows.length)],matched:rows.length});
    }
    if (req.method === 'POST' && path === '/api/restaurants') {
      const v = validate(await body(req));
      const result = db.prepare('INSERT INTO restaurants (name,location,menu,price,category,rating,review) VALUES (?,?,?,?,?,?,?)').run(v.name,v.location,v.menu,v.price,v.category,v.rating,v.review);
      return json(res,201,{restaurant:db.prepare('SELECT * FROM restaurants WHERE id=?').get(result.lastInsertRowid)});
    }
    const match = path.match(/^\/api\/restaurants\/(\d+)$/);
    if (match && ['GET','PUT','DELETE'].includes(req.method)) {
      const id = Number(match[1]);
      if (!Number.isSafeInteger(id)) fail('รหัสร้านไม่ถูกต้อง');
      if (!db.prepare('SELECT id FROM restaurants WHERE id=?').get(id)) fail('ไม่พบร้านนี้',404);
      if (req.method === 'GET') return json(res,200,{restaurant:db.prepare('SELECT * FROM restaurants WHERE id=?').get(id)});
      if (req.method === 'DELETE') { db.prepare('DELETE FROM restaurants WHERE id=?').run(id); return json(res,200,{message:'ลบร้านแล้ว'}); }
      const v = validate(await body(req));
      db.prepare('UPDATE restaurants SET name=?,location=?,menu=?,price=?,category=?,rating=?,review=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(v.name,v.location,v.menu,v.price,v.category,v.rating,v.review,id);
      return json(res,200,{restaurant:db.prepare('SELECT * FROM restaurants WHERE id=?').get(id)});
    }
    fail('ไม่พบเส้นทางที่ร้องขอ',404);
  } catch(error) { if (!error.status) console.error(error); json(res,error.status || 500,{error:error.status ? error.message : 'ระบบมีปัญหา กรุณาลองใหม่'}); }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => console.log(`สิ้นเดือนยังมีข้าว → http://localhost:${server.address().port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
