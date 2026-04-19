// app.js — FlatFinder Frontend Controller
// SPA Router | State | API Client | Views | Events
// Modules: Core · Auth · Tenant · Owner · Admin
// ─────────────────────────────────────────────

// ── CONFIG ──────────────────────────────────────
// Talks to Express backend (MySQL via Railway or local).
// LOCAL  : served via node server.js at http://localhost:3000
// RAILWAY: served from the same origin — API resolves to ""
// To start locally: node server.js  OR  double-click start.bat (Windows)
const API = (() => {
  const { protocol, hostname, port } = location;
  const isLocalServer =
    protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1") &&
    port === "3000";
  const isRailway =
    hostname.endsWith(".railway.app") || hostname.endsWith(".up.railway.app");
  if (isLocalServer || isRailway) return "";
  return "http://localhost:3000"; // file:// or Live Server fallback
})();

// ── TOKEN ────────────────────────────────────────
// JWT in localStorage for cross-origin (file:// → localhost:3000) support
const Token = {
  get: () => localStorage.getItem("ff_jwt"),
  save: (t) => t && localStorage.setItem("ff_jwt", t),
  clear: () => localStorage.removeItem("ff_jwt"),
};

// ── GLOBAL STATE ─────────────────────────────────
const appState = {
  currentUser: null,
  flats: [],
  bookings: [],
  users: [],
  listings: [],
  _selectedFlat: null,
};

// ── API CLIENT ───────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const token = Token.get();
    const init = {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    };
    if (options.body) {
      init.body =
        typeof options.body === "object"
          ? JSON.stringify(options.body)
          : options.body;
    }

    const res = await fetch(`${API}${path}`, init);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return {
        success: false,
        data: null,
        message: `Server error ${res.status}. Is the server running? (local: node server.js / Railway: check deployment)`,
      };
    }

    const json = await res.json();
    if (json?.data?.token) Token.save(json.data.token);
    return json;
  } catch (err) {
    console.error("[apiFetch]", path, err);
    return {
      success: false,
      data: null,
      message: `Cannot reach server. Local: run start.bat or "node server.js". Railway: check deployment logs.`,
    };
  }
}

// ── SECURITY ─────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── RENDER ───────────────────────────────────────
function render(html) {
  const root = document.getElementById("app-root");
  if (!root) return;
  root.innerHTML = html;
  bindEvents();
}

function renderNavBar() {
  const nav = document.getElementById("app-nav");
  if (!nav) return;
  const u = appState.currentUser;
  if (!u) {
    nav.innerHTML = "";
    return;
  }

  const roleLinks = {
    tenant: [
      { label: "🏠 Dashboard", route: "/tenant/dashboard" },
      { label: "🔍 Search Flats", route: "/tenant/search" },
      { label: "📋 My Bookings", route: "/tenant/bookings" },
    ],
    owner: [
      { label: "🏠 Dashboard", route: "/owner/dashboard" },
      { label: "📋 Listings", route: "/owner/listings" },
      { label: "➕ Add Flat", route: "/owner/add-flat" },
    ],
    admin: [
      { label: "🏠 Dashboard", route: "/admin/dashboard" },
      { label: "✅ Approvals", route: "/admin/approvals" },
      { label: "👥 Users", route: "/admin/users" },
    ],
  };

  const badgeClass = {
    admin: "badge--danger",
    owner: "badge--warning",
    tenant: "badge--success",
  };
  const links = (roleLinks[u.role] || [])
    .map(
      (l) =>
        `<a class="nav__link" href="#${l.route}" data-route="${l.route}">${l.label}</a>`,
    )
    .join("");

  nav.innerHTML = `
    <div class="nav__inner container">
      <a class="nav__brand" href="#" data-route="/">🏠 FlatFinder</a>
      <div class="nav__links">${links}</div>
      <div class="nav__user">
        <span class="nav__name">${escHtml(u.name)}</span>
        <span class="badge ${badgeClass[u.role] || "badge--neutral"}">${u.role}</span>
        <button class="btn btn--secondary btn--sm" id="logout-btn">Logout</button>
      </div>
    </div>`;
}

// ── UI UTILITIES ─────────────────────────────────
function showToast(message, type = "info") {
  const toast = document.getElementById("app-toast");
  if (!toast) return;
  const cls = {
    success: "toast--success",
    error: "toast--error",
    warning: "toast--warning",
    info: "toast--info",
  };
  const div = document.createElement("div");
  div.className = `toast ${cls[type] || "toast--info"}`;
  div.innerHTML = `<span class="toast__message">${escHtml(message)}</span>
    <button class="toast__close" onclick="this.parentElement.remove()" aria-label="Dismiss">×</button>`;
  toast.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function showModal(html) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <button class="modal__close" onclick="closeModal()" aria-label="Close modal">×</button>
      ${html}
    </div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById("app-modal")?.appendChild(overlay);
}

function closeModal() {
  document
    .getElementById("app-modal")
    ?.querySelector(".modal-overlay")
    ?.remove();
}

