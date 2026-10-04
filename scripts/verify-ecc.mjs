// Original repo-local structural check. No hooks, subprocesses, network or writes.
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
  'AGENTS.md', 'CLAUDE.md',
  '.ecc/README.md', '.ecc/PROJECT.md', '.ecc/WORKFLOW.md', '.ecc/ACCEPTANCE.md',
  '.ecc/SAFETY.md', '.ecc/ECC_UPSTREAM.md', '.ecc/AUDIT.md', '.ecc/memory/README.md',
  '.ecc/memory/decisions/README.md', '.ecc/memory/decisions/TEMPLATE.md',
  '.ecc/memory/decisions/0001-ecc-lite-cloud-v1.md',
  '.ecc/memory/handoffs/README.md', '.ecc/memory/handoffs/TEMPLATE.md',
  '.ecc/memory/lessons/README.md', '.ecc/memory/runbooks/README.md',
  '.ecc/memory/runbooks/verification.md', '.ecc/memory/runbooks/database.md',
  '.ecc/memory/runbooks/runtime.md', '.ecc/memory/runbooks/fresh-agent-review.md',
];

function inside(root, path) {
  const local = relative(root, path);
  return local !== '..' && !local.startsWith('..' + sep) && !isAbsolute(local);
}

function checkedPath(root, path) {
  if (!inside(root, path)) throw new Error('outside repository');
  // Reject every symlink component, including links that currently stay inside.
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('symlink');
  }
  if (!inside(root, realpathSync(path))) throw new Error('outside repository');
  return path;
}

function markdownFiles(root, directory) {
  checkedPath(root, directory);
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('symlink in ECC tree');
      if (entry.isDirectory()) return markdownFiles(root, path);
      return entry.isFile() && entry.name.endsWith('.md') ? [relative(root, path)] : [];
    });
}

function dependencyEntries(value = {}) {
  return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export function verifyEcc(projectRoot) {
  const root = realpathSync(projectRoot);
  const errors = [];
  let discovered = [];
  try {
    discovered = markdownFiles(root, resolve(root, '.ecc'));
  } catch {
    errors.push('ECC_TREE_INVALID: missing/unreadable directory or symlink');
  }
  const documents = [...new Set([...REQUIRED, ...discovered])].sort();
  for (const document of documents) {
    let source;
    try {
      source = readFileSync(checkedPath(root, resolve(root, document)), 'utf8');
      if (!source.trim()) throw new Error('empty');
    } catch {
      errors.push('DOCUMENT_INVALID: ' + document);
      continue;
    }
    // Check inline links outside fenced code. External URLs/fragment-only links
    // are deliberately not fetched; anchors and prose semantics need fresh review.
    const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
    for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const href = match[1].trim().replace(/^<([^>]+)>$/, '$1');
      if (/^(https?:|mailto:|#)/i.test(href)) continue;
      try {
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || isAbsolute(href)) throw new Error('unsupported');
        const target = decodeURIComponent(href.split('#')[0]);
        checkedPath(root, resolve(dirname(resolve(root, document)), target));
      } catch {
        // Do not echo an arbitrary link value (it could contain a credential).
        errors.push('LOCAL_LINK_INVALID: ' + document);
      }
    }
  }
  for (const prefix of ['', 'member-api/']) {
    try {
      const manifest = JSON.parse(readFileSync(checkedPath(root, resolve(root, prefix + 'package.json')), 'utf8'));
      const lock = JSON.parse(readFileSync(checkedPath(root, resolve(root, prefix + 'package-lock.json')), 'utf8'));
      const locked = lock.packages?.[''];
      if (!locked || manifest.name !== locked.name || manifest.version !== locked.version) {
        throw new Error('lock metadata');
      }
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        if (dependencyEntries(manifest[section]) !== dependencyEntries(locked[section])) {
          throw new Error('dependency drift');
        }
      }
    } catch {
      errors.push('MANIFEST_LOCK_INVALID: ' + (prefix || 'root'));
    }
  }
  return { documents: documents.length, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyEcc(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  if (result.errors.length) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('ECC_STRUCTURE_PASS: ' + result.documents + ' Markdown files; 2 manifest/lock pairs');
    console.log('Structural evidence only; semantic review, DB and runtime gates are separate.');
  }
}
