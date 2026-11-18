const API_BASE = '/api';
export const TOKEN_STORAGE_KEY = 'mediqueue.token';
export const UNAUTHORIZED_EVENT = 'mediqueue:unauthorized';
export const NOTIFICATIONS_CHANGED_EVENT = 'mediqueue:notifications-changed';

export class ApiError extends Error {
  constructor(message, status = 0, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function getStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage can be unavailable in private mode; the in-memory session still works.
  }
}

export function clearStoredToken() {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Small fetch wrapper for the MediQueue API.
 * - Prefixes `/api` (Vite proxies it to the Express server).
 * - Adds the Bearer token only when `auth: true`.
 * - Emits a global unauthorized event on expired/invalid sessions.
 */
export async function apiRequest(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = auth ? getStoredToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach the server. Is the backend running?', 0);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    throw new ApiError(
      payload?.error?.message || `Request failed with status ${response.status}.`,
      response.status,
      payload?.error?.details,
    );
  }

  return payload;
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export const authApi = {
  login(email, password) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  },

  register(payload) {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: payload,
    });
  },

  me() {
    return apiRequest('/auth/me', { auth: true });
  },
};

export const catalogApi = {
  hospitals(params = {}, { signal } = {}) {
    return apiRequest(`/hospitals${buildQuery(params)}`, { signal });
  },

  hospital(id, { signal } = {}) {
    return apiRequest(`/hospitals/${encodeURIComponent(id)}`, { signal });
  },

  doctors(params = {}, { signal } = {}) {
    return apiRequest(`/doctors${buildQuery(params)}`, { signal });
  },

  doctor(id, { signal } = {}) {
    return apiRequest(`/doctors/${encodeURIComponent(id)}`, { signal });
  },

  specializations({ signal } = {}) {
    return apiRequest('/doctors/specializations', { signal });
  },

  slots(doctorId, date, { signal } = {}) {
    return apiRequest(
      `/doctors/${encodeURIComponent(doctorId)}/slots${buildQuery({ date })}`,
      { signal },
    );
  },
};

export const appointmentApi = {
  book(payload) {
    return apiRequest('/appointments', {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  mine({ signal } = {}) {
    return apiRequest('/appointments/mine', { auth: true, signal });
  },

  cancel(id) {
    return apiRequest(`/appointments/${encodeURIComponent(id)}/cancel`, {
      method: 'PATCH',
      auth: true,
    });
  },

  checkIn(id) {
    return apiRequest(`/appointments/${encodeURIComponent(id)}/check-in`, {
      method: 'POST',
      auth: true,
    });
  },
};

export const queueApi = {
  mine({ signal } = {}) {
    return apiRequest('/queues/me', { auth: true, signal });
  },
};

export const doctorApi = {
  queue({ signal } = {}) {
    return apiRequest('/doctor/queue', { auth: true, signal });
  },

  appointments({ date, signal } = {}) {
    return apiRequest(`/doctor/appointments${buildQuery({ date })}`, { auth: true, signal });
  },

  searchPatients(query, { signal } = {}) {
    return apiRequest(`/doctor/patients${buildQuery({ query })}`, { auth: true, signal });
  },

  callNext() {
    return apiRequest('/doctor/queue/call-next', { method: 'POST', auth: true });
  },

  start() {
    return apiRequest('/doctor/queue/start', { method: 'POST', auth: true });
  },

  complete() {
    return apiRequest('/doctor/queue/complete', { method: 'POST', auth: true });
  },

  noShow(entryId) {
    return apiRequest(`/doctor/queue/${encodeURIComponent(entryId)}/no-show`, {
      method: 'POST',
      auth: true,
    });
  },

  addEmergency(payload) {
    return apiRequest('/doctor/queue/emergency', {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  reportDelay(payload) {
    return apiRequest('/doctor/delay', { method: 'POST', auth: true, body: payload });
  },

  clearDelay() {
    return apiRequest('/doctor/delay/clear', { method: 'POST', auth: true });
  },
};

export const notificationApi = {
  list({ signal } = {}) {
    return apiRequest('/notifications', { auth: true, signal });
  },

  markRead(id) {
    return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      auth: true,
    });
  },

  markAllRead() {
    return apiRequest('/notifications/read-all', {
      method: 'POST',
      auth: true,
    });
  },
};

export const hospitalAdminApi = {
  profile() {
    return apiRequest('/hospital/me', { auth: true });
  },

  updateProfile(payload) {
    return apiRequest('/hospital/me', { method: 'PATCH', auth: true, body: payload });
  },

  doctors() {
    return apiRequest('/hospital/doctors', { auth: true });
  },

  createDoctor(payload) {
    return apiRequest('/hospital/doctors', {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  updateDoctor(id, payload) {
    return apiRequest(`/hospital/doctors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: payload,
    });
  },

  deactivateDoctor(id) {
    return apiRequest(`/hospital/doctors/${encodeURIComponent(id)}/deactivate`, {
      method: 'POST',
      auth: true,
    });
  },

  schedules(doctorId) {
    return apiRequest(`/hospital/doctors/${encodeURIComponent(doctorId)}/schedules`, {
      auth: true,
    });
  },

  createSchedule(doctorId, payload) {
    return apiRequest(`/hospital/doctors/${encodeURIComponent(doctorId)}/schedules`, {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  updateSchedule(doctorId, scheduleId, payload) {
    return apiRequest(
      `/hospital/doctors/${encodeURIComponent(doctorId)}/schedules/${encodeURIComponent(scheduleId)}`,
      { method: 'PATCH', auth: true, body: payload },
    );
  },

  deleteSchedule(doctorId, scheduleId) {
    return apiRequest(
      `/hospital/doctors/${encodeURIComponent(doctorId)}/schedules/${encodeURIComponent(scheduleId)}`,
      { method: 'DELETE', auth: true },
    );
  },

  dashboard({ signal } = {}) {
    return apiRequest('/hospital/dashboard', { auth: true, signal });
  },

  appointments(params = {}, { signal } = {}) {
    return apiRequest(`/hospital/appointments${buildQuery(params)}`, {
      auth: true,
      signal,
    });
  },

  queues({ signal } = {}) {
    return apiRequest('/hospital/queues', { auth: true, signal });
  },
};

export const platformApi = {
  dashboard({ signal } = {}) {
    return apiRequest('/platform/dashboard', { auth: true, signal });
  },

  hospitals(params = {}, { signal } = {}) {
    return apiRequest(`/platform/hospitals${buildQuery(params)}`, { auth: true, signal });
  },

  createHospital(payload) {
    return apiRequest('/platform/hospitals', {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  hospitalAdmins({ signal } = {}) {
    return apiRequest('/platform/hospital-admins', { auth: true, signal });
  },

  createHospitalAdmin(payload) {
    return apiRequest('/platform/hospital-admins', {
      method: 'POST',
      auth: true,
      body: payload,
    });
  },

  updateHospitalAdmin(id, payload) {
    return apiRequest(`/platform/hospital-admins/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: payload,
    });
  },
};
