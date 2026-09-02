import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 12_000;

export function diagnosticRequest(prompt) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2400,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'medium' },
    },
  };
}

export function syntheticAcceptancePrompt() {
  return `Bạn là bộ sinh bản nháp tri thức. Chỉ dùng nguồn dưới đây và trả JSON {title,summary,key_points,structured_content,evidence,warnings}.
Tài liệu: {"title":"Synthetic Phase 5 acceptance"}. Article key: overview.
NGUỒN:
[Trang 1]
PHASE 5 REHEARSAL DOCUMENT
Section Alpha: The fictional Blue Lotus procedure requires three review steps.
Section Beta: The fictional completion keyword is ORCHID-5729.
Section Gamma: Retrieval becomes permitted only after human approval and retrieval enablement.`;
}

function loadEnvLine(line) {
  const match = line.match(/^(?:\$env:)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!match) return null;
  return [match[1], match[2].trim().replace(/^(?:'|")|(?:'|")$/g, '')];
}

async function loadOptionalEnv(file) {
  if (!file) return;
  const contents = await readFile(file, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const entry = loadEnvLine(line.trim());
    if (entry && !process.env[entry[0]]) process.env[entry[0]] = entry[1];
  }
}

export function timeoutCategory(error) {
  return error instanceof DOMException && error.name === 'TimeoutError' ? 'MODEL_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
}

export function responseOutcome(response, body) {
  if (response.status === 429) return 'MODEL_RATE_LIMITED';
  if (response.status === 500 || response.status === 503) return 'PROVIDER_UNAVAILABLE';
  if (!response.ok) return 'MODEL_PROVIDER_ERROR';
  const text = body?.candidates?.[0]?.content?.parts
    ?.map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  return text ? 'SUCCESS' : 'MODEL_INVALID_OUTPUT';
}

export function isDirectExecution(argvEntry, moduleUrl) {
  return Boolean(argvEntry) && pathToFileURL(resolve(argvEntry)).href === moduleUrl;
}

async function main() {
  await loadOptionalEnv(process.env.PHASE5_GEMINI_DIAGNOSTIC_ENV_FILE);
  const model = process.env.KNOWLEDGE_GENERATION_MODEL;
  const apiKey = process.env.GEMINI_API_KEY;
  const timeoutMs = Number(process.env.GEMINI_DIAGNOSTIC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!model || !apiKey || !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error('PHASE5_GEMINI_DIAGNOSTIC_CONFIGURATION_REQUIRED');
  }
  const prompt = syntheticAcceptancePrompt();
  const startedAt = Date.now();
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(diagnosticRequest(prompt)),
    });
    const body = await response.json().catch(() => null);
    console.log(JSON.stringify({
      model,
      request_class: 'synthetic_acceptance_shape',
      prompt_characters: prompt.length,
      elapsed_ms: Date.now() - startedAt,
      http_status: response.status,
      outcome: responseOutcome(response, body),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      model,
      request_class: 'synthetic_acceptance_shape',
      prompt_characters: prompt.length,
      elapsed_ms: Date.now() - startedAt,
      outcome: timeoutCategory(error),
    }));
  }
}

if (isDirectExecution(process.argv[1], import.meta.url)) await main();
