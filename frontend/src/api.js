/**
 * api.js — Centralized fetch wrapper for the GymPulse backend.
 *
 * AUTH:
 *   The JWT token is stored in localStorage under the key 'gympulse_auth'.
 *   Every request automatically attaches it as a Bearer token when present.
 *   Login functions store the token; logout clears it.
 *
 * ERROR HANDLING:
 *   All functions throw an Error with the backend's detail message on failure.
 *   401 responses additionally clear the stale token from localStorage so the
 *   UI can detect the expired session and show the login form.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/** Read the stored auth token and build an Authorization header if present. */
function getAuthHeader() {
  const raw = localStorage.getItem("gympulse_auth");
  if (!raw) return {};
  try {
    const { token } = JSON.parse(raw);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Generic fetch helper.
 * Attaches auth header, parses JSON, surfaces meaningful error messages.
 */
async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...options.headers,
    },
    ...options,
  });

  // 204 No Content — nothing to parse
  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // On 401, remove the stale token so the UI shows the login screen
    if (res.status === 401) {
      localStorage.removeItem("gympulse_auth");
    }
    // On 429, surface the rate-limit message directly
    if (res.status === 429) {
      throw new Error(body?.detail || "Too many attempts. Please wait and try again.");
    }
    // Pydantic 422 errors return detail as an array of {msg, loc, ...} objects
    let message;
    if (Array.isArray(body?.detail)) {
      message = body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
    } else {
      message = body?.detail || body?.message || `Request failed with status ${res.status}`;
    }
    throw new Error(message);
  }

  return body;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════════════════════

export async function loginAdmin(username, password) {
  const result = await request("/auth/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  // Persist token so getAuthHeader() picks it up for subsequent requests
  localStorage.setItem(
    "gympulse_auth",
    JSON.stringify({ token: result.access_token, role: result.role, name: result.name })
  );
  return result;
}

export async function loginMember(email, password) {
  const result = await request("/auth/member/login", {
    method: "POST",
    body: JSON.stringify({ username: email, password }),
  });
  localStorage.setItem(
    "gympulse_auth",
    JSON.stringify({ token: result.access_token, role: result.role, name: result.name, member_id: result.member_id })
  );
  return result;
}

export function logout() {
  localStorage.removeItem("gympulse_auth");
}

/** Return the currently stored auth object or null. */
export function getStoredAuth() {
  const raw = localStorage.getItem("gympulse_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Equipment
// ═══════════════════════════════════════════════════════════════════════════

export function getEquipment(status) {
  const params = status ? `?status=${status}` : "";
  return request(`/equipment${params}`);
}

export function getEquipmentById(id) {
  return request(`/equipment/${id}`);
}

export function createEquipment(data) {
  return request("/equipment", { method: "POST", body: JSON.stringify(data) });
}

export function updateEquipment(id, data) {
  return request(`/equipment/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteEquipment(id) {
  return request(`/equipment/${id}`, { method: "DELETE" });
}

// ═══════════════════════════════════════════════════════════════════════════
// Usage Logs
// ═══════════════════════════════════════════════════════════════════════════

export function getUsageLogs(equipmentId) {
  const params = equipmentId ? `?equipment_id=${equipmentId}` : "";
  return request(`/usage-logs${params}`);
}

export function createUsageLog(data) {
  return request("/usage-logs", { method: "POST", body: JSON.stringify(data) });
}

// ═══════════════════════════════════════════════════════════════════════════
// Reservations
// ═══════════════════════════════════════════════════════════════════════════

export function getReservations(status) {
  const params = status ? `?status=${status}` : "";
  return request(`/reservations${params}`);
}

export function createReservation(data) {
  return request("/reservations", { method: "POST", body: JSON.stringify(data) });
}

export function updateReservation(id, data) {
  return request(`/reservations/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

/** Convenience: cancel a reservation by setting status to 'cancelled'. */
export function cancelReservation(id) {
  return updateReservation(id, { status: "cancelled" });
}

// ═══════════════════════════════════════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════════════════════════════════════

export function getAnalyticsSummary() {
  return request("/analytics/summary");
}

export function getMostUsed(limit = 10) {
  return request(`/analytics/most-used?limit=${limit}`);
}

export function getPeakHours(date) {
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  return request(`/analytics/peak-hours${params}`);
}

