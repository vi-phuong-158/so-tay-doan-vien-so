# P5-01 — Knowledge schema + RLS (implementation report)

> **Trạng thái:** `P5_01_PASS` (technical acceptance, chưa production).
> **Migration:** `supabase/migrations/202608170001_phase_5_knowledge_foundation.sql`
> **Test:** `supabase/tests/knowledge_foundation.sql` — 101 assertion.
> **Không** gọi AI provider, **không** sinh embedding, **không** deploy, **không** chạm production.

---

## 1. Phạm vi

Hiện thực tầng dữ liệu + RLS cho kiến trúc đã chốt ở P5-00:

```
Canonical Source  →  Reviewed Wiki  →  Selective Evidence  →  (chỉ mục thứ cấp) Embeddings
```

Không làm: extraction, gọi Gemini, sinh embedding, sinh Wiki, retrieval ranking, ask-ai, UI.
Đó là P5-02 → P5-07.

---

## 2. Schema đã tạo

### 2.1 Bảng mới

| Bảng | Vai trò | Ghi chú then chốt |
| --- | --- | --- |
| `document_versions` | Lịch sử phiên bản nguồn, **bất biến** | `unique(document_id, version_number)`; partial unique index `uq_document_versions_current` đảm bảo **đúng một** bản hiện hành/tài liệu, do DB cưỡng chế chứ không do code |
| `document_sources` | Locator provenance của một version | CHECK theo `source_kind`: `STORAGE_FILE` phải có `storage_path`; `URL_SNAPSHOT` phải có **cả** URL **và** `snapshot_storage_path` — snapshot là bắt buộc cho Class A (D5/D6) |
| `knowledge_wikis` | Danh tính Wiki | Partial unique: một Wiki/tài liệu, **trừ** khi có `chapter_key` (Class C sách/giáo trình chia chương) |
| `knowledge_wiki_versions` | Nội dung Wiki có version, **bất biến sau khi duyệt** | `document_version_id NOT NULL` — mắt xích provenance quan trọng nhất; CHECK: `APPROVED`/`SUPERSEDED` bắt buộc có `reviewed_by` + `reviewed_at` |
| `knowledge_embeddings` | Chỉ mục vector, tách khỏi nội dung | `embedding_model` + `embedding_dimension` + `provider`; cột `vector` **không cố định chiều** ở mức bảng |
| `ingestion_jobs` | Nền tảng job | Sao hình dạng `email_queue` (đã qua rehearsal thật P3-02/P3-08): status + attempt_count + `idempotency_key unique` + lease |
| `ingestion_events` | Vết vận hành, **append-only** | Trigger chặn UPDATE/DELETE |
| `ai_usage_quota` | Quota AI | `docs/brain/01-architecture.md` mô tả quota từ lâu nhưng chưa có bảng nào |

### 2.2 Cột thêm vào `documents`

`source_class` (CHECK 5 class A–E) · `ingestion_status` (CHECK 7 giá trị) · `retrieval_enabled`
(công tắc chặn cứng) · `effect_state` (CHECK 5 giá trị) · `current_version_id`.

### 2.3 Index

18 index, mỗi cái gắn với một truy vấn cụ thể: tra version theo tài liệu, tra theo checksum, hàng
đợi duyệt (`where review_status = 'PENDING_REVIEW'`), evidence đã duyệt, claim job
(`where status = 'PENDING'`), provenance theo message.

**Cố ý chưa tạo index vector.** P5-00 PART M yêu cầu chọn ivfflat/HNSW từ cardinality đo được;
index sai tham số làm giảm recall một cách âm thầm. Thuộc P5-05.

---

## 3. Tách trục trạng thái — điều kiện nghiệm thu then chốt

`documents.status` là **state machine xuất bản của Phase 4** và đã được nghiệm thu.
`documents.ingestion_status` là **trục Phase 5**, hoàn toàn tách biệt.

Đây là chỗ legacy `process-document` sai (audit §3.4): nó ghi thẳng `documents.status = 'PROCESSING'`
rồi `'PENDING_REVIEW'`, nên một tài liệu đang `PUBLISHED` bị kéo ngược về `PENDING_REVIEW` và **biến
mất khỏi mọi người dùng cuối** (vì `can_access_document` yêu cầu `status='PUBLISHED'`), im lặng,
không audit.

Cưỡng chế bằng trigger `trg_documents_state_axis_separation`: nếu `ingestion_status` hoặc
`retrieval_enabled` đổi **cùng statement** với `status`, raise exception. Không phải quy ước — là
ràng buộc.

Test: `E` trong `knowledge_foundation.sql` — ingestion `FAILED` xong, `documents.status` vẫn
`PUBLISHED`.

