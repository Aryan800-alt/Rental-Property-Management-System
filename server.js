// server.js — FlatFinder API Server
// Industry-grade Express + MySQL + JWT backend
// ─────────────────────────────────────────────
import express      from 'express';
import cors         from 'cors';
import helmet       from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt       from 'bcryptjs';
import jwt          from 'jsonwebtoken';
import dotenv       from 'dotenv';
import path         from 'path';
import { fileURLToPath } from 'url';
import { query, queryOne, validateConnection } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app         = express();
const PORT        = parseInt(process.env.PORT   || '3000');
const SECRET      = process.env.JWT_SECRET || 'change_me_in_production_use_env';
const SALT_ROUNDS = 12;
const IS_PROD     = process.env.NODE_ENV === 'production';

// ── CONSTANTS ─────────────────────────────────────
const VALID_ROLES    = ['tenant', 'owner', 'admin'];
const VALID_TYPES    = ['1BHK', '2BHK', '3BHK', 'Studio', '4BHK+'];
const VALID_STATUSES = { booking: ['confirmed', 'cancelled'], listing: ['approved', 'rejected'], user: ['active', 'suspended'] };

// ── CORS ──────────────────────────────────────────
// Allows configured origins + any localhost/127.0.0.1 port + file:// (null origin)
const ALLOWED_ORIGINS   = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim());
const LOCAL_ORIGIN_RE   = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const RAILWAY_ORIGIN_RE = /^https?:\/\/[\w-]+\.up\.railway\.app$/;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === 'null' || ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin) || RAILWAY_ORIGIN_RE.test(origin))
      return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── MIDDLEWARE ────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── RESPONSE HELPERS ──────────────────────────────
const ok   = (res, data, message = 'OK', code = 200) => res.status(code).json({ success: true,  data,   message });
const fail = (res, message = 'Error', code = 400)    => res.status(code).json({ success: false, data: null, message });
const strip = ({ password, ...u }) => u;

// ── JWT HELPERS ───────────────────────────────────
function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, SECRET, { expiresIn: '7d' });
}

function setTokenCookie(res, token) {
  res.cookie('ff_token', token, {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });
}

// ── VALIDATION HELPERS ────────────────────────────
const isValidEmail    = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const isValidPassword = (p) => typeof p === 'string' && p.length >= 6;

// ── AUTH MIDDLEWARE ───────────────────────────────
function authenticate(req, res, next) {
  const token =
    req.cookies?.ff_token ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) return fail(res, 'Unauthorized — please log in.', 401);

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid session. Please log in again.';
    return fail(res, msg, 401);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return fail(res, 'Forbidden — insufficient permissions.', 403);
    next();
  };
}

// ── DB ERROR HANDLER ──────────────────────────────
function handleDbError(res, err, context) {
  console.error(`[${context}]`, err);
  if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_NO_DB_ERROR')
    return fail(res, 'Database tables not found. Please run schema.sql in MySQL first.', 503);
  if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR')
    return fail(res, 'Cannot connect to Railway MySQL. Check MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE/MYSQLPORT in Railway environment variables.', 503);
  return fail(res, 'Server error.', 500);
}

// ─────────────────────────────────────────────────
// AUTH ROUTES  (index.html — login / signup pages)
// ─────────────────────────────────────────────────

