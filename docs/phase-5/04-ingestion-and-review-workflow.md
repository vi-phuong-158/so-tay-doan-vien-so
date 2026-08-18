# P5-00 Part D/G/H/I — Phân loại tài liệu, ingestion, review, versioning

> **P5-02 amendment (2026-08-18):** For Phase 5 Class B, “private file” means a private source
> through `StorageProvider`, not necessarily the Supabase bucket. Google My Drive is pilot-only;
> the frontend never receives a Drive sharing URL. Phase 4 Storage remains unaffected.

---

## 1. PART D — Phân loại tài liệu và chiến lược ingestion

Không có một chiến lược ingestion duy nhất. `documents.source_class` quyết định pipeline.

### CLASS A — Nguồn công khai chính thức trên web

*Ví dụ: quy định/thủ tục đã đăng trên cổng thông tin chính thức, có URL canonical ổn định.*

```
metadata + official_url + SNAPSHOT bắt buộc + Wiki đã duyệt + evidence chọn lọc từ snapshot
```

- **Lưu URL, và lưu cả bản chụp.** Không chỉ URL. Lý do ở `05-retrieval-source-policy.md` PART F:
  không có snapshot thì không có audit trail, và link hỏng làm câu trả lời cũ mất căn cứ.
- **Không vector hóa toàn bộ trang.** Wiki đã duyệt là đơn vị truy hồi; evidence chỉ trích những
  đoạn quy phạm (điều/khoản/thời hạn).
- **Không fetch lúc trả lời.** Fetch xảy ra ở job ingestion và ở `pg_cron` staleness check.
- Nội dung HTML phải strip `<script>/<style>/<iframe>`, chuẩn hóa về text trước khi hash — nếu không
  thì mọi thay đổi quảng cáo/CSRF token trên trang đều làm hash đổi và bắn cảnh báo giả.

### CLASS B — Tài liệu nội bộ đã được phép đưa lên

*Ví dụ: công văn, hướng dẫn, kế hoạch của Đoàn/đơn vị.*

```
file gốc private (StorageProvider) + extraction + Wiki đã duyệt + evidence chunks + vector khi cần
```

- Đường upload dùng lại **nguyên vẹn** P4-02 (`attach_document_source_file`, bucket
  `documents-private`, không có UPDATE policy, allowlist extension, 50 MiB).
- **Không truy xuất Internet khi trả lời.**
- Đây là class duy nhất mặc định sinh evidence có embedding, và chỉ sau khi Wiki được duyệt.

### CLASS C — Tài liệu tham khảo dài

*Ví dụ: sách, giáo trình, tài liệu học tập.*

```
hierarchical summary → Wiki theo chương → evidence theo mục, chunking chọn lọc
```

- Một tài liệu ⇒ **nhiều** `knowledge_wikis` (một Wiki/chương), vì một bản tóm tắt cho cả cuốn sách
  vô dụng cho truy hồi.
- Tóm tắt phân tầng: tóm tắt chương từ tóm tắt mục, không nhồi cả cuốn vào một prompt.
- **Full chunking chỉ mở khi có bằng chứng nhu cầu** (log truy vấn cho thấy câu hỏi rơi vào chương
  chưa có evidence). Mặc định là chọn lọc.
- Đây là class dễ làm nổ chi phí nhất ⇒ có hạn mức evidence/tài liệu, vượt thì cần admin duyệt.

### CLASS D — Biểu mẫu / bảng / template có cấu trúc

*Ví dụ: mẫu báo cáo, checklist, bảng phân công.*

**Không chunk theo đoạn văn.** Chunk một biểu mẫu theo paragraph tạo ra rác: nhãn trường bị tách
khỏi hướng dẫn điền, ô bảng mất ngữ cảnh hàng/cột.

```
extraction dạng: field/schema + purpose + instructions + source
```

- Trích thành `evidence_kind='FORM_FIELD'` với `locator` giữ vị trí ô/hàng.
- Wiki của Class D trả lời "biểu mẫu này dùng khi nào, ai ký, nộp cho ai, hạn nào", và **trỏ tới
  file gốc để tải** — AI không diễn giải lại nội dung ô.
- Bảng: giữ nguyên hàng làm đơn vị (`evidence_kind='TABLE_ROW'`), kèm header trong `locator`.

### CLASS E — Văn bản đã hết hiệu lực / bị thay thế

Không phải một pipeline riêng mà là một **retrieval policy**:

1. Retrieval **mặc định loại trừ** `effect_status ∈ {HET_HIEU_LUC, BI_THAY_THE}`.
2. Nếu câu hỏi khớp định danh của một văn bản đã hết hiệu lực, hệ thống **vẫn trả lời** nhưng bắt
   buộc mở đầu bằng cảnh báo hiệu lực và **nêu văn bản thay thế** (từ `document_relations`
   `REPLACED_BY`).
3. Tra cứu lịch sử có chủ đích ("công văn X trước đây quy định gì") được phép, qua cờ retrieval
   tường minh, không phải mặc định.
