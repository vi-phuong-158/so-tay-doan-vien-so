# P5-00 Part D/E/F/M — Retrieval, source policy, chiến lược nguồn công khai

---

## 1. PART D — Kiến trúc retrieval

**Vector search không phải bước đầu tiên.** Nó là bước cuối cùng, và thường không cần tới.

```
Câu hỏi
   │
   ▼
(0) AUTHORIZATION SCOPE  ── luôn chạy đầu tiên, trong Postgres
   │   tính tập document_id mà auth.uid() được đọc
   │   MỌI bước sau đều bị giới hạn trong tập này
   ▼
(1) INTENT CLASSIFICATION  ── rule trước, model sau
   │   ├─ có số hiệu văn bản?      → EXACT_ID
   │   ├─ có "điều/khoản/mục N"?   → SECTION_LOOKUP
   │   ├─ có tên cơ quan/năm/loại? → METADATA_FILTER
   │   └─ còn lại                  → SEMANTIC
   ▼
(2) EXACT / METADATA SEARCH  (Postgres: trigram + btree + tsvector)
   │   đủ tự tin? ──── có ──────────────┐
   ▼ không                              │
(3) WIKI SEARCH                         │
   │   full-text (tsvector) ∪ vector trên knowledge_embeddings(WIKI_*)
   │   đủ? ──── có ─────────────────────┤
   ▼ không                              │
(4) EVIDENCE SEARCH                     │
   │   vector trên knowledge_embeddings(EVIDENCE), giới hạn trong
   │   tài liệu đã lọt qua (2)/(3) — không quét toàn kho
   ▼                                    │
(5) SOURCE VALIDATION ◄─────────────────┘
   │   hiệu lực, phiên bản, khớp câu hỏi, ngưỡng similarity
   │   không đủ căn cứ → TỪ CHỐI (không gọi model sinh)
   ▼
(6) ANSWER GENERATION  ── context đã được lọc quyền từ bước (0)
```

### Ví dụ

| Câu hỏi | Chiến lược | Vì sao |
| --- | --- | --- |
| *"Công văn 123 quy định gì?"* | `EXACT_ID` — `documents.document_number` (trigram, chịu được `123/CV-ĐTN` vs `123`) | Vector search sẽ trả về công văn 132, 213, hoặc công văn khác "nghe giống". Sai kiểu tệ nhất. |
| *"Nội dung khoản 2 điều 5?"* | `SECTION_LOOKUP` — `knowledge_evidence.locator @> '{"dieu":5,"khoan":2}'` | Trích đúng điều/khoản là truy vấn structured. Chỉ rơi về vector khi chưa có evidence nào cho điều đó. |
| *"Quy định về thời hạn nộp báo cáo?"* | `SEMANTIC` → Wiki → evidence | Không có định danh; đây mới là chỗ vector đáng tiền. Wiki khớp trước (mục "thời hạn"), evidence trích câu quy phạm chính xác. |
| *"Hướng dẫn nào của Tỉnh đoàn năm 2026 về sinh hoạt chi đoàn?"* | `METADATA_FILTER` + `SEMANTIC` trong tập đã lọc | `issuing_authority` + `issued_date` là cột Postgres. Lọc trước, vector sau trên vài chục hàng thay vì toàn kho. |

---

## 2. PART M — Thiết kế search

**Không dùng vector cho việc Postgres làm tốt hơn.** Phân công:

| Loại truy vấn | Công cụ | Lý do |
| --- | --- | --- |
| Số hiệu văn bản | `pg_trgm` GIN trên `document_number` | Người dùng gõ thiếu/thừa dấu, sai định dạng; trigram chịu được, vector thì không hiểu số. |
| Năm, ngày hiệu lực, hạn | btree trên `issued_date`/`effective_date`/`expiry_date` | Chính xác tuyệt đối, gần như miễn phí. |
| Cơ quan ban hành, loại văn bản, trạng thái hiệu lực | btree/enum + tsvector | Structured. |
| Từ khóa tiếng Việt trong tiêu đề/tóm tắt | `tsvector` với config `simple` + `unaccent` | Postgres không có dictionary tiếng Việt; `simple`+unaccent cho kết quả tốt với từ khóa, và **miễn phí** so với embedding. |
| Ý nghĩa/diễn đạt khác nhau | `pgvector` trên `knowledge_embeddings` | Đây là việc duy nhất vector làm tốt hơn hẳn. |

Xếp hạng hợp nhất: điểm cuối = tổ hợp có trọng số của (khớp định danh) · (khớp metadata) ·
(rank tsvector) · (cosine similarity) · (độ tươi hiệu lực). Trọng số cấu hình được, ghi vào
`ai_messages.retrieval_strategy` để đánh giá lại sau.

### Chỉ mục vector

Cardinality dự kiến với mô hình Wiki-first: cỡ 10²–10³ vector cho giai đoạn đầu, 10⁴ khi kho lớn.
`idx_document_chunks_embedding` hiện tại là `ivfflat lists=100` — chỉnh cho ~100k vector, ở quy mô
này sẽ giảm recall rõ rệt. P5-05 chọn lại: dưới ~5k vector thì **không index** (quét tuần tự nhanh
và chính xác 100%); trên ngưỡng đó dùng HNSW. Quyết định dựa trên số đo thật, không đoán trước.

---

## 3. PART E — Source policy

Mọi câu trả lời production phân biệt rõ bốn hạng nguồn, và **hiển thị nhãn cho người dùng**:

| Hạng | Nghĩa | Hiển thị |
| --- | --- | --- |
| `OFFICIAL_SOURCE` | Tệp/URL gốc chính thức | *"Văn bản gốc"* + link tải (signed URL ngắn hạn) hoặc URL chính thức |
| `REVIEWED_WIKI` | Bản Wiki đã được người có quyền duyệt | *"Đã được [tên] duyệt ngày [ngày]"* |
| `EVIDENCE_EXCERPT` | Trích đoạn nguyên văn từ nguồn | Trích dẫn nguyên văn + vị trí (điều/khoản/trang) |
| `AI_SYNTHESIS` | Phần AI tự diễn giải/tổng hợp | *"Nội dung do AI tổng hợp — cần đối chiếu văn bản gốc"* |

### Bất biến

1. **Mọi câu trả lời production phải có source references.** Không có nguồn ⇒ không phải câu trả
   lời.
2. **Không đủ căn cứ thì không được bịa.** Hành vi bắt buộc:

   > Chưa tìm thấy đủ căn cứ trong kho tri thức để trả lời chính xác.

   Kèm gợi ý: từ khóa đã thử, phạm vi đã tìm, và đường liên hệ cán bộ phụ trách.
3. **Từ chối được thực thi ở tầng ứng dụng, không phải bằng prompt.** Nếu bước (5) không trả về
   nguồn nào vượt ngưỡng, Edge Function trả câu từ chối và ghi `ai_messages.refusal_reason` —
   **không gọi model sinh**. Đây là khác biệt then chốt: một model được "dặn" đừng bịa vẫn bịa;
   một code path không có context thì không có gì để bịa.
4. **AI_SYNTHESIS không được trình bày như quy định.** Prompt và post-processing đều cấm dùng giọng
   quy phạm ("phải", "bắt buộc") cho phần không có evidence chống lưng.
5. **Văn bản hết hiệu lực luôn kèm cảnh báo** và tên văn bản thay thế (§CLASS E).

---

## 4. PART F — Chiến lược cho nguồn công khai

### Ba lựa chọn

#### Option A — chỉ lưu URL, fetch lúc trả lời