// POST /api/signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body ?? {};

    if (!name?.trim())               return fail(res, 'Full name is required.');
    if (name.trim().length < 2)      return fail(res, 'Name must be at least 2 characters.');
    if (!isValidEmail(email))        return fail(res, 'A valid email address is required.');
    if (!isValidPassword(password))  return fail(res, 'Password must be at least 6 characters.');
    if (!VALID_ROLES.includes(role)) return fail(res, 'Role must be tenant, owner, or admin.');

    const normalEmail = email.trim().toLowerCase();
    const existing    = await queryOne('SELECT id FROM users WHERE email = ?', [normalEmail]);
    if (existing) return fail(res, 'An account with this email already exists.', 409);

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    await query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name.trim(), normalEmail, hashed, role]);

    const user  = await queryOne('SELECT * FROM users WHERE email = ?', [normalEmail]);
    const token = signToken(user);
    setTokenCookie(res, token);
    return ok(res, { user: strip(user), token }, 'Account created successfully.', 201);
  } catch (err) {
    return handleDbError(res, err, 'POST /api/signup');
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email)) return fail(res, 'A valid email address is required.');
    if (!password)            return fail(res, 'Password is required.');

    const normalEmail = email.trim().toLowerCase();
    const user        = await queryOne('SELECT * FROM users WHERE email = ?', [normalEmail]);

    // Constant-time comparison to prevent timing attacks
    if (!user) {
      await bcrypt.compare(password, '$2a$12$invalidhashfortimingprotection0000000000000');
      return fail(res, 'Invalid email or password.', 401);
    }
    if (user.status === 'suspended')
      return fail(res, 'Your account has been suspended. Contact support.', 403);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return fail(res, 'Invalid email or password.', 401);

    const token = signToken(user);
    setTokenCookie(res, token);
    return ok(res, { user: strip(user), token }, 'Welcome back!');
  } catch (err) {
    return handleDbError(res, err, 'POST /api/login');
  }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('ff_token', { httpOnly: true, sameSite: IS_PROD ? 'strict' : 'lax', secure: IS_PROD });
  return ok(res, null, 'Logged out successfully.');
});

// GET /api/me
app.get('/api/me', authenticate, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return fail(res, 'User not found.', 404);
    if (user.status === 'suspended') return fail(res, 'Account suspended.', 403);
    return ok(res, strip(user));
  } catch (err) {
    return handleDbError(res, err, 'GET /api/me');
  }
});

// ─────────────────────────────────────────────────
// USER ROUTES  (admin_index.html — User Management)
// ─────────────────────────────────────────────────

// GET /api/users
app.get('/api/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let sql    = 'SELECT id, name, email, role, status, created_at FROM users WHERE 1=1';
    const args = [];

    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      sql += ' AND (name LIKE ? OR email LIKE ?)';
      args.push(s, s);
    }
    if (role   && VALID_ROLES.includes(role))                        { sql += ' AND role = ?';   args.push(role); }
    if (status && VALID_STATUSES.user.includes(status))              { sql += ' AND status = ?'; args.push(status); }
    sql += ' ORDER BY created_at DESC';

    return ok(res, await query(sql, args));
  } catch (err) {
    return handleDbError(res, err, 'GET /api/users');
  }
});

// PATCH /api/users/:id
app.patch('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body ?? {};

    if (!VALID_STATUSES.user.includes(status)) return fail(res, 'Status must be active or suspended.');
    if (id === req.user.id) return fail(res, 'You cannot change your own account status.');

    const target = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!target) return fail(res, 'User not found.', 404);

    await query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    return ok(res, { id, status }, `User ${status === 'active' ? 'activated' : 'suspended'} successfully.`);
  } catch (err) {
    return handleDbError(res, err, 'PATCH /api/users/:id');
  }
});

// DELETE /api/users/:id
app.delete('/api/users/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return fail(res, 'You cannot delete your own account.');

    const target = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!target) return fail(res, 'User not found.', 404);

    await query('DELETE FROM users WHERE id = ?', [id]);
    return ok(res, { deleted: id }, 'User deleted successfully.');
  } catch (err) {
    return handleDbError(res, err, 'DELETE /api/users/:id');
  }
});

// ─────────────────────────────────────────────────
// FLAT ROUTES  (owner_index.html + tenant_index.html)
// ─────────────────────────────────────────────────