---

## 4. Refactor schema cũ (PART L)

### 4.1 `document_chunks` → selective evidence

| | Cũ | Mới |
| --- | --- | --- |
| Ý nghĩa | Chunk toàn văn theo `chunk_index` liên tục | Trích đoạn **chọn lọc** có chủ đích |
| Neo | `document_id` | thêm `document_version_id` (+ `wiki_version_id` tùy chọn) |
| Ý định | không có | `evidence_kind`, `selected_by`, `selected_reason`, `locator` |
| Vị trí | `section_path`, `page_from/to` | thêm `locator jsonb` = `{dieu, khoan, diem, page, paragraph}` |
| Duyệt | `review_status` | thêm `approved_by`, `approved_at` |
| `visibility_level` | có, **không policy nào đọc** | **ĐÃ XÓA** |
| Unique | `(document_id, content_hash)` | `(document_version_id, content_hash, evidence_kind)` partial |
| `chunk_index` | NOT NULL | nullable |

**Chọn phương án A (tiến hóa tại chỗ), không tạo bảng mới.** Bảng đang 0 hàng nên không có dữ liệu
phải migrate, và tạo bảng song song sẽ để lại một bảng chết mà agent sau tưởng là schema sống.

**Xóa `visibility_level`:** cột này trông như biện pháp bảo mật nhưng không policy/hàm nào đọc nó
(audit §3.8). Một cột như vậy tệ hơn không có, vì người đọc sau sẽ tin chunk được phân quyền riêng.
Quyền suy ra từ tài liệu gốc, hết. An toàn để xóa: không test/service/policy nào tham chiếu.

**Giữ lại `embedding` và `match_document_chunks()` — deviation có chủ ý so với D1.**
`supabase/tests/rls_acceptance.sql` (coverage đã nghiệm thu từ Phase 1/4) insert
`(id, document_id, chunk_index, content, content_hash, embedding, review_status)` và gọi
`match_document_chunks()` ở assertion 16/17. Xóa cột/hàm bây giờ sẽ **phá test đã nghiệm thu** —
`CLAUDE.md` quy tắc cứng #7 cấm bỏ kiểm thử cũ để làm migration pass. Cả hai được đánh dấu
DEPRECATED bằng `COMMENT ON`, và **P5-05 xóa chúng cùng bản cập nhật test** khi retrieval mới thay thế.

`document_chunks_approved_provenance_check` cũng chỉ áp cho evidence **có** `document_version_id`,
vì hàng legacy không có neo đó. P5-05 đặt `document_version_id NOT NULL` và ràng buộc thành phổ quát.

### 4.2 `ai_message_sources` — sửa PK

| | Cũ | Mới |
| --- | --- | --- |
| PK | `(message_id, document_id, chunk_id)` với `chunk_id` **nullable** | `id uuid` surrogate |
| Hệ quả | Postgres cấm NULL trong PK ⇒ **mọi citation bắt buộc có `chunk_id`** ⇒ không trích dẫn được ở mức Wiki hay mức tài liệu | trích dẫn được document / document_version / wiki_version / evidence |
| Thêm | — | `document_version_id`, `wiki_version_id`, `source_kind` (4 hạng nguồn của PART E) |
| Unique | — | `(message_id, rank)` |

**Một bẫy đã bị test bắt:** `drop constraint ..._pkey` **không** gỡ `NOT NULL` mà Postgres đã ngầm
đặt cho các cột PK. Nếu không có
`alter column chunk_id drop not null` (và `document_id`), bản sửa chỉ là hình thức và defect vẫn
nguyên. Đây chính là loại lỗi mà test viết trước khi tin migration sẽ phát hiện.

### 4.3 `ai_messages`

Thêm `provider`, `prompt_version`, `retrieval_strategy` (CHECK 7 giá trị), `refusal_reason`,
`source_count` — phục vụ PART O/P.

---

## 5. RLS

**Nguyên tắc: không dựng mô hình phân quyền thứ hai.** Mọi bảng tri thức suy quyền từ
`can_access_document(document_id)` — hàm fail-closed đã được Phase 4 nghiệm thu.

Helper mới duy nhất: `public.can_manage_document_knowledge(p_document_id uuid)` —
`SECURITY DEFINER`, `set search_path = public`, `revoke all from public, anon`.
Nó nhận **document id, không phải organization id**, nên người gọi không thể tự chọn phạm vi được
kiểm — đúng chỗ legacy `process-document` leo thang quyền (audit §3.2).

