const url = String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
const SESSION_KEY = 'so-tay-doan-vien-session';

export const isSupabaseConfigured = Boolean(url && anonKey);
export const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } };
export const saveSession = (session) => session ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY);

function headers(extra = {}) {
  const token = getSession()?.access_token || anonKey;
  return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}

async function request(path, options = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa được cấu hình.');
  const response = await fetch(`${url}${path}`, { ...options, headers: headers(options.headers) });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error_description || body?.error || `HTTP ${response.status}`);
  return body;
}

export async function signInWithPassword(email, password) {
  const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  saveSession(session);
  return session;
}
export async function signOut() { try { await request('/auth/v1/logout', { method: 'POST' }); } finally { saveSession(null); } }
export async function select(table, query = '') { return request(`/rest/v1/${table}${query ? `?${query}` : ''}`, { headers: { Prefer: 'count=exact' } }); }
export async function insert(table, payload) { return request(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }); }
export async function invokeFunction(name, payload = {}) { return request(`/functions/v1/${name}`, { method: 'POST', body: JSON.stringify(payload) }); }
