# P5-00 Part C — Kiến trúc AI/RAG mục tiêu

> **P5-02 amendment (2026-08-18):** Layer 1 source bytes are provider-neutral. During the pilot,
> Google My Drive is the external blob provider; it is not a database, authorization source,
> metadata store or public-link delivery path. Phase 4 `documents-private` remains accepted and
> unchanged for its own document flow.

> Tài liệu kiến trúc. Không có code runtime nào được viết để tạo ra nó.
> Thay thế mô hình `upload → extract → chunk toàn bộ → embed toàn bộ → pgvector` trong
> `docs/01-product-spec.md`.

---

## 1. Vì sao đổi

Mô hình cũ tối ưu cho *"có nhiều vector"*. Mục tiêu thật của Phase 5 là:

```
AI trả lời đúng + có nguồn + đúng phạm vi quyền + dễ kiểm duyệt + dễ cập nhật + chi phí hợp lý + truy vết được
```

Chunk-everything hỏng ở bốn điểm trong bối cảnh dự án này:

1. **Kiểm duyệt.** Nghiệp vụ Đoàn/Công an không chấp nhận AI trích một đoạn văn không ai đọc lại.
   Duyệt 400 chunk/tài liệu là bất khả thi; duyệt 1 bản Wiki 2 trang là việc bình thường của một
   cán bộ nội dung. `docs/brain/03-decisions.md` đã chốt *"AI chỉ dùng chunk APPROVED"* từ
   2026-07-30 — mô hình cũ khiến chính quyết định đó không thể thực thi.
2. **Hiệu lực văn bản.** Một chunk không biết nó thuộc văn bản đã hết hiệu lực. Vector search sẽ
   vui vẻ trả về đoạn văn của công văn đã bị thay thế vì nó "giống câu hỏi nhất". Đây là kiểu sai
   nguy hiểm nhất với người dùng của dự án này.
3. **Câu hỏi định danh.** Phần lớn câu hỏi thật có dạng *"Công văn 123 quy định gì?"*,
   *"Hướng dẫn số bao nhiêu về sinh hoạt chi đoàn?"*. Đây là truy vấn structured, Postgres trả lời
   chính xác trong 1ms. Đưa qua vector search là biến câu trả lời đúng thành câu trả lời gần đúng.
4. **Chi phí và độ trôi.** Mỗi lần đổi embedding model là re-embed toàn bộ kho. Với Wiki-first,
   tập cần re-embed nhỏ hơn 1–2 bậc độ lớn (xem `07-phase-5-implementation-plan.md` §cost).

---

## 2. Pipeline đã chốt

```
                        ┌─────────────────────────────────────┐
                        │  LAYER 1 — CANONICAL SOURCE         │
                        │  documents + document_versions      │
                        │  + document_sources (URL/snapshot)  │
                        │  SOURCE OF TRUTH — AI không sửa     │
                        └──────────────┬──────────────────────┘
                                       │  (1) đăng ký / gắn tệp / gắn URL
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  (2) VALIDATION + CLASSIFICATION    │
                        │  metadata bắt buộc, MIME/size,      │
                        │  gán class A/B/C/D/E                │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  (3) EXTRACTION + HASHING           │  ← async, idempotent theo content_hash
                        │  text/section tree, sanitize,       │
                        │  đánh dấu UNTRUSTED                 │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  (4) AI STRUCTURED ANALYSIS         │  ← async, retry, ghi provider/model/prompt_version
                        │  sinh Wiki draft + đề xuất evidence │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  LAYER 2 — KNOWLEDGE WIKI (draft)   │
                        │  knowledge_wikis + _versions        │
                        │  status = AI_DRAFT_READY            │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ╔═════════════════════════════════════╗
                        ║  (5) HUMAN REVIEW GATE — BẮT BUỘC   ║  ← đồng bộ, do người, không AI
                        ║  sửa / approve / reject / regenerate║
                        ╚══════════════┬══════════════════════╝
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  (6) PUBLISH KNOWLEDGE              │  ← đồng bộ, transaction, audit
                        │  wiki_version → PUBLISHED           │
                        │  evidence đã chọn → APPROVED        │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  LAYER 3 — EVIDENCE + INDEX         │  ← async, chỉ chạy sau (6)
                        │  knowledge_evidence (trích đoạn)    │
                        │  knowledge_embeddings (chọn lọc)    │
                        └──────────────┬──────────────────────┘
                                       ▼
                        ┌─────────────────────────────────────┐
                        │  (7) HYBRID RETRIEVAL → ANSWER      │
                        │  RLS trước, vector sau, luôn có nguồn│
                        └─────────────────────────────────────┘
```

### Bất biến của pipeline

| # | Bất biến | Cưỡng chế ở đâu |
| --- | --- | --- |
| I1 | Không embedding nào tồn tại cho nội dung chưa `PUBLISHED` | Bước (7) chỉ đọc từ `knowledge_embeddings`; job sinh embedding chỉ được kích hoạt bởi transition sang `PUBLISHED` |
| I2 | AI không bao giờ tự chuyển sang `APPROVED`/`PUBLISHED` | Transition RPC yêu cầu `auth.uid()` là người có quyền; job chạy bằng service role bị chặn tường minh |
| I3 | Nội dung AI sinh không ghi đè canonical source | `knowledge_*` là bảng khác; không có đường nào từ pipeline ghi vào `documents` ngoài cột trạng thái ingestion riêng |
| I4 | Mọi câu trả lời production có ít nhất 1 nguồn, hoặc là câu từ chối | Kiểm ở tầng Edge Function trước khi ghi `ai_messages`; không có nguồn ⇒ ghi `refusal_reason`, không gọi model sinh |
| I5 | Phân quyền chạy trong Postgres, trước khi context rời Supabase | Retrieval qua hàm `security definer`; Edge Function không bao giờ tự query bảng nội dung bằng service role để lấy context |
| I6 | Nội dung trích xuất luôn là dữ liệu, không bao giờ là chỉ thị | Delimiter + phân tầng chỉ thị + sanitize; xem `06-security-threat-model.md` |