| Bảng | Người dùng cuối đọc được khi | Curator |
| --- | --- | --- |
| `document_versions` / `document_sources` | `can_access_document()` | thấy cả bản chưa publish |
| `knowledge_wikis` | `can_access_document()` **và** `status='PUBLISHED'` **và** `current_published_version_id is not null` | thấy hết |
| `knowledge_wiki_versions` | như trên **và** `review_status='APPROVED'` **và** `published_at is not null` | thấy hết |
| `document_chunks` | `can_access_document()` **và** `review_status='APPROVED'` | quản lý được |
| `knowledge_embeddings` | **không ai** — RLS bật, **không có policy permissive nào** | service_role only |
| `ingestion_jobs` / `ingestion_events` | chỉ curator trong scope | |
| `ai_usage_quota` | `user_id = auth.uid()` **và** `is_active_user()` | |

Policy đọc cũ của Phase 1 trên `document_chunks` (`content admins read/manage chunks`) được thay
bằng thang visibility đầy đủ + cổng `APPROVED` mà `docs/brain/03-decisions.md` [2026-07-30] đã yêu cầu.

### Vì sao embeddings không có policy nào

Retrieval sẽ chạy qua hàm `SECURITY DEFINER` ở P5-05, hàm này giải quyết quyền **trước** khi xếp
hạng. Client không bao giờ nằm trong đường đó. RLS bật + 0 policy + 0 grant = từ chối bằng cấu trúc,
không phải bằng lọc sau khi đã lấy dữ liệu.

`knowledge_embeddings.document_id` được denormalize **có chủ đích**: nó cho phép thu hẹp ứng viên
theo quyền **trước** toán tử xếp hạng, thay vì xếp hạng toàn cục rồi lọc — sửa đúng lỗi recall
audit §3.7 và giữ nguyên tắc "authorization trước retrieval".

---

## 6. Grants (PART G)

| Hành động | Đối tượng | Vì sao |
| --- | --- | --- |
| `REVOKE ALL ... FROM public, anon, authenticated` | cả 8 bảng mới | Mặc định là không có gì. Grant rộng + policy chỉ cách rò rỉ một lần sửa nhầm, và nó mô tả sai ý định cho người đọc sau. |
| `GRANT SELECT ... TO authenticated` | 7/8 bảng mới | Ghi đi qua trusted RPC ở P5-02/P5-04, không bao giờ từ browser. |
| **Không grant gì** | `knowledge_embeddings` | Chỉ trusted retrieval. |
| `GRANT ALL ... TO service_role` | cả 8 | Backend boundary. |
| `REVOKE INSERT, UPDATE, DELETE` | `document_chunks`, `ai_messages`, `ai_message_sources` | **Over-grant từ `202607300001`**, suốt từ đó tới nay chỉ được RLS chặn. Evidence và citation là bản ghi do server tạo; client ghi được nghĩa là client bịa được nội dung một văn bản chính thức, hoặc giả mạo một câu trả lời của trợ lý. |
| **Giữ nguyên** | `ai_conversations`, `ai_feedback` | Đây là dữ liệu của chính người dùng (đổi tên/xóa hội thoại của mình, chấm điểm câu trả lời) và policy `user_id = auth.uid()` đã đúng. Gỡ đi là bỏ một khả năng thật mà không có gì thay thế — cùng lập luận P4-02 đã ghi cho `document_relations`. |

---

## 7. Bất biến (PART E)

| Thực thể | Cưỡng chế | Cho phép |
| --- | --- | --- |
| `document_versions` | trigger chặn sửa `content_hash`, `version_number`, `source_metadata`, `mime_type`, `byte_size`, `supersedes_version_id`, `created_by/at` | vẫn sửa được metadata vòng đời (`effective_to`, `is_current`) |
| `document_versions` (xóa) | trigger chặn DELETE nếu có Wiki version hoặc citation lịch sử tham chiếu | |
| `knowledge_wiki_versions` | khi `APPROVED`/`SUPERSEDED`: chặn sửa `content`, `summary`, `document_version_id`, provider/model/prompt, `reviewed_by`; **chặn mở lại** (`APPROVED` chỉ được tiến tới `SUPERSEDED`) | |
| `knowledge_wiki_versions` (xóa) | chặn DELETE nếu đã bị một câu trả lời trích dẫn | |
| `document_chunks` | khi `APPROVED`: chặn sửa `content`, `content_hash`, `locator`, `document_version_id`, `evidence_kind` | |
| `ingestion_events` | append-only (chặn cả UPDATE lẫn DELETE) | |

Cùng triết lý "không ghi đè phiên bản báo cáo đã nộp" đã chạy tốt từ Phase 2: một bản ghi đã được
chấp nhận là **chứng cứ**, và chứng cứ sửa được tại chỗ thì không còn là chứng cứ.