| Tiêu chí | Đánh giá |
| --- | --- |
| Độ tin cậy | **Kém** — trang chết/đổi/timeout thì câu trả lời hỏng ngay tại thời điểm người dùng cần |
| Độ trễ | **Kém** — cộng 0.5–5s vào mỗi câu hỏi, và không kiểm soát được |
| Link hỏng | Không phát hiện được cho tới khi người dùng gặp lỗi |
| Nội dung đổi | Câu trả lời hôm nay khác hôm qua mà không ai biết vì sao |
| **Prompt injection** | **Không chấp nhận được** — nội dung web chưa ai duyệt đi thẳng vào prompt. Bên thứ ba (hoặc kẻ chiếm được website) điều khiển được đầu vào của model theo thời gian thực |
| Website bị chiếm | Trở thành đường tấn công trực tiếp vào hệ thống, không có bước người ở giữa |
| Provenance / audit | **Không có** — không chứng minh được nội dung tại thời điểm trả lời |
| Cache | Có thể thêm, nhưng khi đã cache thì đã là Option B làm dối |

#### Option B — URL + Wiki đã duyệt (cached) + evidence chọn lọc

| Tiêu chí | Đánh giá |
| --- | --- |
| Độ tin cậy | **Tốt** — trả lời từ dữ liệu trong Supabase, không phụ thuộc mạng ngoài lúc chạy |
| Độ trễ | **Tốt** — không có network hop ngoài |
| Link hỏng | Phát hiện bởi job định kỳ, không phải bởi người dùng |
| Nội dung đổi | Phát hiện bởi hash/ETag ⇒ `NEEDS_REPROCESS` ⇒ người duyệt lại |
| Prompt injection | **Giảm mạnh** — có bước người duyệt giữa nội dung ngoài và câu trả lời |
| Provenance | **Mạnh** — snapshot + hash + người duyệt + thời điểm |
| Nhược | Có độ trễ cập nhật bằng chu kỳ check + thời gian duyệt |

#### Option C — định kỳ fetch → diff → regenerate Wiki

Không phải lựa chọn thay thế B mà là **phần bổ sung** của B (cơ chế staleness). Rủi ro duy nhất là
nếu "regenerate" tự động publish thì mất cửa người duyệt — nên cấm.

### Quyết định

**Option B, với cơ chế staleness của Option C, và bắt buộc snapshot.**

```
đăng ký URL (admin)
   → fetch một lần ở job ingestion (không phải lúc trả lời)
   → sanitize HTML → snapshot vào Storage private → hash
   → AI sinh Wiki draft → NGƯỜI DUYỆT → PUBLISHED
   → pg_cron định kỳ so ETag/Last-Modified/hash
        ├─ giống  → không làm gì
        └─ khác   → tạo version mới + snapshot mới → Wiki về NEEDS_REPROCESS
                    (KHÔNG tự publish)
```

**Runtime fetch: KHÔNG.** Không có đường nào từ `ask-ai` ra Internet.

Điều này **bác bỏ** khuyến nghị Class A của `00-ai-rag-architecture-proposal.md`
(*"fetch và verify canonical source tại answer time"*). Lý do là bảo mật, không phải sở thích:
runtime fetch đặt nội dung do bên thứ ba kiểm soát vào prompt mà không có bước người duyệt nào, và
làm chính hệ thống mất khả năng chứng minh nó đã đọc gì. Một cơ quan sử dụng câu trả lời để ra
quyết định nghiệp vụ cần trả lời được câu *"tại thời điểm đó hệ thống dựa trên nội dung nào"* — chỉ
snapshot mới trả lời được.

Đánh đổi được chấp nhận: nội dung công khai có thể trễ tối đa một chu kỳ check + thời gian duyệt.
Với văn bản quy phạm (đơn vị thay đổi là tuần/tháng, không phải phút), đây là đánh đổi đúng. UI hiển
thị *"đối chiếu nguồn chính thức lúc [thời điểm]"* kèm link để người dùng tự kiểm khi cần gấp.
