# P4-03 — Learning Topics & Resources Foundation

## Status

Draft PR, **not merged**.

## Baseline

- **Branch:** `feat/phase-4-learning-foundation`, created from the P4-02 merge commit on `master`.
- **P4-02 provenance:** merged as
  `P4_02_TECHNICAL_ACCEPTANCE_PASS_RUNTIME_REHEARSAL_PENDING`; its actor-based Storage rehearsal
  remains open as **P4-02R** (`docs/phase-4/02R-documents-storage-runtime-rehearsal.md`). P4-02R is
  a production-readiness gate and does **not** block this task.

## Headline finding — the Learning tables exist, and their RLS is unsafe

`202607300001_initial_schema.sql` already creates `learning_topics` and `learning_resources` with
essentially the full field set the specification asks for. So, as with Documents, this is **not**
a greenfield model.

What the survey also found is a **real security gap in the existing policies**:

```sql
-- 202607300001_initial_schema.sql:339
create policy "active users read published topics" on public.learning_topics
  for select using (public.is_active_user() and status='PUBLISHED');
```

The topic table has a `visibility_level` column, and the policy **never looks at it**. Any active
user can therefore read a `PUBLISHED` topic regardless of whether it is `INTERNAL_YOUTH`,
`ORGANIZATION_ONLY` or `RESTRICTED`. The resource policy has the same shape and inherits the same
flaw. This is exactly the class of gap `202607300003_fix_phase_1_security.sql` closed for
`documents` by introducing `can_access_document()` and `owner_organization_id`.

Compounding it: `learning_topics` has **no organization column at all**, so `ORGANIZATION_ONLY`
could not be enforced even if the policy tried to.

## Reuse matrix

| Component | State | Classification |
| --- | --- | --- |
| `learning_topics` (id, title, description, objectives, status, open_at, close_at, visibility_level, created_by, timestamps) | Exists, full spec field set | **REUSE** |
| `learning_topics.status` CHECK (`DRAFT/PUBLISHED/CLOSED/ARCHIVED`) | Exists; superset of the spec's DRAFT/PUBLISHED/ARCHIVED | **REUSE** — canonical project convention, no new states invented |
| `learning_resources` (id, topic_id, resource_type, title, content, storage_path, external_url, sort_order) | Exists | **REUSE** |
| `learning_resources` timestamps | Absent | **EXTEND** |
| `learning_topics.owner_organization_id` | **Absent** — `ORGANIZATION_ONLY` unenforceable | **EXTEND** |
| Topic/resource read policies | Exist but **ignore `visibility_level`** | **REPLACE** |
| Visibility model (`PUBLIC/INTERNAL_YOUTH/ORGANIZATION_ONLY/RESTRICTED`) | Canonical, used by Documents | **REUSE** — no second system |
| `can_access_learning_topic()` access helper | Absent | **NOT_IMPLEMENTED** |
| Admin write policies / trusted mutation RPCs | Absent (writes fully closed — no write grants) | **NOT_IMPLEMENTED** |
| `resource_type` / `external_url` constraints | Absent | **NOT_IMPLEMENTED** |
| Bucket `learning-resources-private` | Exists, **private**, 50 MiB (`202607300002`) | **REUSE** |
| Storage policies for that bucket | **None** — deny-all, so resources are unreachable | **NOT_IMPLEMENTED** |
| Role/scope helpers (`is_active_user`, `has_role_in_scope`, `can_manage_document`, `uuid_or_null`) | Exist | **REUSE** |
| Routes `/tri-thuc/chuyen-de`, `/tri-thuc/chuyen-de/:topicId` | Absent | **NOT_IMPLEMENTED** |
| `learningService` | Absent | **NOT_IMPLEMENTED** |
| Knowledge "Chuyên đề học tập" tab | Renders `topics` from `src/data/mock.js` | **REPLACE** |
| Markdown sanitizer (`src/lib/markdown.js`, DOMPurify) | Exists | **REUSE** |

## Grants baseline (good starting point)

`learning_topics` and `learning_resources` have `select` granted to `anon, authenticated` and **no
write grants**, so the write surface is already closed by default. P4-03 keeps it that way and adds
trusted RPCs rather than opening table writes — the pattern established by P2-06 and P4-01.

## Access model (target)

A new `can_access_learning_topic(uuid)` helper mirroring `can_access_document`, fail-closed:

- `false` unless `is_active_user()`;
- `false` unless the topic is `PUBLISHED` (so `DRAFT`, `CLOSED`, `ARCHIVED` are invisible to end
  users — admins reach them through the admin policy);
- `PUBLIC` / `INTERNAL_YOUTH` → any active user;
- `ORGANIZATION_ONLY` → the owning organization, or a `YOUTH_ADMIN` whose scope covers it;
- `RESTRICTED` → scoped `YOUTH_ADMIN` only (same posture as Documents; no per-user grant table
  exists);
- default `false`.

Resources are gated entirely by their parent topic: a resource is readable only when
`can_access_learning_topic(topic_id)` is true. Reading a resource by id directly must not bypass
that.

## Storage decision

Use the existing **private** `learning-resources-private` bucket. Internal learning material is not
made public for convenience. Path contract mirrors Documents so there is one convention, not two:

```text
learning-resources-private/{topic_id}/resources/{uuid}-{safe_filename}
```

The read policy re-derives `topic_id` from path segment 1 via `uuid_or_null` (so a malformed or
traversal-shaped path fails **closed**, silently) and defers to `can_access_learning_topic`.

## External URL safety

`external_url` is validated at the database boundary: `https:` only. `javascript:`, `data:`,
`file:`, and protocol-relative forms are rejected by CHECK constraint, so a hostile value cannot be
stored at all — the frontend is not the control. Text content is rendered through the existing
DOMPurify-based sanitizer; no arbitrary HTML is rendered.

## Explicit exclusions

Quiz tables/workflow/UI · quiz answers · scoring · certificates · AI/RAG · Gemini · embeddings ·
`document_chunks` processing · Innovation · production deployment · production credentials · any
P4-02R workaround · app-wide redesign.

## Test matrix

| ID | Case | Expect |
| --- | --- | --- |
| A | ACTIVE user reads a `PUBLISHED` topic in allowed scope | visible |
| B | User reads a `DRAFT` topic | denied |
| C | Org A user reads `ORGANIZATION_ONLY` topic of Org B | denied |
| D | Suspended user | denied |
| E | `RESTRICTED` topic without scope | denied |
| F | Accessible topic exposes only its own resources | enforced |
| G | Hidden topic's resources fetched directly by id | denied |
| H | Normal user INSERT/UPDATE/DELETE topic | denied |
| I | Normal user mutates a resource | denied |
| J | Normal user publishes a topic | denied |
| K | Dangerous external URL scheme (`javascript:`, `data:`) | rejected at the DB |
| L | Unauthorized private resource signed URL | denied |
| M | Admin mutation outside scope | denied |
| N | Successful admin mutation writes audit exactly once | enforced |
| O | Failed mutation leaves no partial durable state | enforced |