// GET /api/flats
app.get('/api/flats', authenticate, async (req, res) => {
  try {
    const { city, type, furnished, min_rent, max_rent, owner_id } = req.query;
    let sql    = `SELECT f.*, u.name AS owner_name FROM flats f JOIN users u ON u.id = f.owner_id WHERE 1=1`;
    const args = [];

    if (city?.trim()) { sql += ' AND f.city LIKE ?'; args.push(`%${city.trim()}%`); }
    if (type && VALID_TYPES.includes(type)) { sql += ' AND f.type = ?'; args.push(type); }
    if (furnished !== undefined && furnished !== '') {
      sql += ' AND f.furnished = ?';
      args.push(furnished === '1' || furnished === 'true' ? 1 : 0);
    }
    if (min_rent && !isNaN(min_rent)) { sql += ' AND f.rent >= ?'; args.push(parseFloat(min_rent)); }
    if (max_rent && !isNaN(max_rent)) { sql += ' AND f.rent <= ?'; args.push(parseFloat(max_rent)); }

    if (req.user.role === 'owner') {
      sql += ' AND f.owner_id = ?'; args.push(owner_id || req.user.id);
    } else if (req.user.role === 'tenant') {
      sql += ` AND f.available = 1 AND EXISTS (
                 SELECT 1 FROM listings l WHERE l.flat_id = f.id AND l.status = 'approved'
               )`;
    }
    // admin sees everything
    sql += ' ORDER BY f.created_at DESC';
    return ok(res, await query(sql, args));
  } catch (err) {
    return handleDbError(res, err, 'GET /api/flats');
  }
});

// GET /api/flats/:id
app.get('/api/flats/:id', authenticate, async (req, res) => {
  try {
    const flat = await queryOne(
      `SELECT f.*, u.name AS owner_name FROM flats f JOIN users u ON u.id = f.owner_id WHERE f.id = ?`,
      [req.params.id]
    );
    if (!flat) return fail(res, 'Flat not found.', 404);

    if (typeof flat.amenities === 'string') { try { flat.amenities = JSON.parse(flat.amenities); } catch { flat.amenities = []; } }
    if (typeof flat.images    === 'string') { try { flat.images    = JSON.parse(flat.images);    } catch { flat.images    = []; } }

    return ok(res, flat);
  } catch (err) {
    return handleDbError(res, err, 'GET /api/flats/:id');
  }
});

