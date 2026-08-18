# P5-00 — AI/RAG Architecture Proposal (read-only, not implemented)

> **P5-02 amendment (2026-08-18):** This historical proposal predates the pilot storage decision.
> For Phase 5 knowledge sources only, `documents-private` is no longer the required file/blob
> provider: `document_sources` now resolves a provider-neutral locator. Google My Drive is the
> pilot provider, but Supabase/Postgres remains the authority for identity, RLS, provenance and
> publication. This does not change or remove accepted Phase 4 `documents-private` behavior.

> **⚠️ ĐÃ ĐƯỢC THAY THẾ MỘT PHẦN — đọc kèm `02-ai-rag-architecture.md` trở đi.**
>
> Tài liệu này là bản đề xuất đầu tiên của P5-00 (merged qua PR #30, `ecb5dbf`). Định hướng tổng
> thể — Wiki-first, embedding chọn lọc, human review, Option C — **được giữ nguyên và xác nhận**.
>
> Hai điểm **bị bác bỏ** bởi vòng audit sau, vì lý do bảo mật:
>
> 1. **Class A không được fetch/verify canonical source tại answer time.** Runtime fetch đưa nội
>    dung do bên thứ ba kiểm soát vào prompt mà không qua người duyệt, và làm mất khả năng chứng
>    minh hệ thống đã đọc gì. Thay bằng: URL + **snapshot bắt buộc** + Wiki đã duyệt, cập nhật qua
>    `pg_cron` staleness check. Xem `05-retrieval-source-policy.md` PART F và quyết định **D6**.
> 2. **Không dùng `document_chunks` nguyên trạng làm nơi chứa embedding.** Xem **D1** và
>    `03-knowledge-data-model.md` §5.
>
> Bản đề xuất này cũng chưa audit code Phase 5 đang có trên `master` (`ask-ai`,
> `process-document`) — phần đó ở `01-existing-work-audit.md`, và kết luận là **DROP** cả hai.
> Chỉ số task P5-0x trong tài liệu này đã được đánh lại ở `07-phase-5-implementation-plan.md`.


## Status

**PROPOSAL ONLY.** No migration, no Edge Function, no embedding, no AI API call, and no vector
infrastructure change was made to produce this document. Everything below is a recommendation to
evaluate and approve before any P5-0x implementation task starts on its own branch.

## Why this exists

The original spec (`docs/01-product-spec.md`) and the schema already on `master`
(`202607300001_initial_schema.sql`) assume the conventional shape:

```
full document → chunks → embeddings → vector search
```

`public.document_chunks` (with a `vector(768)` column and `match_document_chunks()`), and
`public.ai_conversations` / `ai_messages` / `ai_message_sources` / `ai_feedback` already exist, all
at 0 rows — built but never populated or wired to a real ingestion path. `docs/brain/03-decisions.md`
already rejected Pinecone and Google Apps Script/Sheets/Drive as primary infrastructure in favor of
Supabase (Postgres/pgvector) + Gemini. This document does not relitigate that decision; it asks a
narrower question the original spec didn't: **should everything become a chunk+embedding, or only
the content where semantic search actually earns its cost?**

## The three knowledge classes

### Class A — Public canonical content
Public regulations, public procedures, official web pages. These already have a canonical,
independently-verifiable source outside this system.

**Recommendation: do not vectorize by default.** Store title, metadata, a structured AI-generated
summary, the canonical URL, and machine-readable retrieval instructions (how to re-fetch/re-verify).
Fetch and verify the canonical source at answer time when the question needs it, rather than trusting
a stale copy embedded months earlier. Vectorize only the summary (not the source) if and when this
class shows up often enough in "Ask AI" queries that semantic recall on the summary demonstrably
helps (see the selective-indexing rule under Class C).

### Class B — Internal uploaded documents
Đoàn/Công an internal PDFs and files uploaded through the existing `documents` /
`documentAdminService` admin flow (P4-01/P4-02).

**Recommendation: controlled ingestion pipeline, not automatic full-text vectorization.**

```
upload (existing P4-02 path, unchanged)
  → malware/type validation (existing: extension allowlist, 50 MiB bound)
  → extraction (text/metadata from the attached source)
  → AI structured summary (Gemini, following docs/brain/03-decisions.md's model choice)
  → Wiki draft (a knowledge_articles row, status = PENDING_REVIEW)
  → human review (a scoped admin approves/edits before it is authoritative)
  → publish knowledge (status = PUBLISHED, now answerable by Ask AI)
```

Raw full text is **not** automatically chunked+embedded end to end. The reviewed *summary* becomes
the primary retrievable unit; the original document stays reachable through
`source_document_id`/`canonical_source_url` for anyone who needs the primal source, exactly like
today's document read model already does.

### Class C — Frequently queried knowledge
Wiki sections, approved summaries, FAQ-like knowledge units, and specific authoritative chunks
selected because a real query pattern needs sentence-level recall (e.g., "what exact deadline does
Điều 5 of quy định X set?").

**Recommendation: embeddings are opt-in per knowledge unit, not automatic per page.** A `knowledge_articles`
row (or a specific `key_points`/`procedure_steps` sub-section of one) gets an embedding only when:
(a) it has been reviewed/published, and (b) either an admin marks it as FAQ-worthy, or query-log
evidence shows the summary-level match isn't precise enough. This keeps the vector index small,
current, and provenance-clean instead of growing 1:1 with every uploaded page.

## Wiki knowledge model to evaluate

A canonical `knowledge_articles` object, evaluated as the **primary** knowledge representation
(embeddings become a secondary index over it, not the representation itself):

| Field | Purpose |
| --- | --- |
| `title`, `slug` | Canonical identity, human-navigable |
| `summary`, `key_points`, `applicability`, `procedure_steps`, `deadlines`, `required_documents` | Structured, AI-generated, human-reviewed content — the actual answerable substance |
| `related_entities` | Links to other knowledge articles / documents / learning topics |
| `source_document_id` | FK to `public.documents`, when the source is an internal upload (Class B) |
| `canonical_source_url` | The public source, when the source is external (Class A) |
| `source_hash` / `source_version` | Detects when the underlying source changed since this article was generated |
| `effective_date` | When the underlying rule/procedure takes effect, distinct from `reviewed_at` |
| `reviewed_by`, `reviewed_at`, `status` | The human-in-the-loop gate — nothing is authoritative pre-review |
| `visibility_level` | Reuses the same ladder already established for `documents`/`learning_topics` (`PUBLIC` / `INTERNAL_YOUTH` / `ORGANIZATION_ONLY` / `RESTRICTED`), not a new access model |
| standard timestamps | Consistent with every other table in this schema |

**Why this over embeddings-as-primary:** embeddings are a similarity index, not a source of truth —
they cannot themselves state a deadline correctly, distinguish "this rule changed last month" from
"this rule has been stable for years," or answer "where did this come from?" A reviewed structured
object can. This also reuses the exact review/publish pattern already proven in P4-02 (documents) and
P4-05 (learning/quiz admin) rather than inventing a new one.

`public.ai_message_sources` already has the right shape to extend for this — it links a message to
`document_id` + `chunk_id`. A future P5-01/P5-05 migration would add a nullable
`knowledge_article_id` column so an answer's citation can point at a reviewed Wiki article, a raw
chunk, or both. Not implemented here — noted so it isn't re-discovered from scratch later.

## Ingestion agent — trigger placement

Candidate trigger points, evaluated against what's already in this codebase:

| Option | Fit |
| --- | --- |
| Supabase Database Webhook on `documents` insert/status change | Good fit — the `documents` table and its `publish_document`/`attach_document_source_file` RPCs already exist and already write an audit trail; a webhook on "source attached" or "published" is a natural, low-latency trigger with no new polling infra. |
| Storage event on `documents-private` object creation | Redundant with the DB webhook above — the RPC `attach_document_source_file` is the trusted point where a source becomes official, not the raw Storage write (which could be an orphaned/failed upload, per the residual risk already recorded in P4-02). Prefer the DB-level trigger, not the Storage-level one. |
| Edge Function invoked directly by the webhook | Good fit — matches the existing pattern (`process-email-queue`, `submit-report`, etc.) of Edge Functions as the trusted execution boundary that calls out to external services (here: Gemini) with the service-role key that never reaches the frontend. |
| Scheduled worker (`pg_cron` + `pg_net`, as already used for the email queue and reminder engine) | Good fit for the **staleness-recheck** half of this (see below), not for the initial ingestion trigger — initial ingestion should be event-driven, not polled, since the event (a new/updated document) is already known precisely. |
| External agent runner (Codex/Claude/Gemini as execution agents) | Only for the human-review assist step (drafting the initial summary for a reviewer to edit), not for autonomous publish — matches the "human review" gate already designed above. |
| Google Apps Script | **Rejected**, consistent with `docs/brain/03-decisions.md` — GAS is not the source for any of these three classes; nothing here reads from Google Drive/Sheets. |

**Recommendation:** Database Webhook on the existing `documents` publish/attach path → Edge Function
→ Gemini for extraction/summary → insert `knowledge_articles` as `PENDING_REVIEW` → human review in
the existing admin UI pattern. A separate `pg_cron` job handles staleness re-checks (below), reusing
the exact scheduling infrastructure already built for Phase 3's reminder engine.

## Provenance — first class, not an afterthought

Every AI-derived knowledge item must answer "Thông tin này lấy từ đâu?" without a follow-up query.
Concretely, that means every `knowledge_articles` row (and every `ai_message_sources` citation once
extended, above) carries: exact source (`source_document_id` or `canonical_source_url`), source type,
source version/hash, generation timestamp, the generating model/process, and the human reviewer +
approval status. None of this is new invention — it's the same shape `audit_logs` already enforces
for every other mutation in this codebase (`actor_user_id`, `action`, `before_data`/`after_data`,
timestamps); this just applies that existing discipline to AI-generated content specifically.

## Staleness

A `knowledge_articles` row must not silently remain authoritative after its source changes.

- **Class B (internal document):** `source_hash` is recomputed whenever `attach_document_source_file`
  records a new source; a mismatch against the stored `source_hash` flags the article
  `NEEDS_REVIEW` rather than auto-republishing a new AI summary unreviewed.
- **Class A (public URL):** a scheduled `pg_cron` job (same infra as the existing reminder engine)
  periodically checks `ETag`/`Last-Modified` (or a content hash if neither is offered) for each
  `canonical_source_url` in use, and flags `NEEDS_REVIEW` on a mismatch.
- **Manual invalidation:** any content admin can flag an article stale directly, same permission
  model as `withdraw_document`.
- In every case, staleness **demotes** an article's status; it never auto-republishes new AI content
  without a human back in the loop, for the same reason auto-publish was rejected above.

## Vector database decision

| | Option A — broad vectorization (legacy spec) | Option B — Wiki-first, selective embeddings | Option C — hybrid canonical-link + selective internal vectorization (recommended) |
| --- | --- | --- | --- |
| What gets embedded | Every document, chunked | Only reviewed Wiki articles/sections marked FAQ-worthy | Reviewed Wiki articles selectively, external Class A content only as a thin summary+link, internal Class B content indexed only after review |
| Cost | Grows linearly with every upload, most of it never queried | Small, grows with actual usage | Small to moderate, grows with reviewed/approved content only |
| Retrieval quality | High recall, lower precision (matches raw fragments out of context) | High precision on covered topics, but coverage depends on review throughput | Best precision where it matters (internal procedures), with Class A always resolving to a live canonical source instead of a frozen fragment |
| Hallucination risk | Higher — a similar-sounding but outdated/wrong chunk can be retrieved with no version awareness | Lower — every retrievable unit was human-reviewed | Lowest — reviewed content for what's asked most, live-verified links for public canon |
| Freshness | Only as fresh as the last full re-ingestion | Freshness tied to the review workflow, explicit `NEEDS_REVIEW` state | Same as B, plus Class A never goes stale since it's re-verified at answer time |
| Provenance | Weak — a raw chunk doesn't carry structured source/version metadata by default | Strong — provenance fields are first-class on `knowledge_articles` | Strong, same as B |
| Complexity | Low to build, high to keep correct at scale | Moderate — needs the review workflow (P5-03) before Ask AI (P5-05) is useful | Moderate-high — most moving parts, but each piece reuses an existing pattern (admin review, audit, RLS visibility) rather than inventing one |
| Pinecone footprint | N/A — decisions.md already rejected Pinecone | N/A | N/A |
| Supabase pgvector fit | Works, but the index grows with content nobody asked for | Fits well — `document_chunks.embedding vector(768)` and `pgvector` are already provisioned and unused | Same — no new vector infra needed, `pgvector` already in the stack per `docs/brain/03-decisions.md` |

**Recommendation: Option C.** It is the only option that treats Class A (public canonical content) as
something to link and re-verify rather than copy, keeps Class B ingestion human-reviewed before
anything is embedded, and only spends vector-index cost on Class C content that has demonstrated
query demand. It builds entirely on infrastructure already decided and already present
(Supabase/pgvector, Gemini, the existing admin-review/audit/RLS patterns) — no new vendor, no new
access-control model, no reintroduction of Pinecone or Google Apps Script.

## Proposed task breakdown (none implemented by this task)

| Task | Scope |
| --- | --- |
| P5-00 | This document — architecture decision only (current task) |
| P5-01 | `knowledge_articles` schema + RLS (reusing the existing visibility ladder), no ingestion yet |
| P5-02 | Provider-neutral ingestion foundation: canonical-source trigger → leased job → NO_OP Edge worker; no Drive/API/AI call |
| P5-03 | Summarization/review workflow UI (admin), publish/withdraw/`NEEDS_REVIEW` transitions, audit |
| P5-04 | Selective retrieval/indexing — FAQ-worthy flag, embedding generation for approved units only, `match_document_chunks`-equivalent over `knowledge_articles` |
| P5-05 | Ask AI with provenance — wires `ai_conversations`/`ai_messages`/`ai_message_sources` (extended with `knowledge_article_id`) to the P5-04 retrieval, always surfaces source + "Thông tin này lấy từ đâu?" |
| P5-06 | Evaluation/security — prompt-injection resistance for ingested content, answer-quality eval set, rate limiting on the Gemini-calling Edge Function |
| P5-07 | Phase 5 final acceptance — same technical/runtime-gate separation pattern as Phase 3 (P3-09) and Phase 4 (P4-06/P4-R) |

Each task starts on its own branch, per this repository's one-branch-per-phase convention. None is
started by this task.

## Explicitly not done by this document

- No `knowledge_articles` (or any other) migration was written or applied.
- No Edge Function was created or deployed.
- No embedding was generated. No Gemini or any external AI API was called.
- No vector index or `pgvector` extension change was made — `pgvector` is already present from the
  initial schema and untouched here.
- No existing table (`document_chunks`, `ai_conversations`, `ai_messages`, `ai_message_sources`,
  `ai_feedback`) was altered.