// ─────────────────────────────────────────────────
// MODULE: AUTH  (index.html — login / signup)
// ─────────────────────────────────────────────────
const Auth = {
  viewLogin(mode = "login") {
    const isLogin = mode === "login";
    return `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-logo">🏠</div>
          <h1 class="auth-title">FlatFinder</h1>
          <p class="auth-sub">${isLogin ? "Sign in to your account" : "Create a new account"}</p>

          <form id="auth-form" class="auth-form" novalidate autocomplete="on">
            ${
              !isLogin
                ? `
            <div class="form-group">
              <label class="form-label" for="auth-name">Full Name</label>
              <input class="form-input" id="auth-name" name="name" type="text"
                placeholder="Aarav Mehta" autocomplete="name" required minlength="2" />
            </div>`
                : ""
            }

            <div class="form-group">
              <label class="form-label" for="auth-email">Email</label>
              <input class="form-input" id="auth-email" name="email" type="email"
                placeholder="you@example.com" autocomplete="email" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-password">Password</label>
              <div class="input-wrap">
                <input class="form-input" id="auth-password" name="password" type="password"
                  placeholder="${isLogin ? "Your password" : "At least 6 characters"}"
                  autocomplete="${isLogin ? "current-password" : "new-password"}" required minlength="6" />
                <button type="button" class="input-eye" id="toggle-password" aria-label="Toggle password visibility">👁</button>
              </div>
            </div>

            ${
              !isLogin
                ? `
            <div class="form-group">
              <label class="form-label">Account Type</label>
              <div class="role-pills">
                <label class="role-pill"><input type="radio" name="role" value="tenant" checked /> 🏠 Tenant</label>
                <label class="role-pill"><input type="radio" name="role" value="owner" /> 🔑 Owner</label>
                <label class="role-pill"><input type="radio" name="role" value="admin" /> ⚙️ Admin</label>
              </div>
            </div>`
                : ""
            }

            <div id="auth-error" class="form-error hidden"></div>

            <button class="btn btn--primary btn--full" type="submit" id="auth-submit">
              ${isLogin ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p class="auth-switch">
            ${
              isLogin
                ? `Don't have an account? <a href="#/signup" data-route="/signup">Sign up free</a>`
                : `Already have an account? <a href="#/login" data-route="/login">Sign in</a>`
            }
          </p>
        </div>
      </div>`;
  },

  bindEvents(root) {
    // Password visibility toggle
    root.querySelector("#toggle-password")?.addEventListener("click", () => {
      const input = root.querySelector("#auth-password");
      if (input) input.type = input.type === "password" ? "text" : "password";
    });

    // Auth form submit
    const authForm = root.querySelector("#auth-form");
    if (!authForm) return;

    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(authForm);
      const mode = window.location.hash.includes("signup") ? "signup" : "login";
      const btn = root.querySelector("#auth-submit");
      const errEl = root.querySelector("#auth-error");

      if (errEl) {
        errEl.textContent = "";
        errEl.classList.add("hidden");
      }

      const email = fd.get("email")?.trim();
      const password = fd.get("password");
      if (!email || !password) {
        if (errEl) {
          errEl.textContent = "Please fill in all required fields.";
          errEl.classList.remove("hidden");
        }
        return;
      }

      btn.disabled = true;
      btn.textContent = "Please wait…";

      const payload =
        mode === "signup"
          ? {
              name: fd.get("name")?.trim(),
              email,
              password,
              role: fd.get("role") || "tenant",
            }
          : { email, password };

      const r = await apiFetch(`/api/${mode}`, {
        method: "POST",
        body: payload,
      });

      btn.disabled = false;
      btn.textContent = mode === "login" ? "Sign In" : "Create Account";

      if (r.success) {
        appState.currentUser = r.data.user;
        renderNavBar();
        window.location.hash = defaultRoute();
        showToast(r.message || "Welcome!", "success");
      } else {
        const msg = r.message || "Something went wrong.";
        if (errEl) {
          errEl.textContent = msg;
          errEl.classList.remove("hidden");
        }
        showToast(msg, "error");
      }
    });
  },
};

// ─────────────────────────────────────────────────
// MODULE: TENANT  (tenant_index.html)
// ─────────────────────────────────────────────────
const Tenant = {
  viewDashboard() {
    const rows = appState.bookings.length
      ? appState.bookings
          .map(
            (b) => `
        <tr>
          <td>
            <strong>${escHtml(b.flat_title)}</strong>
            <br><small class="text-muted">📍 ${escHtml(b.city)}</small>
          </td>
          <td>${b.check_in} → ${b.check_out}</td>
          <td>₹${Number(b.total_rent).toLocaleString("en-IN")}</td>
          <td>
            <span class="badge badge--${b.status === "confirmed" ? "success" : b.status === "cancelled" ? "danger" : "warning"}">
              ${b.status}
            </span>
          </td>
          <td>
            ${
              b.status === "pending"
                ? `<button class="btn btn--danger btn--sm" data-action="cancel-booking" data-booking-id="${b.id}">Cancel</button>`
                : "—"
            }
          </td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="empty-cell">
          No bookings yet. <a href="#/tenant/search" data-route="/tenant/search">Search flats →</a>
         </td></tr>`;

    return `
      <div class="container page-content">
        <div class="page-header">
          <h2>Welcome back, ${escHtml(appState.currentUser.name.split(" ")[0])} 👋</h2>
          <a class="btn btn--primary" href="#/tenant/search" data-route="/tenant/search">🔍 Search Flats</a>
        </div>
        <div class="card">
          <h3 class="card-title">My Bookings</h3>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Flat</th><th>Dates</th><th>Total Rent</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  viewSearch(flats = appState.flats) {
    const cards = flats.length
      ? flats
          .map(
            (f) => `
        <div class="flat-card card">
          <div class="flat-card__header">
            <span class="badge badge--neutral">${escHtml(f.type)}</span>
            ${
              f.furnished
                ? '<span class="badge badge--success">Furnished</span>'
                : '<span class="badge badge--neutral">Unfurnished</span>'
            }
          </div>
          <h3 class="flat-card__title">${escHtml(f.title)}</h3>
          <p class="flat-card__city">📍 ${escHtml(f.city)}</p>
          <p class="flat-card__rent">₹${Number(f.rent).toLocaleString("en-IN")}<span>/mo</span></p>
          <p class="text-muted" style="font-size:0.8rem">Owner: ${escHtml(f.owner_name || "N/A")}</p>
          <a class="btn btn--primary btn--sm mt-sm" href="#/tenant/flat/${f.id}" data-route="/tenant/flat/${f.id}">
            View Details →
          </a>
        </div>`,
          )
          .join("")
      : `<div class="empty-state">
          <p style="font-size:2rem">🏚️</p>
          <p>No flats match your filters.</p>
          <p class="text-muted">Try adjusting your search criteria.</p>
         </div>`;

    return `
      <div class="container page-content">
        <div class="page-header"><h2>Search Flats</h2></div>
        <form id="flat-search-filter-form" class="filter-bar card">
          <input class="form-input" name="city" placeholder="City…" />
          <select class="form-select" name="type">
            <option value="">All Types</option>
            <option>1BHK</option><option>2BHK</option><option>3BHK</option>
            <option>Studio</option><option>4BHK+</option>
          </select>
          <select class="form-select" name="furnished">
            <option value="">Furnished?</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
          <input class="form-input" name="min_rent" type="number" min="0" placeholder="Min ₹" />
          <input class="form-input" name="max_rent" type="number" min="0" placeholder="Max ₹" />
          <button class="btn btn--primary" type="submit">Filter</button>
          <button class="btn btn--secondary" type="reset" id="filter-reset-btn">Clear</button>
        </form>
        <p class="text-muted" style="margin-bottom:var(--space-md)">${flats.length} flat${flats.length !== 1 ? "s" : ""} found</p>
        <div class="flat-grid">${cards}</div>
      </div>`;
  },

  viewFlatDetails(flat) {
    if (!flat)
      return `
      <div class="container page-content">
        <div class="empty-state">
          <p style="font-size:2rem">😕</p>
          <p>Flat not found.</p>
          <a class="btn btn--secondary" href="#/tenant/search" data-route="/tenant/search">Back to Search</a>
        </div>
      </div>`;

    const amenities = Array.isArray(flat.amenities) ? flat.amenities : [];
    return `
      <div class="container page-content">
        <a class="back-link" href="#/tenant/search" data-route="/tenant/search">← Back to Search</a>
        <div class="flat-detail card">
          <div class="flat-detail__meta">
            <span class="badge badge--neutral">${escHtml(flat.type)}</span>
            ${flat.furnished ? '<span class="badge badge--success">Furnished</span>' : '<span class="badge badge--neutral">Unfurnished</span>'}
            ${flat.available ? '<span class="badge badge--success">Available</span>' : '<span class="badge badge--danger">Not Available</span>'}
          </div>
          <h2>${escHtml(flat.title)}</h2>
          <p class="flat-detail__city">📍 ${escHtml(flat.city)}${flat.address ? " — " + escHtml(flat.address) : ""}</p>
          <p class="flat-detail__rent">₹${Number(flat.rent).toLocaleString("en-IN")} <span>/ month</span></p>
          ${flat.description ? `<p class="flat-detail__desc">${escHtml(flat.description)}</p>` : ""}
          ${
            amenities.length
              ? `
          <div>
            <p class="form-label" style="margin-bottom:var(--space-xs)">Amenities</p>
            <div class="amenity-tags">
              ${amenities.map((a) => `<span class="badge badge--neutral">✓ ${escHtml(a)}</span>`).join("")}
            </div>
          </div>`
              : ""
          }
          <p class="flat-detail__owner">Listed by <strong>${escHtml(flat.owner_name || "Owner")}</strong></p>
          ${
            flat.available
              ? `<a class="btn btn--primary" href="#/tenant/booking/${flat.id}" data-route="/tenant/booking/${flat.id}">📅 Book This Flat →</a>`
              : `<button class="btn btn--secondary" disabled>Not Available</button>`
          }
        </div>
      </div>`;
  },

  viewBooking(flat) {
    if (!flat)
      return `
      <div class="container page-content">
        <div class="empty-state">
          <p>Flat not found.</p>
          <a class="btn btn--secondary" href="#/tenant/search" data-route="/tenant/search">Back to Search</a>
        </div>
      </div>`;

    const today = new Date().toISOString().split("T")[0];
    return `
      <div class="container page-content">
        <a class="back-link" href="#/tenant/flat/${flat.id}" data-route="/tenant/flat/${flat.id}">← Back to Details</a>
        <div class="card form-card">
          <h2>Book Flat</h2>
          <p class="form-card__sub">${escHtml(flat.title)} — ₹${Number(flat.rent).toLocaleString("en-IN")}/month</p>
          <form id="booking-form" novalidate>
            <input type="hidden" name="flat_id" value="${flat.id}" />
            <div class="form-group">
              <label class="form-label" for="check-in">Check-in Date</label>
              <input class="form-input" id="check-in" name="check_in" type="date" min="${today}" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="check-out">Check-out Date</label>
              <input class="form-input" id="check-out" name="check_out" type="date" min="${today}" required />
            </div>
            <div id="rent-preview" class="rent-preview hidden">
              <p>Estimated Rent: <strong id="rent-preview-value"></strong></p>
            </div>
            <button class="btn btn--primary btn--full" type="submit">Confirm Booking</button>
          </form>
        </div>
      </div>`;
  },

  bindEvents(root) {
    // Flat search filter form
    const filterForm = root.querySelector("#flat-search-filter-form");
    if (filterForm) {
      filterForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(filterForm);
        const params = new URLSearchParams();
        for (const [k, v] of fd.entries()) if (v) params.set(k, v);
        const r = await apiFetch(`/api/flats?${params}`);
        if (r.success) {
          appState.flats = r.data;
          render(Tenant.viewSearch(r.data));
        } else showToast(r.message, "error");
      });

      root
        .querySelector("#filter-reset-btn")
        ?.addEventListener("click", async () => {
          filterForm.reset();
          const r = await apiFetch("/api/flats");
          if (r.success) {
            appState.flats = r.data;
            render(Tenant.viewSearch(r.data));
          }
        });
    }

    // Booking form — rent preview + submit
    const bookingForm = root.querySelector("#booking-form");
    if (bookingForm) {
      const calcRent = () => {
        const ci = bookingForm.querySelector('[name="check_in"]')?.value;
        const co = bookingForm.querySelector('[name="check_out"]')?.value;
        const pre = root.querySelector("#rent-preview");
        const val = root.querySelector("#rent-preview-value");
        if (ci && co && appState._selectedFlat) {
          const days = Math.ceil((new Date(co) - new Date(ci)) / 86400000);
          if (days > 0) {
            const est = (
              (parseFloat(appState._selectedFlat.rent) / 30) *
              days
            ).toFixed(2);
            if (val)
              val.textContent = `₹${Number(est).toLocaleString("en-IN")} (${days} days)`;
            if (pre) pre.classList.remove("hidden");
            return;
          }
        }
        if (pre) pre.classList.add("hidden");
      };
      bookingForm
        .querySelector('[name="check_in"]')
        ?.addEventListener("change", calcRent);
      bookingForm
        .querySelector('[name="check_out"]')
        ?.addEventListener("change", calcRent);

      bookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(bookingForm);
        const payload = {
          flat_id: fd.get("flat_id"),
          check_in: fd.get("check_in"),
          check_out: fd.get("check_out"),
        };
        if (!payload.check_in || !payload.check_out) {
          showToast(
            "Please select both check-in and check-out dates.",
            "error",
          );
          return;
        }
        const btn = bookingForm.querySelector('[type="submit"]');
        btn.disabled = true;
        btn.textContent = "Submitting…";
        const r = await apiFetch("/api/bookings", {
          method: "POST",
          body: payload,
        });
        btn.disabled = false;
        btn.textContent = "Confirm Booking";
        if (r.success) {
          showToast("Booking submitted successfully!", "success");
          window.location.hash = "#/tenant/dashboard";
        } else {
          showToast(r.message || "Booking failed.", "error");
        }
      });
    }

    // Cancel booking action
    root.addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-action="cancel-booking"]');
      if (!btn) return;
      const bId = btn.dataset.bookingId;
      if (!bId || !confirm("Cancel this booking?")) return;
      btn.disabled = true;
      const r = await apiFetch(`/api/bookings/${bId}`, {
        method: "PATCH",
        body: { status: "cancelled" },
      });
      btn.disabled = false;
      if (r.success) {
        showToast("Booking cancelled.", "info");
        const br = await apiFetch("/api/bookings");
        if (br.success) appState.bookings = br.data;
        render(Tenant.viewDashboard());
      } else showToast(r.message, "error");
    });
  },
};