// POST /api/flats
app.post('/api/flats', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const { title, description, city, address, rent, type, furnished, amenities, images } = req.body ?? {};

    if (!title?.trim())                    return fail(res, 'Title is required.');
    if (!city?.trim())                     return fail(res, 'City is required.');
    if (!rent || isNaN(rent) || rent <= 0) return fail(res, 'A valid monthly rent is required.');
    if (!VALID_TYPES.includes(type))       return fail(res, `Flat type must be one of: ${VALID_TYPES.join(', ')}.`);

    const ownerId = req.user.role === 'admin' ? (req.body.owner_id || req.user.id) : req.user.id;

    await query(
      `INSERT INTO flats (owner_id, title, description, city, address, rent, type, furnished, amenities, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        title.trim(),
        description?.trim() || '',
        city.trim(),
        address?.trim() || '',
        parseFloat(rent),
        type,
        (furnished == 1 || furnished === 'true' || furnished === true) ? 1 : 0,
        JSON.stringify(Array.isArray(amenities) ? amenities : []),
        JSON.stringify(Array.isArray(images)    ? images    : []),
      ]
    );

    const flat = await queryOne('SELECT * FROM flats WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1', [ownerId]);
    await query('INSERT INTO listings (flat_id, owner_id) VALUES (?, ?)', [flat.id, ownerId]);
    return ok(res, flat, 'Flat submitted for review. An admin will approve it shortly.', 201);
  } catch (err) {
    return handleDbError(res, err, 'POST /api/flats');
  }
});

// DELETE /api/flats/:id
app.delete('/api/flats/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
  try {
    const flat = await queryOne('SELECT * FROM flats WHERE id = ?', [req.params.id]);
    if (!flat) return fail(res, 'Flat not found.', 404);
    if (req.user.role === 'owner' && flat.owner_id !== req.user.id)
      return fail(res, 'Forbidden — this is not your flat.', 403);

    await query('DELETE FROM flats WHERE id = ?', [req.params.id]);
    return ok(res, { deleted: req.params.id }, 'Flat deleted.');
  } catch (err) {
    return handleDbError(res, err, 'DELETE /api/flats/:id');
  }
});

// ─────────────────────────────────────────────────
// LISTING ROUTES  (admin_index.html — Approvals)
// ─────────────────────────────────────────────────

// GET /api/listings
app.get('/api/listings', authenticate, authorize('admin', 'owner'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT l.*,
                 f.title AS flat_title, f.city, f.rent, f.type,
                 u.name  AS owner_name,
                 r.name  AS reviewer_name
               FROM listings l
               JOIN flats f ON f.id = l.flat_id
               JOIN users  u ON u.id = l.owner_id
               LEFT JOIN users r ON r.id = l.reviewed_by
               WHERE 1=1`;
    const args = [];

    if (req.user.role === 'owner') { sql += ' AND l.owner_id = ?'; args.push(req.user.id); }
    if (status && VALID_STATUSES.listing.concat(['pending']).includes(status)) {
      sql += ' AND l.status = ?'; args.push(status);
    }
    sql += ' ORDER BY l.submitted_at DESC';
    return ok(res, await query(sql, args));
  } catch (err) {
    return handleDbError(res, err, 'GET /api/listings');
  }
});

// PATCH /api/listings/:id
app.patch('/api/listings/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!VALID_STATUSES.listing.includes(status)) return fail(res, 'Status must be approved or rejected.');

    const listing = await queryOne('SELECT * FROM listings WHERE id = ?', [req.params.id]);
    if (!listing) return fail(res, 'Listing not found.', 404);

    await query('UPDATE listings SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
      [status, req.user.id, req.params.id]);
    await query('UPDATE flats SET available = ? WHERE id = ?',
      [status === 'approved' ? 1 : 0, listing.flat_id]);

    return ok(res, { id: req.params.id, status }, `Listing ${status} successfully.`);
  } catch (err) {
    return handleDbError(res, err, 'PATCH /api/listings/:id');
  }
});

// ─────────────────────────────────────────────────
// BOOKING ROUTES  (tenant_index.html)
// ─────────────────────────────────────────────────

// GET /api/bookings
app.get('/api/bookings', authenticate, async (req, res) => {
  try {
    let sql = `SELECT b.*,
                 f.title AS flat_title, f.city, f.type, f.rent,
                 t.name  AS tenant_name, t.email AS tenant_email,
                 o.name  AS owner_name
               FROM bookings b
               JOIN flats f ON f.id = b.flat_id
               JOIN users  t ON t.id = b.tenant_id
               JOIN users  o ON o.id = b.owner_id
               WHERE 1=1`;
    const args = [];

    if (req.user.role === 'tenant') { sql += ' AND b.tenant_id = ?'; args.push(req.user.id); }
    if (req.user.role === 'owner')  { sql += ' AND b.owner_id  = ?'; args.push(req.user.id); }
    sql += ' ORDER BY b.created_at DESC';

    return ok(res, await query(sql, args));
  } catch (err) {
    return handleDbError(res, err, 'GET /api/bookings');
  }
});

