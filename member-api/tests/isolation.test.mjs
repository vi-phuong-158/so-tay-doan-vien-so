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