Ngoài ra `trg_knowledge_embeddings_publication_gate` (bất biến I1): không hàng embedding nào tồn tại
được cho nội dung chưa `PUBLISHED`/`APPROVED`, hoặc cho tài liệu có `retrieval_enabled = false`.
Cổng duyệt nằm ở **database**, nên không worker nào — dù viết thế nào — index được nội dung chưa duyệt.

---

## 8. Deviation so với P5-00 (ghi nhận tường minh)

| P5-00 nói | P5-01 làm | Lý do |
| --- | --- | --- |
| D1: bỏ `embedding` khỏi `document_chunks` | **Giữ, đánh dấu DEPRECATED**, xóa ở P5-05 | `rls_acceptance.sql` (đã nghiệm thu) dùng cột này và `match_document_chunks()`. Xóa bây giờ = phá test cũ, vi phạm quy tắc cứng #7. |
| `03-knowledge-data-model.md` §3.1: siết CHECK cho `effect_status` | **Không siết.** Thêm cột mới `effect_state` có CHECK | `effect_status` là **free text** do UI admin P4-02 ghi thẳng (`AdminDocuments.jsx` render `<input>` trơn; `documentDisplay.mjs` phân loại bằng so khớp chuỗi tiếng Việt). Siết CHECK sẽ phá hành vi Phase 4 đã nghiệm thu — bị cấm bởi STRICT NON-GOALS. |
| `03-...` §5.1: đổi tên `document_chunks` → `knowledge_evidence` | **Giữ tên**, đổi ngữ nghĩa + `COMMENT ON` | Đổi tên kéo theo `match_document_chunks` và test đã nghiệm thu. Gộp vào P5-05 cùng lần xóa legacy để chỉ có **một** lần đổi vỡ, thay vì hai. |

Không quyết định nào của P5-00 bị đảo ngược; ba mục trên là **hoãn có điều kiện**, đều gắn với P5-05.

---

## 9. Legacy Edge Functions — đề xuất đánh dấu (chỉ đề xuất, chưa thực hiện)

`supabase/functions/ask-ai` và `process-document` **không** được deploy, cấu hình, gọi hay mở rộng
trong P5-01. Schema này được thiết kế cho bản **thay thế** chúng: không bảng tri thức nào có đường
ghi từ client, và không đường nào cho phép trạng thái ingestion chạm `documents.status`.

Cách đánh dấu an toàn, không đổi hành vi runtime (đề xuất cho P5-06, chưa làm ở đây):

1. Thêm `supabase/functions/ask-ai/LEGACY_DO_NOT_DEPLOY.md` và tương tự cho `process-document`,
   trỏ tới `docs/phase-5/01-existing-work-audit.md` §3.
2. Trong `supabase/config.toml`, khai báo `[functions.ask-ai] enabled = false` và
   `[functions.process-document] enabled = false` — Supabase CLI bỏ qua khi deploy, không ảnh hưởng
   file nguồn hay CI type-check.

Cả hai đều **không** đổi hành vi runtime hiện tại (không gì gọi chúng, không `GEMINI_*` nào được
cấu hình). Thực hiện ở P5-06 cùng bản viết lại, để repo không có khoảng thời gian mất chức năng mà
chưa có thay thế.

---

## 10. Rủi ro còn lại

1. **`document_chunks` mang hai ngữ nghĩa** cho tới P5-05: cột `embedding` cũ (deprecated) song song
   với `knowledge_embeddings`. Đã giảm thiểu bằng `COMMENT ON` rõ ràng và ghi vào Code Graph, nhưng
   vẫn là bẫy nhận thức cho tới khi xóa.
2. **Chưa có RPC ghi** — P5-01 cố ý chỉ mở đường đọc. Cho tới P5-02/P5-04, mọi thao tác curate phải
   qua `service_role`, tức là qua backend, chưa có UI.
3. **Chưa có index vector.** Đúng chủ đích, nhưng nghĩa là chưa đo được hiệu năng retrieval.
4. **`ai_conversations`/`ai_feedback` vẫn cho client ghi trực tiếp.** Có chủ đích (dữ liệu của chính
   người dùng, RLS đúng), nhưng khi P5-06 viết lại `ask-ai` cần rà lại xem hội thoại có nên chuyển
   hẳn sang server-tạo hay không.
5. **`effect_state` chưa có gì ghi vào.** Nó tồn tại cho retrieval Class E ở P5-05; tới lúc đó cần
   quyết định ai/khi nào điền (thủ công lúc duyệt, hay suy ra từ `expiry_date` bằng cron).
