import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyEcc } from '../scripts/verify-ecc.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ecc-lite-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Reproduce the actual reading graph; no application execution or credentials.
  for (const path of ['.ecc', 'AGENTS.md', 'CLAUDE.md', 'docs', '.github', 'package.json',
    'package-lock.json', 'member-api/README.md', 'member-api/.env.example',
    'member-api/package.json', 'member-api/package-lock.json', '.env.example', 'vercel.json']) {
    cpSync(join(root, path), join(directory, path), { recursive: true });
  }
  return directory;
}

test('repository ECC reading graph and both committed locks are consistent', () => {
  assert.deepEqual(verifyEcc(root).errors, []);
});

test('a missing required safety policy fails closed', (t) => {
  const directory = fixture(t);
  rmSync(join(directory, '.ecc/SAFETY.md'));
  assert.ok(verifyEcc(directory).errors.includes('DOCUMENT_INVALID: .ecc/SAFETY.md'));
});

test('empty handoff template and broken reading link are reported', (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, '.ecc/memory/handoffs/TEMPLATE.md'), ' \n');
  writeFileSync(join(directory, '.ecc/README.md'), '[next](missing.md)\n');
  const errors = verifyEcc(directory).errors;
  assert.ok(errors.includes('DOCUMENT_INVALID: .ecc/memory/handoffs/TEMPLATE.md'));
  assert.ok(errors.includes('LOCAL_LINK_INVALID: .ecc/README.md'));
});

test('out-of-repository and encoded traversal links fail without echoing content', (t) => {
  const directory = fixture(t);
  const outside = join(dirname(directory), 'ecc-external-sensitive-' + Date.now() + '.md');
  writeFileSync(outside, 'private context');
  t.after(() => rmSync(outside));
  writeFileSync(join(directory, '.ecc/README.md'),
    '[bad](../../' + basename(outside) + ')\n[encoded](%2e%2e/%2e%2e/outside.md)\n');
  const errors = verifyEcc(directory).errors;
  assert.equal(errors.filter((e) => e === 'LOCAL_LINK_INVALID: .ecc/README.md').length, 2);
  assert.ok(!JSON.stringify(errors).includes('private context'));
});

test('symlinked policy and ECC directory are rejected', (t) => {
  const directory = fixture(t);
  const policy = join(directory, '.ecc/SAFETY.md');
  rmSync(policy);
  symlinkSync(join(directory, '.ecc/WORKFLOW.md'), policy);
  const errors = verifyEcc(directory).errors;
  assert.ok(errors.includes('DOCUMENT_INVALID: .ecc/SAFETY.md'));
  assert.ok(errors.some((e) => e.startsWith('ECC_TREE_INVALID')));
});

test('dependency drift in either package manifest requires a matching lockfile', (t) => {
  const directory = fixture(t);
  for (const prefix of ['', 'member-api/']) {
    const path = join(directory, prefix, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies['unlocked-example'] = '1.0.0';
    writeFileSync(path, JSON.stringify(manifest));
  }
  assert.deepEqual(verifyEcc(directory).errors.filter((e) => e.startsWith('MANIFEST_LOCK_INVALID')),
    ['MANIFEST_LOCK_INVALID: root', 'MANIFEST_LOCK_INVALID: member-api/']);
});

test('external and fenced example links do not cause network access or false failures', (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, '.ecc/README.md'),
    '[reference](https://example.invalid/)\n\n```md\n[example](missing-example.md)\n```\n');
  assert.deepEqual(verifyEcc(directory).errors, []);
});