### Bước nào đồng bộ / bất đồng bộ / retry / idempotent / do AI / bắt buộc người

| Bước | Sync/Async | Retry | Idempotent | Tác nhân |
| --- | --- | --- | --- | --- |
| (1) Đăng ký nguồn | **Sync** (RPC) | không | có (theo `document_id` + `content_hash`) | Người (admin) |
| (2) Validation + classification | **Sync** (trong cùng RPC) | không | có | Hệ thống; class mặc định do rule, admin sửa được |
| (3) Extraction + hashing | **Async** (job) | có, backoff, `max_attempts` | **Có** — key = `(document_version_id, extractor_version)`; chạy lại cho cùng kết quả | Hệ thống |
| (4) AI analysis → Wiki draft | **Async** (job) | có | **Có** — key = `(document_version_id, prompt_version, model)`; chạy lại tạo *bản nháp mới*, không ghi đè bản đã có người sửa | **AI** |
| (5) Human review | **Sync** (UI + RPC) | n/a | n/a | **BẮT BUỘC NGƯỜI** |
| (6) Publish knowledge | **Sync** (RPC, transaction, audit) | không | có (publish lại cùng version = no-op) | Người |
| (7a) Sinh embedding | **Async** (job) | có | **Có** — key = `(wiki_version_id \| evidence_id, embedding_model)` | Hệ thống |
| (7b) Retrieval + answer | **Sync** (request) | không (fail nhanh) | n/a | Hệ thống + AI |
| Staleness re-check | **Async** (`pg_cron`) | có | có | Hệ thống; chỉ **hạ cấp** trạng thái, không bao giờ tự publish |

---

## 3. Ba lớp tri thức

### Layer 1 — Canonical Source

Nguồn chính thức, bất biến. Gồm bản ghi tài liệu (`documents`), **phiên bản** của nó
(`document_versions`: checksum, tệp qua provider private hoặc URL công khai + snapshot), và quan hệ
với văn bản khác (`document_relations` được siết thành enum).

Nguyên tắc: **AI-generated content không bao giờ thay thế canonical source.** Khi người dùng hỏi
"cái này lấy từ đâu", câu trả lời phải dẫn tới đúng một `document_version_id`, và từ đó tới tệp gốc
hoặc URL gốc + bản chụp tại thời điểm đọc.

### Layer 2 — Knowledge Wiki

Bản diễn giải có cấu trúc, do AI soạn, **do người duyệt**. Đây là **đơn vị truy hồi chính**.

Cấu trúc nội dung (lưu dạng JSONB có schema, không phải markdown tự do — để render nhất quán và để
diff giữa các version có nghĩa):

```
tên văn bản · số ký hiệu · cơ quan ban hành · ngày hiệu lực · trạng thái hiệu lực
tóm tắt 5–10 dòng
nội dung chính:
  1. đối tượng áp dụng      5. biểu mẫu
  2. các yêu cầu chính      6. trách nhiệm
  3. trình tự/thủ tục       7. điểm cần lưu ý
  4. thời hạn               8. thay đổi so với văn bản trước
câu hỏi thường gặp · văn bản liên quan · nguồn
```

Mỗi mục mang `evidence_refs[]` — trỏ tới các `knowledge_evidence` chứng minh cho mục đó. Reviewer
duyệt được từng mục, và câu trả lời cuối trích dẫn được ở mức mục, không phải mức cả bản Wiki.

Wiki **có** provenance, **có** version, **có** review status, và **phải** được duyệt trước khi vào
retrieval index production.

### Layer 3 — Evidence

Trích đoạn nguyên văn được chọn có chủ đích, để: dẫn chứng · kiểm tra câu trả lời · trả lời câu hỏi
chi tiết ("khoản 2 điều 5 nói gì") · đối chiếu với bản gốc.

Evidence **không** là "mọi đoạn của mọi tài liệu". Tiêu chí chọn ở §4 của
`05-retrieval-source-policy.md` (quyết định D4).

### Embeddings

Là **chỉ mục thứ cấp** trên Layer 2 và Layer 3, không phải một lớp tri thức. Lưu ở bảng riêng có
`embedding_model` + `embedding_dimension` + `prompt_version` để đổi model không phải đổi schema.
Một đơn vị tri thức có thể có 0, 1 hay N embedding (N khi chạy song song hai model trong lúc
migrate).

---

## 4. Điều Phase 5 KHÔNG làm

- Không fetch Internet lúc trả lời (xem `05-retrieval-source-policy.md` §PART F).
- Không gửi tài liệu `RESTRICTED` cho provider ngoài mà không có quyết định riêng bằng văn bản.
- Không dùng vector search cho truy vấn Postgres làm tốt hơn (số hiệu, năm, cơ quan, loại, hiệu lực).
- Không tái sinh Wiki tự động rồi tự publish khi nguồn đổi — chỉ hạ cấp về `NEEDS_REPROCESS`.
- Không thêm Pinecone, không thêm Google Apps Script, không crawl không kiểm soát.
