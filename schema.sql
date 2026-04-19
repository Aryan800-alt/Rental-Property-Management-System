-- ─────────────────────────────────────────────
-- FlatFinder — MySQL Schema
-- ─────────────────────────────────────────────

-- NOTE: CREATE DATABASE / USE are removed for Railway compatibility.
-- Railway provisions the database automatically. Run this file directly
-- via Railway's MySQL console or any connected client.

-- ── USERS ──
CREATE TABLE IF NOT EXISTS users (
  id          CHAR(36)     NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('tenant','owner','admin') NOT NULL DEFAULT 'tenant',
  status      ENUM('active','suspended')    NOT NULL DEFAULT 'active',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── FLATS ──
CREATE TABLE IF NOT EXISTS flats (
  id          CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
  owner_id    CHAR(36)      NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  description TEXT,
  city        VARCHAR(100)  NOT NULL,
  address     VARCHAR(300),
  rent        DECIMAL(10,2) NOT NULL,
  type        ENUM('1BHK','2BHK','3BHK','Studio','4BHK+') NOT NULL,
  furnished   TINYINT(1)    NOT NULL DEFAULT 0,
  available   TINYINT(1)    NOT NULL DEFAULT 1,
  amenities   JSON,
  images      JSON,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_flat_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── LISTINGS ──
CREATE TABLE IF NOT EXISTS listings (
  id           CHAR(36)  NOT NULL PRIMARY KEY DEFAULT (UUID()),
  flat_id      CHAR(36)  NOT NULL UNIQUE,
  owner_id     CHAR(36)  NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME,
  reviewed_by  CHAR(36),
  CONSTRAINT fk_listing_flat     FOREIGN KEY (flat_id)     REFERENCES flats(id) ON DELETE CASCADE,
  CONSTRAINT fk_listing_owner    FOREIGN KEY (owner_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_listing_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ── BOOKINGS ──
CREATE TABLE IF NOT EXISTS bookings (
  id          CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
  flat_id     CHAR(36)      NOT NULL,
  tenant_id   CHAR(36)      NOT NULL,
  owner_id    CHAR(36)      NOT NULL,
  check_in    DATE          NOT NULL,
  check_out   DATE          NOT NULL,
  total_rent  DECIMAL(12,2) NOT NULL,
  status      ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_flat   FOREIGN KEY (flat_id)   REFERENCES flats(id)  ON DELETE CASCADE,
  CONSTRAINT fk_booking_tenant FOREIGN KEY (tenant_id) REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_booking_owner  FOREIGN KEY (owner_id)  REFERENCES users(id)  ON DELETE CASCADE
);

-- ── INDEXES ──
CREATE INDEX idx_flats_owner     ON flats(owner_id);
CREATE INDEX idx_flats_city      ON flats(city);
CREATE INDEX idx_flats_available ON flats(available);
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_flat   ON bookings(flat_id);
CREATE INDEX idx_listings_status ON listings(status);