4. Khi một văn bản chuyển sang `BI_THAY_THE`, các `knowledge_wiki_versions` của nó **không bị xóa**
   — chuyển `SUPERSEDED`, và embedding tương ứng `is_active=false`. Câu trả lời cũ vẫn truy vết
   được về đúng bản đã dùng.

---

## 2. PART G — Trigger tự động hóa ingestion

### P5-02 job foundation

`document_sources` registration and publication/current-version reconciliation call a database
trigger in the same transaction. The trigger adds an idempotent `EXTRACT` job keyed by source, sets
only `documents.ingestion_status = 'QUEUED'`, and appends a content-free event. A service-role-only
claim RPC uses `FOR UPDATE SKIP LOCKED`, a lease and bounded attempts; expired leases are reclaimed,
and exhausted rows become terminal `FAILED`. `run-ingestion-jobs` currently completes each claimed
job with a NO_OP handler. Extraction, Google Drive calls, Gemini, Wiki creation and embeddings remain
out of scope until P5-03 after the storage runtime gate is closed.

### Các lựa chọn đã cân nhắc

| Lựa chọn | Đánh giá | Kết luận |
| --- | --- | --- |
| **Database webhook trên `documents`** | Sự kiện chính xác, độ trễ thấp, không polling. Nhưng webhook Supabase là cấu hình ngoài migration ⇒ không nằm trong git, không reproduce được bằng `supabase db reset`, CI không kiểm được. | **Không chọn làm nguồn sự kiện chính** — trái nguyên tắc "mọi thứ tái lập được từ repo" mà Phase 2–4 đã giữ. |
| **Trigger Postgres → `ingestion_jobs`** | Nằm trong migration, chạy trong CI, atomic với chính transaction tạo version. | **CHỌN.** Đây là nguồn sự kiện. |
| **`pg_cron` + `pg_net` → Edge Function** | Đã chạy thật ở P3-06/P3-08 (`email_queue_worker`, mỗi 10 phút, xác thực `x-cron-secret`, URL/secret đọc từ Vault). Mẫu đã được nghiệm thu. | **CHỌN** làm bộ chạy job và bộ staleness check. |
| **Edge Function làm ranh giới thực thi** | Đúng mẫu Phase 2–3: nơi duy nhất giữ service role + gọi dịch vụ ngoài. | **CHỌN.** |
| Storage event trên `documents-private` | Dư thừa và sai điểm tin cậy: bytes vào bucket chưa có nghĩa là nguồn chính thức; `attach_document_source_file` mới là điểm đó (đúng như residual risk P4-02 đã ghi). | Loại. |
| Worker nền / máy cá nhân | Phụ thuộc máy người dùng. | Loại (task cấm tường minh). |
| GitHub Action | Hợp cho backfill thủ công một lần, không hợp cho luồng vận hành. | Chỉ dùng cho backfill có người bấm. |
| Agent ngoài (Codex/Claude/Gemini CLI) | Chỉ hỗ trợ soạn nháp cho reviewer. Không có đường tự publish. | Hạn chế. |
| Google Apps Script | Cấm bởi quy tắc cứng #5. | Loại. |

### Luồng đã chốt

```
admin gọi RPC (tạo version / gắn file / gắn URL)
        │  cùng transaction
        ▼
trigger Postgres → INSERT ingestion_jobs(job_kind='EXTRACT', idempotency_key=...)
        │
        ▼
pg_cron (mỗi 5 phút) → pg_net → Edge Function `run-ingestion-jobs`  [x-cron-secret, như P3-08]
        │  claim theo lease (mẫu email_queue), 1 job/lần, batch nhỏ
        ▼
EXTRACT → (enqueue) ANALYZE → (enqueue) tạo knowledge_wiki_versions draft
        │
        ▼
status = AI_DRAFT_READY → PENDING_REVIEW
        │
        ╔═══ NGƯỜI DUYỆT ═══╗   ← không có đường vòng nào
        ▼
publish RPC (transaction + audit) → (enqueue) EMBED → retrieval sẵn sàng
```

Job chạy **một bước một lần** và tự enqueue bước kế. Không có job nào chạy `EXTRACT→ANALYZE→EMBED`
trong một lần invoke — đó chính là lỗi timeout §3.5 của audit.

---

## 3. PART H — Human review

### Máy trạng thái

```
        DRAFT
          │ admin gắn nguồn
          ▼
      PROCESSING ──────────────► FAILED ──────┐
          │ extract+analyze OK      ▲          │ admin sửa nguồn / retry
          ▼                         │          │
    AI_DRAFT_READY ─────────────────┘          │
          │ hệ thống chuyển ngay khi có draft  │
          ▼                                    │
     PENDING_REVIEW ◄────────────────────────┘
       │    │    │
approve│    │    │reject
       │    │    └──────────────► NEEDS_REPROCESS ──► PROCESSING
       │    │ regenerate                   ▲
       ▼    ▼                              │ nguồn đổi (staleness) / evidence bị đánh sai
    APPROVED                               │
       │ publish (RPC, transaction, audit) │
       ▼                                   │
    PUBLISHED ─────────────────────────────┘
       │ withdraw
       ▼
    WITHDRAWN
```

