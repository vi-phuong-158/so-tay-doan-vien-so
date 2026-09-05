import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

function stripSqlComments(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

test('Supabase migrations do not define a members table (Member data must stay out of Supabase)', async () => {
  const dir = path.join(repoRoot, 'supabase', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length > 0, 'expected to find existing Supabase migrations to check against');
  for (const file of files) {
    const sql = stripSqlComments(await readFile(path.join(dir, file), 'utf8')).toLowerCase();
    assert.doesNotMatch(
      sql,
      /create table\s+(if not exists\s+)?(public\.)?members\b/,
      `${file} must not create a members table`
    );
  }
});

test('Member API migrations never create Supabase-owned tables (auth.users/profiles/user_roles)', async () => {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length > 0);
  // Checks for an actual CREATE TABLE statement, not any mention of these names — a COMMENT ON
  // COLUMN string legitimately references "auth.users.id" to document what account_user_id maps
  // to, without ever creating that table here.
  const forbiddenCreateTable = [
    /create\s+table\s+(if not exists\s+)?"?(public\.)?"?auth"?\."?users"?\b/,
    /create\s+table\s+(if not exists\s+)?"?(public\.)?"?profiles"?\b/,
    /create\s+table\s+(if not exists\s+)?"?(public\.)?"?user_roles"?\b/,
  ];
  for (const file of files) {
    const sql = stripSqlComments(await readFile(path.join(migrationsDir, file), 'utf8')).toLowerCase();
    for (const pattern of forbiddenCreateTable) {
      assert.doesNotMatch(sql, pattern, `${file} must not create a Supabase-owned table`);
    }
  }
});

test('member-api has no AI/RAG/Gemini dependency', async () => {
  const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    assert.doesNotMatch(name.toLowerCase(), /gemini|generative-ai|embedding|pgvector|openai/);
  }
});

test('member-api source contains no AI/RAG references', async () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = await readdir(srcDir);
  const forbidden = ['gemini', 'document_chunks', 'knowledge_articles', 'embedding', 'ask-ai'];
  for (const file of files) {
    const content = (await readFile(path.join(srcDir, file), 'utf8')).toLowerCase();
    for (const term of forbidden) {
      assert.ok(!content.includes(term), `${file} must not reference "${term}"`);
    }
  }
});

test('member-api has no Supabase client dependency (Member CRUD cannot mutate Auth/user_roles even by accident)', async () => {
  const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    assert.doesNotMatch(name.toLowerCase(), /supabase/, `member-api must not depend on a Supabase client library (found "${name}")`);
  }
});

test('member-api source never references auth.users/profiles/user_roles (P5.5-03: Member CRUD produces no Auth/User Role mutation)', async () => {
  // "supabase" itself is not forbidden here — memberScope.js legitimately documents that it calls
  // the Supabase Edge Function resolve-member-scope over HTTP (no client library, no direct table
  // access; see the dedicated "no Supabase client dependency" test above). What must never appear
  // is any reference to the specific tables a mutation would touch.
  const srcDir = path.join(__dirname, '..', 'src');
  const files = await readdir(srcDir);
  const forbidden = ['auth.users', 'profiles', 'user_roles'];
  for (const file of files) {
    const content = (await readFile(path.join(srcDir, file), 'utf8')).toLowerCase();
    for (const term of forbidden) {
      assert.ok(!content.includes(term), `${file} must not reference "${term}" — Member CRUD is isolated from Supabase Auth/roles`);
    }
  }
});

test('member-api authorization code never reads a client-supplied role/organization signal (P5.5-02 muc 13/22)', async () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = await readdir(srcDir);
  // Only the Authorization header (forwarded to the resolver as-is) may ever influence an
  // authorization decision. Any of these patterns would mean the code trusts a role/org value the
  // client itself declared, instead of resolving it server-side via resolve-member-scope.
  const forbiddenPatterns = [
    /headers\[.x-role/i,
    /headers\[.x-organization/i,
    /headers\.get\(.x-role/i,
    /headers\.get\(.x-organization/i,
    /req\.body\.role/i,
    /req\.body\.organization_id/i,
    /req\.query\.role/i,
    /req\.query\.organization_id/i,
  ];
  for (const file of files) {
    const content = await readFile(path.join(srcDir, file), 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `${file} must not read a client-declared role/organization signal`);
    }
  }
});
