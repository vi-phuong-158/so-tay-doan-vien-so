# P5-00 Part N — Mô hình dữ liệu tri thức (đề xuất)

> **Không migration nào được viết hay chạy trong P5-00.** Đây là đặc tả để P5-01 hiện thực hóa.
> Tên bảng/cột có thể điều chỉnh khi viết migration; các **bất biến** thì không.

---

## 1. Nguyên tắc thiết kế

1. **Không dựng lại `documents`.** Bảng này đã đủ field canonical và đã được Phase 4 nghiệm thu
   cùng RLS/Storage. Bổ sung xung quanh, không thay thế. (Cùng lý do P4-01 đã ghi trong
   `docs/brain/03-decisions.md`: dựng lại làm lệch model quyền đã kiểm chứng.)
2. **Không dựng mô hình phân quyền thứ hai.** Mọi bảng tri thức mới suy ra quyền từ
   `can_access_document(document_id)` — nguồn quyền duy nhất. Không nhân bản `visibility_level`
   xuống từng bản ghi con (đây chính là lỗi §3.8 của audit).
3. **Lịch sử bất biến.** Bản đã publish không bị ghi đè, giống hệt cách `report_submissions` xử lý
   báo cáo nộp lại (`docs/brain/03-decisions.md` [2026-07-30]).
4. **Ràng buộc ở DB, không ở code** (`docs/brain/02-coding-rules.md`): dùng CHECK constraint, FK,
   partial unique index thay vì validate trong Edge Function.

---

## 2. Sơ đồ

```
documents (CÓ SẴN — chỉ thêm cột)
   │ 1
   ├──< document_versions ──────< document_sources        ← Layer 1 Canonical
   │        │ 1                        (file | url + snapshot)
   │        │
   │        ├──< knowledge_wikis ──< knowledge_wiki_versions   ← Layer 2 Wiki
   │        │                              │
   │        └──< knowledge_evidence ───────┤                   ← Layer 3 Evidence
   │                    │                  │
   │                    └──< knowledge_embeddings >────────────┘  (chỉ mục chọn lọc)
   │
   ├──< document_relations (CÓ SẴN — siết enum)
   └──< ingestion_jobs ──< ingestion_events

ai_conversations ──< ai_messages ──< ai_message_sources ──> (wiki_version | evidence | document_version)
                          │
                          └──< ai_feedback
ai_usage_quota
```

---

## 3. Layer 1 — Canonical Source

### 3.1 `documents` — thêm cột, không đổi cột cũ

| Cột thêm | Kiểu | Ghi chú |
| --- | --- | --- |
| `source_class` | `text not null default 'CLASS_B'` CHECK ∈ {`CLASS_A_PUBLIC_WEB`, `CLASS_B_INTERNAL`, `CLASS_C_LONG_REFERENCE`, `CLASS_D_STRUCTURED_FORM`, `CLASS_E_SUPERSEDED`} | Quyết định chiến lược ingestion; xem `04-ingestion-and-review-workflow.md` |
| `current_version_id` | `uuid references document_versions(id)` | Con trỏ tới version đang hiệu lực. Nullable trong lúc tạo (chicken-and-egg), đặt bằng RPC. |
| `ingestion_status` | `text not null default 'NOT_STARTED'` | **Tách hoàn toàn khỏi `documents.status`.** Đây là sửa lỗi §3.4 của audit: pipeline AI không được đụng vào state machine xuất bản của Phase 4. |
| `retrieval_enabled` | `boolean not null default false` | Công tắc chặn cứng: `false` ⇒ không đơn vị tri thức nào của tài liệu này vào retrieval, bất kể trạng thái Wiki. |

**Không đổi:** `status`, `visibility_level`, `owner_organization_id`, `approved_by/at`, và mọi RPC
Phase 4 (`create_document_draft`, `update_document_metadata`, `publish_document`,
`withdraw_document`, `attach_document_source_file`, `detach_document_source_file`).

**Siết `effect_status`** bằng CHECK ∈ {`CON_HIEU_LUC`, `HET_HIEU_LUC`, `BI_THAY_THE`, `SUA_DOI_BO_SUNG`, `CHUA_XAC_DINH`}.
Hiện là text tự do, nên retrieval không thể tin cậy lọc theo hiệu lực (audit §5).