| Trạng thái | Ý nghĩa | Vào retrieval? |
| --- | --- | --- |
| `DRAFT` | Wiki tồn tại, chưa có nội dung | Không |
| `PROCESSING` | Job đang chạy | Không |
| `AI_DRAFT_READY` | AI đã sinh nháp, chưa ai xem | Không |
| `PENDING_REVIEW` | Đang chờ người duyệt | Không |
| `APPROVED` | Đã duyệt, chưa phát hành | Không |
| `PUBLISHED` | Đang hiệu lực | **Có** |
| `NEEDS_REPROCESS` | Nguồn đã đổi hoặc bị đánh dấu sai | **Không** — bản published cũ bị gỡ khỏi index ngay |
| `FAILED` | Job lỗi vĩnh viễn | Không |
| `WITHDRAWN` | Đã rút | Không |

**Chỉ `PUBLISHED` vào retrieval.** Đây là bất biến I1 của `02-ai-rag-architecture.md`, cưỡng chế
bằng trigger trên `knowledge_embeddings`, không bằng điều kiện trong Edge Function.

### Màn hình duyệt phải cho reviewer thấy

1. **Canonical metadata** — số ký hiệu, cơ quan, ngày ban hành/hiệu lực, trạng thái hiệu lực.
2. **Nguồn gốc** — link mở tệp gốc qua signed URL ngắn hạn (đường đã có từ P4-02), hoặc URL công
   khai + bản chụp.
3. **Wiki do AI soạn**, tách theo 8 mục, sửa được từng mục.
4. **Evidence đề xuất**, mỗi đoạn kèm `locator` (điều/khoản/trang) và nút "nhảy tới vị trí trong
   nguồn"; đánh dấu được `evidence sai`.
5. **Warnings tự động**: phát hiện mẫu prompt injection trong nội dung trích xuất; mục Wiki không có
   evidence nào chống lưng; ngày hiệu lực trong Wiki mâu thuẫn với metadata; tài liệu trích dẫn văn
   bản đã hết hiệu lực.
6. **Diff so với version trước** của cùng Wiki — reviewer duyệt cái *đã đổi*, không đọc lại từ đầu.

### Reviewer làm được

`sửa Wiki` · `approve` · `reject (kèm lý do)` · `regenerate (tạo draft mới, giữ bản cũ)` ·
`đánh dấu evidence sai (gỡ khỏi index ngay, không cần chờ republish)`.

### Ai được duyệt

`can_manage_document(documents.owner_organization_id)` — đúng hàm Phase 4 đang dùng. **Không**
`requireGlobalRole` (lỗi §3.2 của audit). Mọi transition ghi `audit_logs` với
`actor_user_id`/`before_data`/`after_data`, y như `publish_document`.

---

## 4. PART I — Versioning và vòng đời

### Bốn tình huống

| Tình huống | Xử lý |
| --- | --- |
| **Văn bản được sửa đổi** | Tạo `document_versions` mới (`supersedes_version_id` trỏ bản cũ). Wiki hiện tại → `NEEDS_REPROCESS`, bản published cũ rời index. Job sinh Wiki draft mới neo vào version mới. Người duyệt lại. |
| **Văn bản bị thay thế bởi văn bản khác** | Tạo `document_relations(cũ, mới, 'REPLACED_BY')`; `documents.effect_status='BI_THAY_THE'`. Wiki cũ → `SUPERSEDED`, embedding `is_active=false`. Câu trả lời sau đó về văn bản cũ **phải** kèm cảnh báo + trỏ văn bản mới. |
| **Hết hiệu lực (do `expiry_date`)** | `pg_cron` hằng ngày đặt `effect_status='HET_HIEU_LUC'` và hạ embedding. Không xóa gì. |
| **Upload phiên bản mới của cùng tệp** | Đường P4-02 hiện tại **không ghi đè** object (bucket không có UPDATE policy). Version mới = object mới + `document_versions` mới. Hành vi Phase 4 giữ nguyên. |
| **URL đổi nội dung** | Staleness job so `content_hash` (hoặc `ETag`/`Last-Modified`) ⇒ tạo `document_versions` mới + snapshot mới, Wiki → `NEEDS_REPROCESS`. **Không bao giờ tự sinh và tự publish Wiki mới.** |

### Bất biến versioning

- **Không ghi đè lịch sử.** Không có RPC nào UPDATE nội dung của `document_versions` hay của
  `knowledge_wiki_versions` đã `APPROVED`.
- **Câu trả lời AI cũ giữ được provenance.** `ai_message_sources` trỏ tới `wiki_version_id` /
  `evidence_id` / `document_version_id` cụ thể — không phải tới "Wiki hiện tại". Mở lại một hội thoại
  tháng trước vẫn thấy đúng căn cứ đã dùng, kể cả khi văn bản đã bị thay thế. Khi hiển thị, UI thêm
  nhãn *"căn cứ này thuộc phiên bản đã được thay thế"* nếu version không còn là bản hiện hành.
- **Xóa là hạ cấp, không phải DELETE.** Không có luồng nghiệp vụ nào xóa `document_versions`,
  `knowledge_wiki_versions` hay `knowledge_evidence`. Chỉ đổi trạng thái và `is_active`.
