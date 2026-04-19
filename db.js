// db.js — Railway Production-Ready MySQL Connection Pool
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// ── ENV VALIDATION ────────────────────────────────
const REQUIRED_VARS = ['MYSQLHOST', 'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE'];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error('[db.js] ❌ Missing required environment variables:', missing.join(', '));
  console.error('[db.js]    → On Railway: add MySQL plugin and link it to your service.');
  console.error('[db.js]    → Locally: fill in .env with DB_* fallback values.');
  process.exit(1);  // Crash early with a clear message — do not silently fail
}

// ── CONNECTION CONFIG ─────────────────────────────
const MYSQL_PORT = parseInt(process.env.MYSQLPORT ?? '3306', 10);

if (isNaN(MYSQL_PORT) || MYSQL_PORT < 1 || MYSQL_PORT > 65535) {
  console.error(`[db.js] ❌ Invalid MYSQLPORT value: "${process.env.MYSQLPORT}"`);
  process.exit(1);
}

const poolConfig = {
  host:               process.env.MYSQLHOST,
  port:               MYSQL_PORT,
  user:               process.env.MYSQLUSER,
  password:           process.env.MYSQLPASSWORD,
  database:           process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit:    10,       // Max concurrent connections
  queueLimit:         0,        // Unlimited queue
  timezone:           '+00:00', // Always store/read UTC
  charset:            'utf8mb4',
  connectTimeout:     10000,    // 10s — fail fast if Railway MySQL is unreachable
};

// ── SSL (Railway internal network — no SSL needed) ──
// MYSQLHOST=mysql.railway.internal uses Railway's private network (no SSL).
// MYSQL_PUBLIC_URL uses public network (SSL required).
// We default to internal host so SSL is intentionally omitted.
if (process.env.MYSQLHOST?.includes('railway.app') ||
    process.env.MYSQLHOST?.includes('roundhouse.proxy')) {
  poolConfig.ssl = { rejectUnauthorized: false }; // Public URL fallback
}

// ── CREATE POOL ───────────────────────────────────
const pool = mysql.createPool(poolConfig);

// ── CONNECTION VALIDATION ─────────────────────────
// Runs once at startup — crashes early if DB is unreachable
export async function validateConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('SELECT 1');
    console.log('[db.js] ✅ MySQL connected successfully.');
    console.log(`[db.js]    Host     : ${process.env.MYSQLHOST}`);
    console.log(`[db.js]    Port     : ${MYSQL_PORT}`);
    console.log(`[db.js]    Database : ${process.env.MYSQLDATABASE}`);
    console.log(`[db.js]    User     : ${process.env.MYSQLUSER}`);
  } catch (err) {
    console.error('[db.js] ❌ MySQL connection failed:', err.message);
    console.error('[db.js]    Code    :', err.code);
    console.error('[db.js]    Host    :', process.env.MYSQLHOST);
    console.error('[db.js]    Port    :', MYSQL_PORT);
    console.error('[db.js]    Check   : Railway MySQL plugin is linked to this service.');
    process.exit(1); // Crash with clear log — better than silent 500 errors
  } finally {
    if (conn) conn.release();
  }
}

// ── QUERY HELPERS ─────────────────────────────────
export async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (err) {
    console.error('[db.js] Query error:', err.message);
    console.error('[db.js] SQL:', sql);
    throw err; // Re-throw so server.js handleDbError() catches it properly
  }
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    console.error('[db.js] Transaction rolled back:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

export default pool;
