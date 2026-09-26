// P5.5-07R — data-plane isolation regression. Member PII (Member Record — full_name, date_of_birth,
// work_unit_code, etc.) must never reach Gemini/RAG/embeddings/document_chunks, email, analytics,
// or browser storage (localStorage/IndexedDB). This is a hard invariant carried over from the
// P5.5-00 architecture (Account Profile vs Member Record are separate systems; Member PII never
// sent to the AI pipeline). Static, source-level regression: it fails loudly if a future change
// accidentally wires Member code into any of those paths, rather than relying on manual review
// each time to catch it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// URL.pathname leaves spaces percent-encoded on Windows (for example `%20`),
// which makes every source-level isolation assertion look like a missing file.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readIfExists(relativePath) {
  const full = path.join(repoRoot, relativePath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
}

function listFilesRecursive(dir, { exclude = ['node_modules', '.git'] } = {}) {
  const full = path.join(repoRoot, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(entryPath, { exclude }));
    else out.push(entryPath);
  }
  return out;
}

// AI/RAG-related terms that Member code must never mention. Deliberately narrow, precise tokens
// (not generic English words) to avoid false positives.
const AI_RAG_TOKENS = [/gemini/i, /generativelanguage/i, /\bembedding/i, /document_chunks/i, /\brag[_-](pipeline|context|query)/i];
const BROWSER_STORAGE_TOKENS = [/localStorage/, /sessionStorage/, /indexedDB/i];
const EMAIL_ANALYTICS_TOKENS = [/EMAIL_PROVIDER/, /analytics/i, /\bmixpanel\b/i, /\bsegment\.io\b/i, /\bposthog\b/i];

const MEMBER_FRONTEND_FILES = [
  'src/services/memberService.js',
  'src/lib/memberDisplay.mjs',
  'src/pages/MemberManagement.jsx',
  'src/pages/MemberDetail.jsx',
  'src/pages/MemberImport.jsx',
];

test('Member frontend files never mention Gemini/RAG/embeddings terms', () => {
  for (const file of MEMBER_FRONTEND_FILES) {
    const source = readIfExists(file);
    assert.ok(source, `expected ${file} to exist`);
    for (const token of AI_RAG_TOKENS) {
      assert.ok(!token.test(source), `${file} unexpectedly references AI/RAG token ${token}`);
    }
  }
});

test('Member frontend files never use browser storage (localStorage/sessionStorage/IndexedDB) for Member data', () => {
  for (const file of MEMBER_FRONTEND_FILES) {
    const source = readIfExists(file);
    for (const token of BROWSER_STORAGE_TOKENS) {
      assert.ok(!token.test(source), `${file} unexpectedly references browser storage token ${token}`);
    }
  }
});

test('Member frontend files never reference email-provider or analytics vocabulary', () => {
  for (const file of MEMBER_FRONTEND_FILES) {
    const source = readIfExists(file);
    for (const token of EMAIL_ANALYTICS_TOKENS) {
      assert.ok(!token.test(source), `${file} unexpectedly references email/analytics token ${token}`);
    }
  }
});

test('memberService.js is never imported by the AI/RAG frontend service, and vice versa', () => {
  const aiService = readIfExists('src/services/aiService.js');
  assert.ok(aiService, 'expected src/services/aiService.js to exist');
  assert.ok(!aiService.includes('memberService'), 'aiService.js must never import memberService');

  const memberService = readIfExists('src/services/memberService.js');
  assert.ok(!memberService.includes('aiService'), 'memberService.js must never import aiService');
});

test('the entire member-api/src source tree never mentions Gemini/RAG/embeddings terms — Member API has no AI dependency at all', () => {
  const files = listFilesRecursive('member-api/src').filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'expected to find member-api source files');
  for (const file of files) {
    const source = readIfExists(file);
    for (const token of AI_RAG_TOKENS) {
      assert.ok(!token.test(source), `${file} unexpectedly references AI/RAG token ${token}`);
    }
  }
});

test('member-api/package.json never depends on an AI/embeddings SDK (e.g. @google/generative-ai, openai, pinecone)', () => {
  const pkg = JSON.parse(readIfExists('member-api/package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const forbidden = Object.keys(deps).filter((name) => /gemini|generative|openai|pinecone|embedding/i.test(name));
  assert.deepEqual(forbidden, []);
});

// The AI/RAG-facing Edge Functions must never reference Member Record fields/tables/env vars —
// proves the isolation holds from the OTHER direction too (AI pipeline never reaches into Member
// data), not just that Member code never reaches into AI.
const AI_EDGE_FUNCTIONS = ['ask-ai', 'generate-knowledge-article', 'process-document', 'run-ingestion-jobs'];
const MEMBER_TOKENS = [/\bMEMBER_DATABASE_URL\b/, /\bMEMBER_SCOPE_RESOLVER/, /\bmember_audit_logs\b/, /\bmember_import_jobs\b/, /work_unit_code/];

test('AI/RAG Edge Functions never reference Member Record fields, tables, or env vars', () => {
  for (const fn of AI_EDGE_FUNCTIONS) {
    const files = listFilesRecursive(`supabase/functions/${fn}`);
    assert.ok(files.length > 0, `expected to find files under supabase/functions/${fn}`);
    for (const file of files) {
      const source = readIfExists(file);
      if (source === null) continue;
      for (const token of MEMBER_TOKENS) {
        assert.ok(!token.test(source), `${file} unexpectedly references Member-Record token ${token}`);
      }
    }
  }
});

test('resolve-member-scope (the ONE legitimate cross-system bridge) never references Gemini/RAG — it only resolves roles/org scope, no AI dependency', () => {
  const files = listFilesRecursive('supabase/functions/resolve-member-scope');
  for (const file of files) {
    const source = readIfExists(file);
    if (source === null) continue;
    for (const token of AI_RAG_TOKENS) {
      assert.ok(!token.test(source), `${file} unexpectedly references AI/RAG token ${token}`);
    }
  }
});