### 3.2 `document_versions` (mới) — bất biến

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `document_id` | `uuid not null → documents(id) on delete cascade` | |
| `version_number` | `integer not null` | cấp nguyên tử trong RPC, `unique(document_id, version_number)` |
| `content_hash` | `text not null` | SHA-256 của bytes gốc (file) hoặc của normalized HTML (URL) |
| `byte_size` | `bigint check (byte_size >= 0)` | |
| `mime_type` | `text` | do backend xác định, **không tin MIME client khai báo** (đã là quy tắc Phase 4) |
| `effective_from`, `effective_to` | `date` | hiệu lực *của phiên bản này*, khác `documents.effective_date` |
| `supersedes_version_id` | `uuid → document_versions(id)` | |
| `created_by`, `created_at` | | |

**Bất biến:** không có RPC nào UPDATE nội dung của một `document_version` đã tạo. Nguồn đổi ⇒ tạo
version mới. Cưỡng chế bằng trigger `BEFORE UPDATE` raise exception trên các cột nội dung.

### 3.3 `document_sources` (mới)

Một version có 1..n nguồn (ví dụ: URL công khai + bản chụp PDF đã tải về).

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `document_version_id` | `uuid not null →` | |
| `source_kind` | `text` CHECK ∈ {`STORAGE_FILE`, `OFFICIAL_URL`, `URL_SNAPSHOT`} | |
| `storage_path` | `text` | bucket `documents-private`, dùng lại policy Phase 4 nguyên vẹn |
| `official_url` | `text` | |
| `fetched_at`, `http_etag`, `http_last_modified` | | phục vụ staleness re-check |
| `snapshot_storage_path` | `text` | **bản chụp bắt buộc cho Class A** — xem `05-retrieval-source-policy.md` PART F |
| `content_hash` | `text` | |

`CHECK`: `source_kind='STORAGE_FILE'` ⇒ `storage_path is not null`; `='OFFICIAL_URL'` ⇒
`official_url is not null`.

### 3.4 `document_relations` — siết CHECK, không đổi PK

`relation_type` CHECK ∈ {`REPLACES`, `REPLACED_BY`, `AMENDS`, `AMENDED_BY`, `REFERENCES`, `RELATED`}.
Hiện là text tự do (audit §5), nên không thể viết retrieval policy "ưu tiên văn bản thay thế".
Policy đọc hai đầu quan hệ của P4-01 giữ nguyên.

---

## 4. Layer 2 — Knowledge Wiki

### 4.1 `knowledge_wikis` (mới) — danh tính ổn định

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `document_id` | `uuid not null → documents(id)` | nguồn quyền duy nhất |
| `slug` | `text unique` | URL con người đọc được |
| `title` | `text not null` | |
| `current_published_version_id` | `uuid → knowledge_wiki_versions(id)` | NULL = chưa có bản nào được publish ⇒ **không vào retrieval** |
| `status` | `text not null` CHECK ∈ 9 trạng thái (xem `04-ingestion-and-review-workflow.md`) | |
| `created_at`, `updated_at` | | |

`unique(document_id)` cho Class A/B/D (một tài liệu một Wiki). Class C (sách/giáo trình) cho phép
nhiều Wiki theo chương ⇒ dùng partial unique index loại trừ `CLASS_C_LONG_REFERENCE`.

### 4.2 `knowledge_wiki_versions` (mới) — bất biến sau khi publish

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `wiki_id` | `uuid not null →` | |
| `version_number` | `integer not null`, `unique(wiki_id, version_number)` | |
| `document_version_id` | `uuid not null → document_versions(id)` | **Wiki luôn neo vào đúng một phiên bản nguồn.** Đây là mắt xích provenance quan trọng nhất. |
| `content` | `jsonb not null` | cấu trúc 8 mục + FAQ + related + nguồn (xem `02-ai-rag-architecture.md` §3) |
| `content_text` | `text generated` | dạng phẳng để full-text search + embedding; sinh từ `content` |
| `search_tsv` | `tsvector generated` | `to_tsvector('simple', content_text)` — tiếng Việt không có config dictionary sẵn, dùng `simple` + unaccent |
| `provider`, `model`, `prompt_version` | `text` | PART O — không khóa schema vào Gemini |
| `generated_at` | `timestamptz` | |
| `generation_kind` | `text` CHECK ∈ {`AI_DRAFT`, `HUMAN_EDITED`, `HUMAN_AUTHORED`} | phân biệt AI synthesis với nội dung người viết |
| `review_status` | `text` CHECK ∈ {`DRAFT`,`PENDING_REVIEW`,`APPROVED`,`REJECTED`,`SUPERSEDED`} | |
| `reviewed_by`, `reviewed_at`, `review_note` | | |
| `published_at` | `timestamptz` | |
| `warnings` | `jsonb` | cảnh báo tự động cho reviewer: phát hiện thử injection, mục thiếu evidence, mâu thuẫn ngày hiệu lực |

