import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const actor = JSON.parse(await readFile(process.env.NQ_BROWSER_ACTOR_FILE, 'utf8'));
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).trim().split('\n').map((line) => {
  const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)];
}));
assert.equal(new URL(env.VITE_SUPABASE_URL).host, 'znexculhbdjiflkczpyu.supabase.co');
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const anon = await client.rpc('nq_attempt', { p_action: 'start' });
assert.ok(anon.error, 'Anonymous request rejected');
const { error } = await client.auth.signInWithPassword({ email: actor.email, password: actor.password });
if (error) { console.log({ login: 'FAILED', code: error.code, status: error.status, message: error.message }); process.exit(1); }
const start = await client.rpc('nq_attempt', { p_action: 'start' });
assert.equal(start.error, null);
assert.equal(start.data.questions.length, 30);
assert.ok(!/correct|is_correct|answer_key/.test(JSON.stringify(start.data)));
const resume = await client.rpc('nq_attempt', { p_action: 'resume' });
assert.equal(resume.data.attempt_id, start.data.attempt_id);
assert.equal(resume.data.expires_at, start.data.expires_at);
await client.auth.signOut();
console.log(JSON.stringify({ authenticated_http: 'PASS', anonymous_http: 'DENIED',
  payload_leakage: 'NONE', attempt_id: start.data.attempt_id }));
