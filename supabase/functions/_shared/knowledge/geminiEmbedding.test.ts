import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { embeddingEndpoint, embeddingRequest, GEMINI_EMBEDDING_DIMENSION, parseEmbeddingResponse } from './geminiEmbedding.ts';

Deno.test('Gemini embedding request explicitly requests the database vector dimension', () => {
  assertEquals(embeddingRequest('fixture text').output_dimensionality, GEMINI_EMBEDDING_DIMENSION);
  assertEquals(embeddingEndpoint('models/gemini-embedding-2'), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent');
});

Deno.test('Gemini embedding response accepts exactly 768 finite numeric dimensions', () => {
  assertEquals(parseEmbeddingResponse({ embedding: { values: Array.from({ length: 768 }, () => 0.25) } }).length, 768);
});

Deno.test('Gemini embedding response fails closed for a wrong dimension or invalid numeric value', () => {
  assertThrows(() => parseEmbeddingResponse({ embedding: { values: Array.from({ length: 767 }, () => 0) } }), /GEMINI_EMBEDDING_DIMENSION_INVALID/);
  assertThrows(() => parseEmbeddingResponse({ embedding: { values: [...Array.from({ length: 767 }, () => 0), Number.NaN] } }), /GEMINI_EMBEDDING_DIMENSION_INVALID/);
});
