// db.js — MySQL Connection Pool
// Supports Railway (MYSQL* vars) with local dev fallback (DB_* vars)
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:               process.env.MYSQLHOST                                  // Railway: mysql.railway.internal
                   || process.env.DB_HOST     || 'localhost',

  port:               parseInt(
                        process.env.MYSQLPORT                                // Railway: 3306
                     || process.env.DB_PORT   || '3306'),

  user:               process.env.MYSQLUSER                                  // Railway: root
                   || process.env.DB_USER     || 'root',

  password:           process.env.MYSQLPASSWORD                              // Railway: primary password var
                   || process.env.MYSQL_ROOT_PASSWORD                        // Railway: fallback password var
                   || process.env.DB_PASSWORD || '',

  database:           process.env.MYSQLDATABASE                              // Railway: railway
                   || process.env.MYSQL_DATABASE                             // Railway: fallback database var
                   || process.env.DB_NAME     || 'flatfinder',

  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
  ssl:                { rejectUnauthorized: false },                          // Required for Railway; safe for local too
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
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
    throw err;
  } finally {
    conn.release();
  }
}

export default pool;
