import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedRestaurants } from './seed.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const filename = process.env.DB_PATH || resolve(root, 'data/restaurants.sqlite');
mkdirSync(dirname(filename), { recursive: true });
export const db = new DatabaseSync(filename);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
// Seed เฉพาะตอนสร้างตารางครั้งแรก เพื่อไม่เติมร้านกลับมาหลังผู้ใช้ลบหมด
const existed = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='restaurants'").get();
db.exec(`CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  menu TEXT NOT NULL,
  price REAL NOT NULL CHECK(price > 0),
  category TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
if (!existed) {
  const insert = db.prepare('INSERT INTO restaurants (name, location, menu, price, category, rating, review, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  db.exec('BEGIN');
  try { for (const row of seedRestaurants) insert.run(...row); db.exec('COMMIT'); }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