**Bất biến:** `review_status='APPROVED'` ⇒ trigger chặn UPDATE lên `content`, `document_version_id`,
`provider/model/prompt_version`. Sửa sau khi duyệt ⇒ tạo version mới. Cùng triết lý với "không ghi
đè phiên bản báo cáo đã nộp" (quy tắc cứng #7 của `CLAUDE.md`).

---

## 5. Layer 3 — Evidence & Embeddings

### 5.1 `knowledge_evidence` — refactor từ `document_chunks`

Giữ bảng `document_chunks` và mở rộng (đổi tên là tùy chọn của P5-01; nếu đổi thì phải cập nhật
Code Graph). Thay đổi:

| Hành động | Cột | Lý do |
| --- | --- | --- |
| **Thêm** | `document_version_id uuid not null → document_versions(id)` | Evidence phải neo version, không neo document. Không có cột này thì trích dẫn hết nghĩa khi văn bản có bản mới. |
| **Thêm** | `evidence_kind text` CHECK ∈ {`ARTICLE_CLAUSE`, `DEADLINE`, `PROCEDURE_STEP`, `FORM_FIELD`, `DEFINITION`, `TABLE_ROW`, `QUOTE`} | Thay `section_path` tự do bằng ý định có kiểu; cho phép retrieval theo loại. |
| **Thêm** | `selected_by text` CHECK ∈ {`AI_SUGGESTED`,`HUMAN_SELECTED`,`QUERY_DRIVEN`} + `selected_reason text` | Trả lời được "vì sao đoạn này có trong index" — tiêu chí D4. |
| **Thêm** | `locator jsonb` | `{dieu, khoan, diem, page, paragraph}` — trích dẫn đúng điều/khoản, không chỉ "trang 4". |
| **Bỏ** | `visibility_level` | Cột chết, không policy nào đọc (audit §3.8). Quyền suy ra từ `document_id`. |
| **Bỏ** | `embedding vector(768)` | Chuyển sang `knowledge_embeddings` để không khóa dimension. |
| **Sửa** | `unique(document_id, content_hash)` → `unique(document_version_id, content_hash, evidence_kind)` | Bản cũ làm hỏng insert khi tài liệu có hai đoạn giống hệt (audit §3.5). |
| **Sửa** | `chunk_index` → nullable `sort_order` | Evidence chọn lọc không có thứ tự liên tục. |
| **Giữ** | `content`, `content_hash`, `review_status`, `page_from/to`, timestamps | |

### 5.2 `knowledge_embeddings` (mới)

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `uuid pk` | |
| `target_kind` | `text` CHECK ∈ {`WIKI_VERSION`,`WIKI_SECTION`,`EVIDENCE`} | |
| `wiki_version_id` / `evidence_id` | `uuid` (đúng một cái not null, CHECK) | |
| `section_key` | `text` | khi `target_kind='WIKI_SECTION'` |
| `document_id` | `uuid not null` (denormalize) | **để lọc quyền được trước bước vector** — bù đúng lỗi recall §3.7 của audit |
| `embedding` | `vector` (không cố định chiều ở cột; một partial index cho mỗi model/dimension) | |
| `embedding_model`, `embedding_dimension`, `embedded_at` | | PART O |
| `is_active` | `boolean not null default true` | migrate model = bật/tắt, không xóa |

`unique(target_kind, coalesce(wiki_version_id, evidence_id), section_key, embedding_model)`.

**Chỉ tồn tại hàng ở đây khi** đơn vị đích đã `PUBLISHED`/`APPROVED` **và**
`documents.retrieval_enabled = true`. Cưỡng chế bằng trigger, không bằng code Edge Function.

---

## 6. Ingestion

### 6.1 `ingestion_jobs` — sao mẫu `email_queue`

Không phát minh lại: `email_queue` đã có `status` (`PENDING/PROCESSING/SENT/FAILED/CANCELLED`),
`attempt_count`, `idempotency_key unique`, `scheduled_at`, `last_error`, cơ chế claim/lease/reclaim
đã chạy thật ở P3-08. Dùng lại đúng hình dạng đó với:

