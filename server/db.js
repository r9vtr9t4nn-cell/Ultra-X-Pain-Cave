// Tiny durable document store. Data lives in a single JSON file written
// atomically (temp file + rename) so a crash can never leave a half-written
// database. Everything is scoped per user id at the API layer.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'ultra-coach.json');

const COLLECTIONS = [
  'users',
  'sessions',
  'meals',
  'metrics',
  'activities',
  'reminders',
  'recipes',
  'uploads',
];

function emptyState() {
  const state = { version: 1, createdAt: new Date().toISOString() };
  for (const name of COLLECTIONS) state[name] = [];
  return state;
}

let state = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      state = { ...emptyState(), ...parsed };
    } catch (err) {
      console.error('[db] could not read data file, starting fresh:', err.message);
      state = emptyState();
    }
  } else {
    state = emptyState();
    persist();
  }
  for (const name of COLLECTIONS) {
    if (!Array.isArray(state[name])) state[name] = [];
  }
  return state;
}

export function persist() {
  ensureDirs();
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function db() {
  if (!state) load();
  return state;
}

export function list(collection, filter) {
  const rows = db()[collection] || [];
  if (!filter) return rows.slice();
  return rows.filter((row) =>
    Object.entries(filter).every(([key, value]) => row[key] === value),
  );
}

export function getById(collection, id) {
  return (db()[collection] || []).find((row) => row.id === id) || null;
}

export function findOne(collection, filter) {
  return list(collection, filter)[0] || null;
}

export function insert(collection, doc) {
  const row = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...doc,
  };
  db()[collection].push(row);
  persist();
  return row;
}

export function update(collection, id, patch) {
  const row = getById(collection, id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  persist();
  return row;
}

export function remove(collection, id) {
  const rows = db()[collection];
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return false;
  rows.splice(index, 1);
  persist();
  return true;
}

export function removeWhere(collection, predicate) {
  const rows = db()[collection];
  const kept = rows.filter((row) => !predicate(row));
  const removed = rows.length - kept.length;
  if (removed > 0) {
    db()[collection] = kept;
    persist();
  }
  return removed;
}