// ─────────────────────────────────────────────────
// MODULE: OWNER  (owner_index.html)
// ─────────────────────────────────────────────────
const Owner = {
  viewDashboard() {
    const rows = appState.listings.length
      ? appState.listings
          .map(
            (l) => `
        <tr>
          <td>
            <strong>${escHtml(l.flat_title)}</strong>
            <br><small class="text-muted">📍 ${escHtml(l.city)} · ${escHtml(l.type)}</small>
          </td>
          <td>₹${Number(l.rent).toLocaleString("en-IN")}</td>
          <td>
            <span class="badge badge--${l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}">
              ${l.status}
            </span>
          </td>
          <td>${l.submitted_at?.slice(0, 10) || "—"}</td>
          <td>${l.reviewer_name ? escHtml(l.reviewer_name) : "—"}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="empty-cell">
          No listings yet. <a href="#/owner/add-flat" data-route="/owner/add-flat">Add your first flat →</a>
         </td></tr>`;

    return `
      <div class="container page-content">
        <div class="page-header">
          <h2>Owner Dashboard</h2>
          <a class="btn btn--primary" href="#/owner/add-flat" data-route="/owner/add-flat">+ Add Flat</a>
        </div>
        <div class="card">
          <h3 class="card-title">My Listings</h3>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Flat</th><th>Rent</th><th>Status</th><th>Submitted</th><th>Reviewed By</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  viewAddFlat() {
    return `
      <div class="container page-content">
        <a class="back-link" href="#/owner/dashboard" data-route="/owner/dashboard">← Dashboard</a>
        <div class="card form-card" style="max-width:680px">
          <h2>List a New Flat</h2>
          <p class="form-card__sub">Fill in the details. An admin will review and approve your listing.</p>
          <form id="add-flat-form" novalidate>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Title *</label>
                <input class="form-input" name="title" type="text" placeholder="2BHK in Koregaon Park" required />
              </div>
              <div class="form-group">
                <label class="form-label">City *</label>
                <input class="form-input" name="city" type="text" placeholder="Pune" required />
              </div>
              <div class="form-group">
                <label class="form-label">Address</label>
                <input class="form-input" name="address" type="text" placeholder="Street, Area, Landmark" />
              </div>
              <div class="form-group">
                <label class="form-label">Monthly Rent (₹) *</label>
                <input class="form-input" name="rent" type="number" min="1" step="100" placeholder="20000" required />
              </div>
              <div class="form-group">
                <label class="form-label">Type *</label>
                <select class="form-select" name="type" required>
                  <option value="">Select type…</option>
                  <option>1BHK</option><option>2BHK</option><option>3BHK</option>
                  <option>Studio</option><option>4BHK+</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Furnished</label>
                <select class="form-select" name="furnished">
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-textarea" name="description" rows="3"
                placeholder="Describe the flat — location highlights, nearby facilities, house rules…"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Amenities <span class="text-muted">(comma-separated)</span></label>
              <input class="form-input" name="amenities" type="text"
                placeholder="WiFi, AC, Parking, Geyser, Lift, Gym…" />
            </div>
            <button class="btn btn--primary" type="submit" id="add-flat-submit">Submit for Review</button>
          </form>
        </div>
      </div>`;
  },

  bindEvents(root) {
    const addFlatForm = root.querySelector("#add-flat-form");
    if (!addFlatForm) return;

    addFlatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(addFlatForm);
      const amenities = (fd.get("amenities") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title: fd.get("title")?.trim(),
        city: fd.get("city")?.trim(),
        address: fd.get("address")?.trim() || "",
        rent: fd.get("rent"),
        type: fd.get("type"),
        furnished: fd.get("furnished"),
        description: fd.get("description")?.trim() || "",
        amenities,
      };
      if (!payload.title || !payload.city || !payload.rent || !payload.type) {
        showToast("Please fill in all required fields.", "error");
        return;
      }
      const btn = root.querySelector("#add-flat-submit");
      btn.disabled = true;
      btn.textContent = "Submitting…";
      const r = await apiFetch("/api/flats", { method: "POST", body: payload });
      btn.disabled = false;
      btn.textContent = "Submit for Review";
      if (r.success) {
        showToast("Flat submitted for review!", "success");
        window.location.hash = "#/owner/dashboard";
      } else {
        showToast(r.message || "Submission failed.", "error");
      }
    });
  },
};

// ─────────────────────────────────────────────────
// MODULE: ADMIN  (admin_index.html)
// ─────────────────────────────────────────────────
const Admin = {
  viewDashboard() {
    const { users, flats, bookings, listings } = appState;
    const pending = listings.filter((l) => l.status === "pending").length;
    const stats = [
      { label: "Total Users", value: users.length, icon: "👥" },
      { label: "Total Flats", value: flats.length, icon: "🏠" },
      { label: "Bookings", value: bookings.length, icon: "📋" },
      { label: "Pending Reviews", value: pending, icon: "⏳" },
    ];
    return `
      <div class="container page-content">
        <div class="page-header"><h2>Admin Dashboard</h2></div>
        <div class="stat-grid">
          ${stats
            .map(
              (s) => `
          <div class="stat-card card">
            <p style="font-size:1.5rem;margin-bottom:var(--space-xs)">${s.icon}</p>
            <p class="stat-card__label">${s.label}</p>
            <p class="stat-card__value">${s.value}</p>
          </div>`,
            )
            .join("")}
        </div>
        <div class="flex-between mt-lg">
          <a class="btn btn--primary" href="#/admin/approvals" data-route="/admin/approvals">
            ✅ Review Listings ${pending > 0 ? `<span class="badge badge--danger" style="margin-left:4px">${pending}</span>` : ""}
          </a>
          <a class="btn btn--secondary" href="#/admin/users" data-route="/admin/users">👥 Manage Users</a>
        </div>
      </div>`;
  },

  viewApprovals(listings = appState.listings) {
    const rows = listings.length
      ? listings
          .map(
            (l) => `
        <tr>
          <td>
            <strong>${escHtml(l.flat_title)}</strong>
            <br><small class="text-muted">📍 ${escHtml(l.city)} · ${escHtml(l.type)} · ₹${Number(l.rent).toLocaleString("en-IN")}</small>
          </td>
          <td>${escHtml(l.owner_name)}</td>
          <td>${l.submitted_at?.slice(0, 10) || "—"}</td>
          <td>
            <span class="badge badge--${l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "warning"}">
              ${l.status}
            </span>
          </td>
          <td>
            ${
              l.status === "pending"
                ? `<button class="btn btn--primary btn--sm" data-action="approve" data-id="${l.id}">✅ Approve</button>
                 <button class="btn btn--danger  btn--sm" data-action="reject"  data-id="${l.id}">❌ Reject</button>`
                : l.reviewer_name
                  ? `<small class="text-muted">by ${escHtml(l.reviewer_name)}</small>`
                  : "—"
            }
          </td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="empty-cell">No listings found.</td></tr>`;

    return `
      <div class="container page-content">
        <div class="page-header">
          <h2>Listing Approvals</h2>
          <select class="form-select" id="approval-status-filter" style="width:auto;min-width:150px">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Flat</th><th>Owner</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  viewUsers(users = appState.users) {
    const rows = users.length
      ? users
          .map(
            (u) => `
        <tr>
          <td>
            <strong>${escHtml(u.name)}</strong>
            <br><small class="text-muted">${escHtml(u.email)}</small>
          </td>
          <td><span class="badge badge--neutral">${u.role}</span></td>
          <td><span class="badge badge--${u.status === "active" ? "success" : "danger"}">${u.status}</span></td>
          <td>${u.created_at?.slice(0, 10) || "—"}</td>
          <td>
            ${
              u.id !== appState.currentUser.id
                ? `<button class="btn btn--sm btn--secondary" data-action="${u.status === "active" ? "suspend" : "activate"}" data-user-id="${u.id}">
                   ${u.status === "active" ? "🚫 Suspend" : "✅ Activate"}
                 </button>
                 <button class="btn btn--sm btn--danger" data-action="delete" data-user-id="${u.id}">🗑 Delete</button>`
                : '<span class="text-muted">(you)</span>'
            }
          </td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="empty-cell">No users found.</td></tr>`;

    return `
      <div class="container page-content">
        <div class="page-header"><h2>User Management</h2></div>
        <div class="card">
          <div class="filter-bar filter-bar--inline">
            <input class="form-input" id="user-search-input" placeholder="Search by name or email…" />
            <select class="form-select" id="user-role-filter">
              <option value="">All Roles</option>
              <option value="tenant">Tenant</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
            </select>
            <select class="form-select" id="user-status-filter">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody id="users-tbody">${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  bindEvents(root) {
    // Approve / reject listings
    root.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const userId = btn.dataset.userId;

      if ((action === "approve" || action === "reject") && id) {
        btn.disabled = true;
        const status = action === "approve" ? "approved" : "rejected";
        const r = await apiFetch(`/api/listings/${id}`, {
          method: "PATCH",
          body: { status },
        });
        btn.disabled = false;
        if (r.success) {
          showToast(r.message, action === "approve" ? "success" : "warning");
          const lr = await apiFetch("/api/listings");
          if (lr.success) appState.listings = lr.data;
          render(Admin.viewApprovals());
        } else showToast(r.message, "error");
      }

      if ((action === "suspend" || action === "activate") && userId) {
        btn.disabled = true;
        const status = action === "suspend" ? "suspended" : "active";
        const r = await apiFetch(`/api/users/${userId}`, {
          method: "PATCH",
          body: { status },
        });
        btn.disabled = false;
        if (r.success) {
          showToast(r.message, action === "suspend" ? "warning" : "success");
          const ur = await apiFetch("/api/users");
          if (ur.success) appState.users = ur.data;
          render(Admin.viewUsers());
        } else showToast(r.message, "error");
      }

      if (action === "delete" && userId) {
        if (!confirm("Permanently delete this user and all their data?"))
          return;
        btn.disabled = true;
        const r = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
        btn.disabled = false;
        if (r.success) {
          showToast("User deleted.", "info");
          const ur = await apiFetch("/api/users");
          if (ur.success) appState.users = ur.data;
          render(Admin.viewUsers());
        } else showToast(r.message, "error");
      }
    });

    // User search / filter (live, partial re-render)
    const userSearch = root.querySelector("#user-search-input");
    if (userSearch) {
      const doFilter = () => {
        const q = (
          root.querySelector("#user-search-input")?.value || ""
        ).toLowerCase();
        const role = root.querySelector("#user-role-filter")?.value || "";
        const status = root.querySelector("#user-status-filter")?.value || "";
        let filtered = [...appState.users];
        if (q)
          filtered = filtered.filter(
            (u) =>
              u.name.toLowerCase().includes(q) ||
              u.email.toLowerCase().includes(q),
          );
        if (role) filtered = filtered.filter((u) => u.role === role);
        if (status) filtered = filtered.filter((u) => u.status === status);
        const tbody = root.querySelector("#users-tbody");
        const tmp = document.createElement("div");
        tmp.innerHTML = Admin.viewUsers(filtered);
        const newTbody = tmp.querySelector("#users-tbody");
        if (tbody && newTbody) tbody.innerHTML = newTbody.innerHTML;
      };
      root
        .querySelector("#user-search-input")
        ?.addEventListener("input", doFilter);
      root
        .querySelector("#user-role-filter")
        ?.addEventListener("change", doFilter);
      root
        .querySelector("#user-status-filter")
        ?.addEventListener("change", doFilter);
    }

    // Approval status filter (partial re-render)
    root
      .querySelector("#approval-status-filter")
      ?.addEventListener("change", (e) => {
        const val = e.target.value;
        const filtered = val
          ? appState.listings.filter((l) => l.status === val)
          : appState.listings;
        const tbody = root.querySelector("tbody");
        const tmp = document.createElement("div");
        tmp.innerHTML = Admin.viewApprovals(filtered);
        const newTbody = tmp.querySelector("tbody");
        if (tbody && newTbody) tbody.innerHTML = newTbody.innerHTML;
      });
  },
};

// ─────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────
const ROLE_ROUTES = {
  "/login": null,
  "/signup": null,
  "/tenant/dashboard": ["tenant"],
  "/tenant/search": ["tenant"],
  "/tenant/flat": ["tenant"],
  "/tenant/booking": ["tenant"],
  "/tenant/bookings": ["tenant"],
  "/owner/dashboard": ["owner"],
  "/owner/listings": ["owner"],
  "/owner/add-flat": ["owner"],
  "/admin/dashboard": ["admin"],
  "/admin/approvals": ["admin"],
  "/admin/users": ["admin"],
};

function guardRoute(path) {
  const base = "/" + path.split("/").filter(Boolean).slice(0, 2).join("/");
  const roles = ROLE_ROUTES[base];
  if (roles === null) return true; // public route
  if (!appState.currentUser) return false; // unauthenticated
  return roles?.includes(appState.currentUser.role) ?? false;
}

function defaultRoute() {
  const r = appState.currentUser?.role;
  if (r === "admin") return "#/admin/dashboard";
  if (r === "owner") return "#/owner/dashboard";
  return "#/tenant/dashboard";
}

async function loadRouteData(base, param) {
  const u = appState.currentUser;
  if (!u) return;

  if (base === "/tenant/dashboard" || base === "/tenant/bookings") {
    const r = await apiFetch("/api/bookings");
    if (r.success) appState.bookings = r.data;
  }
  if (base === "/tenant/search") {
    const r = await apiFetch("/api/flats");
    if (r.success) appState.flats = r.data;
  }
  if (base === "/tenant/flat" && param) {
    const r = await apiFetch(`/api/flats/${param}`);
    appState._selectedFlat = r.success ? r.data : null;
  }
  if (base === "/tenant/booking" && param) {
    if (!appState._selectedFlat || appState._selectedFlat.id !== param) {
      const r = await apiFetch(`/api/flats/${param}`);
      appState._selectedFlat = r.success ? r.data : null;
    }
  }
  if (base === "/owner/dashboard" || base === "/owner/listings") {
    const r = await apiFetch("/api/listings");
    if (r.success) appState.listings = r.data;
  }
  if (base === "/admin/dashboard") {
    const [ur, fr, br, lr] = await Promise.all([
      apiFetch("/api/users"),
      apiFetch("/api/flats"),
      apiFetch("/api/bookings"),
      apiFetch("/api/listings"),
    ]);
    if (ur.success) appState.users = ur.data;
    if (fr.success) appState.flats = fr.data;
    if (br.success) appState.bookings = br.data;
    if (lr.success) appState.listings = lr.data;
  }
  if (base === "/admin/approvals") {
    const r = await apiFetch("/api/listings");
    if (r.success) appState.listings = r.data;
  }
  if (base === "/admin/users") {
    const r = await apiFetch("/api/users");
    if (r.success) appState.users = r.data;
  }
}

function resolveView(base, param) {
  const map = {
    "/login": () => Auth.viewLogin("login"),
    "/signup": () => Auth.viewLogin("signup"),
    "/tenant/dashboard": () => Tenant.viewDashboard(),
    "/tenant/search": () => Tenant.viewSearch(),
    "/tenant/flat": () => Tenant.viewFlatDetails(appState._selectedFlat),
    "/tenant/booking": () => Tenant.viewBooking(appState._selectedFlat),
    "/tenant/bookings": () => Tenant.viewDashboard(),
    "/owner/dashboard": () => Owner.viewDashboard(),
    "/owner/listings": () => Owner.viewDashboard(),
    "/owner/add-flat": () => Owner.viewAddFlat(),
    "/admin/dashboard": () => Admin.viewDashboard(),
    "/admin/approvals": () => Admin.viewApprovals(),
    "/admin/users": () => Admin.viewUsers(),
  };
  return (map[base] ?? map["/login"])();
}

async function navigate(hash) {
  const raw = hash.replace(/^#/, "") || "/login";
  const path = raw.startsWith("/") ? raw : "/" + raw;
  const segments = path.split("/").filter(Boolean);
  const base = "/" + segments.slice(0, 2).join("/");
  const param = segments[2] || null;

  if (!guardRoute(path)) {
    window.location.hash = appState.currentUser ? defaultRoute() : "#/login";
    return;
  }

  document.getElementById("app-root").innerHTML =
    `<div class="container page-content" style="text-align:center;padding:4rem"><p class="text-muted">Loading…</p></div>`;

  try {
    await loadRouteData(base, param);
    render(resolveView(base, param));
  } catch (err) {
    console.error("[Router]", err);
    render(`<div class="container page-content">
      <div class="empty-state">
        <p style="font-size:2rem">⚠️</p>
        <p>Something went wrong.</p>
        <p class="text-muted">${escHtml(err.message)}</p>
        <a class="btn btn--secondary" href="#/login" data-route="/login">Go to Login</a>
      </div>
    </div>`);
  }
}

// ─────────────────────────────────────────────────
// EVENT DELEGATION — dispatches to per-module binders
// ─────────────────────────────────────────────────
function bindEvents() {
  const root = document.getElementById("app-root");
  if (!root) return;

  // SPA navigation via [data-route]
  root.addEventListener("click", (e) => {
    const link = e.target.closest("[data-route]");
    if (!link) return;
    const route = link.dataset.route;
    if (route) {
      e.preventDefault();
      window.location.hash = "#" + route;
    }
  });

  // Delegate to the relevant module based on rendered content
  Auth.bindEvents(root);
  Tenant.bindEvents(root);
  Owner.bindEvents(root);
  Admin.bindEvents(root);

  // Logout (lives in nav, not root — handled here after nav render)
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await apiFetch("/api/logout", { method: "POST" });
    Token.clear();
    Object.assign(appState, {
      currentUser: null,
      flats: [],
      bookings: [],
      users: [],
      listings: [],
      _selectedFlat: null,
    });
    renderNavBar();
    window.location.hash = "#/login";
    showToast("Logged out successfully.", "info");
  });
}

// ─────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────
window.addEventListener("hashchange", () => navigate(window.location.hash));

window.addEventListener("load", async () => {
  // Verify server is reachable
  try {
    await fetch(`${API}/api/ping`, { signal: AbortSignal.timeout(3000) });
  } catch (_) {
    document.getElementById("app-nav").innerHTML = "";
    document.getElementById("app-root").innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card" style="text-align:center">
          <div style="font-size:3rem;margin-bottom:.75rem">⚠️</div>
          <h2 style="color:#dc2626;margin-bottom:.5rem">Server Not Running</h2>
          <p style="color:#64748b;margin-bottom:1.25rem">
            FlatFinder needs its backend server to connect to MySQL.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:.75rem;padding:1.25rem;text-align:left;font-size:.875rem;line-height:2">
            <strong>▶ How to start (Windows):</strong><br>
            &nbsp;&nbsp;Double-click <code style="background:#e2e8f0;padding:.15rem .4rem;border-radius:.3rem">start.bat</code> in your project folder<br><br>
            <strong>▶ Or in terminal:</strong><br>
            &nbsp;&nbsp;<code style="background:#e2e8f0;padding:.15rem .4rem;border-radius:.3rem">node server.js</code><br><br>
            <strong>▶ Then refresh this page.</strong>
          </div>
          <button class="btn btn--primary" style="margin-top:1.5rem;width:100%" onclick="location.reload()">
            🔄 Retry Connection
          </button>
        </div>
      </div>`;
    return;
  }

  // Restore session
  const r = await apiFetch("/api/me");
  if (r.success && r.data) {
    appState.currentUser = r.data;
    renderNavBar();
    await navigate(window.location.hash || defaultRoute());
  } else {
    const h = window.location.hash || "#/login";
    await navigate(
      h.startsWith("#/login") || h.startsWith("#/signup") ? h : "#/login",
    );
  }
});