| Cột | Ghi chú |
| --- | --- |
| `job_kind` | `EXTRACT` / `ANALYZE` / `EMBED` / `SNAPSHOT_REFRESH` / `STALENESS_CHECK` |
| `document_version_id` | mục tiêu |
| `idempotency_key unique` | `job_kind + document_version_id + extractor/prompt/embedding version` — chạy lại an toàn (bất biến idempotent của `02-ai-rag-architecture.md`) |
| `status`, `attempt_count`, `max_attempts`, `claimed_at`, `lease_expires_at`, `last_error` | y như `email_queue` |
| `payload jsonb`, `result jsonb` | |

### 6.2 `ingestion_events`

Append-only. `job_id`, `event_type`, `detail jsonb`, `created_at`. Phục vụ PART P (observability) và
điều tra sự cố. **Không log nguyên văn nội dung tài liệu** — chỉ hash, độ dài, mã lỗi, số token.

---

## 7. AI runtime

| Bảng | Thay đổi |
| --- | --- |
| `ai_conversations` | **Giữ nguyên.** RLS `user_id = auth.uid()` đã đúng. |
| `ai_messages` | Thêm `provider`, `prompt_version`, `retrieval_strategy` (`EXACT_ID`/`METADATA`/`WIKI_SEMANTIC`/`EVIDENCE_VECTOR`/`HYBRID`), `refusal_reason`, `source_count`. Giữ `model`, `latency_ms`, `token_usage`. |
| `ai_message_sources` | **Sửa PK.** Hiện `(message_id, document_id, chunk_id)` với `chunk_id` nullable ⇒ Postgres cấm NULL trong PK ⇒ không trích dẫn được ở mức Wiki (audit §3.9). Đổi thành `id uuid pk` + `unique(message_id, rank)`; thêm `wiki_version_id`, `evidence_id`, `document_version_id`, `source_kind`, `similarity`, `quoted_excerpt`. |
| `ai_feedback` | **Giữ nguyên.** |
| `ai_usage_quota` (mới) | `user_id`, `period_start`, `questions_used`, `tokens_used`, `limit_questions`, `limit_tokens`. `docs/brain/01-architecture.md` L340 đã mô tả quota nhưng chưa có bảng. |

---

## 8. RLS — bảng tổng hợp

Nguyên tắc: **mọi bảng tri thức đọc được khi và chỉ khi đọc được tài liệu gốc.**

| Bảng | SELECT | INSERT/UPDATE/DELETE |
| --- | --- | --- |
| `document_versions`, `document_sources` | `can_access_document(document_id)`; admin scope đọc cả bản chưa publish | **Không grant cho `authenticated`.** Chỉ qua RPC `security definer`. |
| `knowledge_wikis` | `can_access_document(document_id)` **và** `current_published_version_id is not null`; admin scope thấy hết | RPC only |
| `knowledge_wiki_versions` | như trên, thêm `review_status='APPROVED'` cho người dùng cuối | RPC only |
| `knowledge_evidence` | `can_access_document(document_id)` **và** `review_status='APPROVED'` | RPC only |
| `knowledge_embeddings` | **Không SELECT cho `authenticated`.** Chỉ hàm retrieval `security definer` đọc. | service role only |
| `ingestion_jobs`, `ingestion_events` | admin scope của tổ chức sở hữu tài liệu | service role only |
| `ai_*` | như hiện tại (`user_id = auth.uid()`) | RPC / service role có kiểm quyền sở hữu |
| `ai_usage_quota` | `user_id = auth.uid()` (chỉ đọc của mình) | service role only |

**Bắt buộc kèm migration** (quy tắc cứng #6 của `CLAUDE.md`): pgTAP cho từng dòng bảng trên, gồm cả
ca âm (người dùng tổ chức khác, tài khoản `SUSPENDED`, tài liệu `DRAFT`, Wiki `PENDING_REVIEW`).

Và: **revoke** `insert, update, delete` trên `document_chunks`/`knowledge_evidence` và mọi bảng
`ai_*` khỏi `authenticated` — đúng cách Phase 4 đã làm với `documents`. Grant hiện tại
(`202607300001` L401, L412–415) rộng hơn nhu cầu và chỉ đang được RLS chặn.