// POST /api/bookings
app.post('/api/bookings', authenticate, authorize('tenant'), async (req, res) => {
  try {
    const { flat_id, check_in, check_out } = req.body ?? {};

    if (!flat_id)   return fail(res, 'Flat ID is required.');
    if (!check_in)  return fail(res, 'Check-in date is required.');
    if (!check_out) return fail(res, 'Check-out date is required.');

    const checkInDate  = new Date(check_in);
    const checkOutDate = new Date(check_out);
    const today        = new Date(); today.setHours(0, 0, 0, 0);

    if (isNaN(checkInDate.getTime()))  return fail(res, 'Invalid check-in date.');
    if (isNaN(checkOutDate.getTime())) return fail(res, 'Invalid check-out date.');
    if (checkInDate < today)           return fail(res, 'Check-in date cannot be in the past.');
    if (checkOutDate <= checkInDate)   return fail(res, 'Check-out must be after check-in.');

    const flat = await queryOne(
      `SELECT f.* FROM flats f
       WHERE f.id = ? AND f.available = 1
         AND EXISTS (SELECT 1 FROM listings l WHERE l.flat_id = f.id AND l.status = 'approved')`,
      [flat_id]
    );
    if (!flat) return fail(res, 'Flat is not available for booking.');

    const overlap = await queryOne(
      `SELECT id FROM bookings WHERE flat_id = ? AND status != 'cancelled' AND check_in < ? AND check_out > ?`,
      [flat_id, check_out, check_in]
    );
    if (overlap) return fail(res, 'Flat is already booked for these dates.', 409);

    const days      = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    const totalRent = parseFloat((parseFloat(flat.rent) / 30 * days).toFixed(2));

    await query(
      'INSERT INTO bookings (flat_id, tenant_id, owner_id, check_in, check_out, total_rent) VALUES (?,?,?,?,?,?)',
      [flat_id, req.user.id, flat.owner_id, check_in, check_out, totalRent]
    );

    const booking = await queryOne(
      'SELECT * FROM bookings WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    return ok(res, booking, 'Booking submitted. Awaiting owner confirmation.', 201);
  } catch (err) {
    return handleDbError(res, err, 'POST /api/bookings');
  }
});

// PATCH /api/bookings/:id
app.patch('/api/bookings/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!VALID_STATUSES.booking.includes(status)) return fail(res, 'Status must be confirmed or cancelled.');

    const booking = await queryOne('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
    if (!booking) return fail(res, 'Booking not found.', 404);

    const isOwner  = req.user.role === 'owner'  && booking.owner_id  === req.user.id;
    const isTenant = req.user.role === 'tenant' && booking.tenant_id === req.user.id;
    const isAdmin  = req.user.role === 'admin';

    if (!isOwner && !isTenant && !isAdmin) return fail(res, 'Forbidden.', 403);
    if (isTenant && status === 'confirmed') return fail(res, 'Tenants cannot confirm bookings.', 403);

    await query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id]);
    return ok(res, { id: req.params.id, status }, `Booking ${status}.`);
  } catch (err) {
    return handleDbError(res, err, 'PATCH /api/bookings/:id');
  }
});

// ── HEALTH CHECK ──────────────────────────────────
app.get('/api/ping', async (req, res) => {
  try {
    await query('SELECT 1');
    return res.json({ success: true, message: 'OK — MySQL connected.' });
  } catch (err) {
    return res.status(503).json({ success: false, message: 'MySQL not connected: ' + err.message });
  }
});

// ── STATIC FILES ──────────────────────────────────
// Mounted after all API routes so POST/PATCH/DELETE are never intercepted
app.use(express.static(__dirname));

// ── 404 & GLOBAL ERROR HANDLER ────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/'))
    return fail(res, `Route ${req.method} ${req.path} not found.`, 404);
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[Unhandled Error]', err);
  return fail(res, IS_PROD ? 'Internal server error.' : err.message, 500);
});

// ── START ─────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  🏠  FlatFinder API — http://localhost:${PORT}   ║`);
  console.log(`║  ENV: ${IS_PROD ? 'production ' : 'development'}                        ║`);
  console.log('╚══════════════════════════════════════════════╝');
  await validateConnection(); // Robust DB check — logs details, exits on failure
  console.log('');
});

export default app;
