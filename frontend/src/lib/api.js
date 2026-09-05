export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
export const TOKEN_KEY = 'researchos-session-token'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Central fetch wrapper: attaches the session token, throws a typed
 * ApiError with a message safe to show the user, and never swallows a
 * network failure silently. */
export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0)
  }

  if (!res.ok) {
    let detail = `Request failed with status ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // non-JSON error body, keep the generic message
    }
    throw new ApiError(detail, res.status)
  }

  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
}

function toQuery(params) {
  const usable = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (usable.length === 0) return ''
  return `?${new URLSearchParams(usable).toString()}`
}

// --- typed endpoints -------------------------------------------------------

export const authApi = {
  me: () => api.get('/me'),
  google: (credential) => api.post('/auth/google', { credential }),
  signup: (email, password, name) => api.post('/auth/signup', { email, password, name }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email, reset_url_base: `${window.location.origin}/reset-password` }),
  resetPassword: (token, new_password) => api.post('/auth/reset-password', { token, new_password }),
  updateProfile: (name) => api.patch('/me', { name }),
  changePassword: (current_password, new_password) => api.post('/me/password', { current_password, new_password }),
  sessions: () => api.get('/me/sessions'),
  revokeSession: (token) => api.delete(`/me/sessions/${token}`),
}

export const projectsApi = {
  list: () => api.get('/projects'),
  create: (name, description) => api.post('/projects', { name, description }),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, patch) => api.patch(`/projects/${id}`, patch),
  remove: (id) => api.delete(`/projects/${id}`),
  runs: (id) => api.get(`/projects/${id}/runs`),
}

export const researchApi = {
  list: (filters) => api.get(`/research${toQuery(filters)}`),
  get: (id) => api.get(`/research/${id}`),
  update: (id, patch) => api.patch(`/research/${id}`, patch),
  remove: (id) => api.delete(`/research/${id}`),
  regenerateReport: (id) => api.post(`/research/${id}/regenerate-report`),
  restart: (id) => api.post(`/research/${id}/restart`),
}

export const sourcesApi = {
  list: (filters) => api.get(`/sources${toQuery(filters)}`),
  update: (id, patch) => api.patch(`/sources/${id}`, patch),
}

export const dashboardApi = {
  get: () => api.get('/dashboard'),
}

export const agentsApi = {
  list: () => api.get('/agents'),
}

/** Streams POST /research/run's newline-delimited JSON events, calling
 * onEvent for each one as it arrives. Not a JSON call — the response body
 * is a live stream, so this reads it directly rather than going through
 * apiFetch. Throws ApiError on a non-2xx response before any streaming
 * starts (bad request / server misconfigured), same shape as every other
 * call in this module. */
export async function streamResearch(payload, { onEvent, signal }) {
  await _stream(`${API_URL}/research/run`, { method: 'POST', body: JSON.stringify(payload) }, { onEvent, signal })
}

/** Same NDJSON streaming shape as streamResearch, but for the
 * "Restart research" control (POST /research/{id}/restart), which reruns
 * the pipeline server-side under a new run id and streams it the same way.
 * Returns the new run's id (from the X-Run-Id response header) so the
 * caller can navigate there. */
export async function streamRestart(runId, { onEvent, onRunId, signal }) {
  await _stream(`${API_URL}/research/${runId}/restart`, { method: 'POST' }, { onEvent, signal, onHeaders: (h) => onRunId?.(h.get('X-Run-Id')) })
}

async function _stream(url, init, { onEvent, signal, onHeaders }) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(url, {
      ...init,
      headers,
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Network error — check your connection and try again.', 0)
  }

  if (!res.ok) {
    let detail = `Server responded with ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      // keep the generic message
    }
    throw new ApiError(detail, res.status)
  }

  onHeaders?.(res.headers)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineAt
    while ((newlineAt = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineAt)
      buffer = buffer.slice(newlineAt + 1)
      if (!line.trim()) continue
      try {
        onEvent(JSON.parse(line))
      } catch {
        // ignore a malformed line rather than aborting the whole stream
      }
    }
  }
  return { headers: res.headers }
}
