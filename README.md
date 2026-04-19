# 🏠 FlatFinder

A full-stack rental flat management platform with role-based access for **Tenants**, **Owners**, and **Admins**.

---

## 🚀 Quick Setup

### 1. Prerequisites
- **Node.js** v18 or higher
- **MySQL** 8.0 or higher

### 2. Install dependencies
```bash
npm install
```

### 3. Setup the database
```sql
-- In MySQL Workbench, DBeaver, or mysql CLI:
source schema.sql
```
Or run it directly:
```bash
mysql -u root -p < schema.sql
```

### 4. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in your MySQL credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=flatfinder
JWT_SECRET=your_long_random_secret_here
PORT=3000
FRONTEND_ORIGIN=http://localhost:3000
```

### 5. Start the server
```bash
# Production
npm start

# Development (auto-restarts on change)
npm run dev
```

### 6. Open in browser
```
http://localhost:3000
```

---

## 📁 File Structure

```
flatfinder/
├── server.js          ← Express API server (backend)
├── app.js             ← SPA frontend controller
├── style.css          ← Design system & styles
├── index.html         ← Main entry point (auto-detects role)
├── tenant_index.html  ← Tenant-specific entry
├── owner_index.html   ← Owner-specific entry
├── admin_index.html   ← Admin-specific entry
├── db.js              ← MySQL connection pool
├── schema.sql         ← Database schema
├── package.json
├── .env.example
└── README.md
```

---

## 👥 User Roles

| Role   | Capabilities |
|--------|-------------|
| **Tenant** | Browse & search approved flats, book flats, view/cancel bookings |
| **Owner**  | List flats for review, track listing approval status |
| **Admin**  | Approve/reject listings, manage users (suspend/activate/delete), view all data |

---

## 🔌 API Reference

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/signup` | Create account |
| POST | `/api/login` | Login |
| POST | `/api/logout` | Logout |
| GET  | `/api/me` | Get current user |

### Flats
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET    | `/api/flats` | All | List flats (role-filtered) |
| GET    | `/api/flats/:id` | All | Get flat details |
| POST   | `/api/flats` | Owner/Admin | Create flat |
| DELETE | `/api/flats/:id` | Owner/Admin | Delete flat |

### Listings
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET    | `/api/listings` | Admin/Owner | Get listings |
| PATCH  | `/api/listings/:id` | Admin | Approve/reject |

### Bookings
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET    | `/api/bookings` | All | Get bookings (role-filtered) |
| POST   | `/api/bookings` | Tenant | Create booking |
| PATCH  | `/api/bookings/:id` | All | Update booking status |

### Users
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET    | `/api/users` | Admin | List users |
| PATCH  | `/api/users/:id` | Admin | Suspend/activate |
| DELETE | `/api/users/:id` | Admin | Delete user |

---

## 🔒 Security Features

- **Passwords** hashed with bcrypt (12 rounds)
- **JWT** tokens stored in httpOnly cookies (CSRF-safe)
- **Timing-attack-safe** login (constant-time comparison)
- **Role-based** route guards on both frontend and backend
- **XSS protection** via HTML escaping in all rendered content
- **CORS** restricted to configured origin
- **Helmet** HTTP security headers
- **Input validation** on all API endpoints

---

## 🐛 Common Issues

**"Network error. Is the server running?"**
→ Make sure `npm start` is running and you're opening `http://localhost:3000` (not a file:// URL).

**"Access denied" or MySQL errors**
→ Check your `.env` DB credentials. Ensure the `flatfinder` database exists (`source schema.sql`).

**Login/signup not working**
→ Ensure you're on `http://localhost:3000`. The backend serves the frontend — don't open HTML files directly.

**CORS errors in browser console**
→ Set `FRONTEND_ORIGIN=http://localhost:3000` in `.env` and restart the server.
