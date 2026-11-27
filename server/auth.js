import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, findOne, insert, update } from './db.js';
import { todayISO } from './dates.js';
import { RACE, defaultProfile, defaultReminders } from './defaults.js';
import { seedRecipes } from './recipes.js';

const COOKIE_NAME = 'uc_session';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretPath() {
  return path.join(DATA_DIR, 'session.key');
}

/** Signing secret from the environment, or a random key persisted in the data dir. */
export function getSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  const file = secretPath();
  try {
    if (fs.existsSync(file)) {
      const stored = fs.readFileSync(file, 'utf8').trim();
      if (stored.length >= 32) return stored;
    }
  } catch {
    /* fall through and regenerate */
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    profile: user.profile,
    race: RACE,
    today: todayISO(),
  };
}

export function issueSession(res, req, user) {
  const token = jwt.sign({ sub: user.id }, getSecret(), { expiresIn: TOKEN_TTL_SECONDS });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req, res, next) {
  const token =
    req.cookies?.[COOKIE_NAME] ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const payload = jwt.verify(token, getSecret());
    const user = findOne('users', { id: payload.sub });
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}

// Simple in-memory throttle for credential endpoints (per IP + route).
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

function throttle(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { first: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  return next();
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function createAuthRouter() {
  const router = express.Router();

  router.post('/register', throttle, async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (findOne('users', { email })) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = insert('users', {
      email,
      passwordHash,
      profile: defaultProfile(req.body?.profile || {}),
    });
    for (const reminder of defaultReminders()) insert('reminders', { ...reminder, userId: user.id });
    for (const recipe of seedRecipes()) insert('recipes', { ...recipe, userId: user.id });

    issueSession(res, req, user);
    return res.status(201).json({ user: publicUser(user) });
  });

  router.post('/login', throttle, async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const user = findOne('users', { email });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect' });
    issueSession(res, req, user);
    return res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  router.patch('/password', requireAuth, async (req, res) => {
    const current = String(req.body?.currentPassword || '');
    const next = String(req.body?.newPassword || '');
    if (!(await bcrypt.compare(current, req.user.passwordHash))) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
    if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const passwordHash = await bcrypt.hash(next, 12);
    update('users', req.user.id, { passwordHash });
    res.json({ ok: true });
  });

  return router;
}

export { COOKIE_NAME };
