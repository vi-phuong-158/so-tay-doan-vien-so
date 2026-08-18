# P5-00 Part L/O/Q — Chi phí, trừu tượng hóa provider, kế hoạch triển khai, và các quyết định

---

## 1. PART L — Mô hình chi phí

Đơn giá provider **chưa được chốt**, nên dưới đây là so sánh **tương đối**, lấy giả định quy mô của
dự án: ~500 tài liệu, trung bình 20 trang/tài liệu (~8.000 token/tài liệu), ~4 triệu token toàn kho.

| Chiến lược | Storage | Embedding (một lần) | Retrieval | Context tokens/câu | Chất lượng | Bảo trì |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Embed toàn văn** | ~4M token nội dung + ~20.000 vector (≈60 MB ở 768 chiều) | ~4M token — **cao nhất, và trả lại toàn bộ mỗi lần đổi model** | Quét chỉ mục lớn; phải post-filter theo quyền ⇒ mất recall | 3.000–6.000 (8 chunk thô, nhiều đoạn lạc ngữ cảnh) | Recall cao, **precision thấp**; không phân biệt hiệu lực; không kiểm duyệt nổi | **Cao** — mỗi lần đổi văn bản là re-chunk + re-embed toàn bộ |
| **B. Chỉ embed Wiki** | ~500 Wiki × ~1.200 token = ~600k token; ~500–1.500 vector | ~600k token — **thấp hơn A khoảng 6–7 lần** | Chỉ mục nhỏ, quét nhanh, lọc quyền trước rẻ | 1.500–2.500 (nội dung đã cô đọng, có cấu trúc) | Precision cao; **yếu ở câu hỏi trích đúng điều/khoản** | Thấp — chỉ re-embed Wiki đã đổi |
| **C. Wiki + evidence chọn lọc** ★ | B + ~10–30 evidence/tài liệu ⇒ ~5.000–15.000 vector nhưng phần lớn ngắn | ~900k–1.2M token — **thấp hơn A khoảng 3–4 lần** | Hai tầng: Wiki khớp trước, evidence chỉ trong tài liệu đã lọt qua | 1.800–3.000 | **Cao nhất** — Wiki trả lời câu hỏi khái quát, evidence trả lời câu hỏi trích dẫn | Trung bình — gắn với vòng duyệt, nhưng phạm vi re-embed nhỏ và xác định |
| **D. Runtime fetch trang chính thức** | Gần như 0 | 0 | **Chậm và không tin cậy** (network mỗi câu) | Không kiểm soát (cả trang) | Không kiểm duyệt được; **rủi ro injection cao nhất** | Thấp về code, **cao về sự cố vận hành** |

**Chọn C.** So với A: chi phí embedding thấp hơn 3–4 lần, context/câu thấp hơn ~2 lần (nên chi phí
sinh — phần tốn thật ở vận hành — giảm theo), và quan trọng hơn cả là **kiểm duyệt được**. So với B:
đắt hơn chút nhưng giải quyết được lớp câu hỏi "khoản 2 điều 5 nói gì" — lớp câu hỏi mà người dùng
của dự án này hỏi thường xuyên nhất.

Điểm bị bỏ qua khi so sánh thuần chi phí token: **chi phí sai**. Một câu trả lời trích văn bản đã
hết hiệu lực có giá cao hơn toàn bộ hóa đơn embedding.

---

## 2. PART O — Trừu tượng hóa provider

Không khóa toàn hệ thống vào Gemini. `docs/brain/03-decisions.md` đã chọn Gemini; quyết định đó
được giữ. Nhưng **schema không được khóa theo model**.

Interface tối thiểu (một module trong `supabase/functions/_shared/`, mỗi provider một adapter, đúng
mẫu `process-email-queue/provider.ts` đã được nghiệm thu ở P3-03):

```ts
generateStructuredSummary(input, { schema, promptVersion }) -> { content, usage, model }
generateEmbedding(text, { model })                          -> { vector, dimension, model }
generateAnswer(question, context, { promptVersion })        -> { text, usage, model }
```

Mọi bản ghi sinh ra từ AI mang: `provider`, `model`, `prompt_version`, và với vector thêm
`embedding_model` + `embedding_dimension`. Nhờ đó:

- Đổi embedding model = thêm hàng mới trong `knowledge_embeddings` với `embedding_model` khác, chạy
  song song, so sánh, rồi tắt cái cũ bằng `is_active=false`. **Không migration, không downtime.**
- Cột `vector` không cố định chiều ở mức bảng; mỗi cặp (model, dimension) có partial index riêng.
  Đây là lý do phải bỏ `document_chunks.embedding vector(768)` — nó khóa cứng vào
  `text-embedding-004`.
- Đánh giá lại chất lượng theo `prompt_version` mà không cần đoán bản Wiki nào sinh bằng prompt nào.

---

## 3. PART Q — Chia nhỏ Phase 5

Mỗi task một branch (quy tắc cứng #1). Mỗi task có scope · acceptance · tests · rollback ·
non-goals tường minh.

### P5-01 — Knowledge schema + RLS

- **Scope:** migration cho `document_versions`, `document_sources`, `knowledge_wikis`,
  `knowledge_wiki_versions`, `knowledge_evidence` (refactor `document_chunks`),
  `knowledge_embeddings`, `ingestion_jobs`, `ingestion_events`, `ai_usage_quota`; sửa PK
  `ai_message_sources`; siết CHECK cho `effect_status` và `document_relations.relation_type`;
  revoke grant thừa trên `document_chunks` và `ai_*`; trigger bất biến (không UPDATE bản đã duyệt);
  RLS + pgTAP cho toàn bộ.
- **Acceptance:** `supabase db reset` + `supabase test db` xanh; pgTAP có **ca âm** cho từng bảng
  (org khác, tài khoản `SUSPENDED`, tài liệu `DRAFT`, Wiki `PENDING_REVIEW`); không có bảng mới nào
  cấp `insert/update/delete` cho `authenticated`; hành vi Phase 4 không đổi (bộ pgTAP Phase 4 vẫn
  xanh nguyên).
- **Rollback:** migration mới chỉ thêm bảng/cột và siết quyền; forward-fix bằng migration tiếp theo.
- **Non-goals:** không Edge Function, không embedding, không gọi AI, không UI.

### P5-02 — Ingestion job foundation

**Amended implementation (2026-08-18):** P5-02 is limited to provider-neutral source locators,
database-triggered idempotent jobs, service-role claim/lease/retry/reclaim RPCs, append-only
operational events, `pg_cron`/`pg_net` scheduling and the authenticated NO_OP worker. It does not
extract bytes, call Google Drive or Gemini, or create Wiki/evidence/embedding content. Before P5-03
uses a real source, complete Google My Drive OAuth bootstrap, secure refresh-token provisioning,
app-managed root-folder rehearsal and a `GoogleDriveStorageProvider` read rehearsal behind a runtime
gate. The preferred scope is `drive.file`; no broad `drive` scope without documented necessity.

- **Scope:** trigger Postgres đẩy job; RPC claim/lease/retry/reclaim theo mẫu `email_queue`;
  `pg_cron` + `pg_net` gọi Edge Function `run-ingestion-jobs` (xác thực `x-cron-secret`, secret từ
  Vault — đúng mẫu P3-08); khung job **chưa gọi AI**, chỉ chạy được job no-op để chứng minh vòng đời.
- **Acceptance:** pgTAP cho idempotency (chạy lại cùng `idempotency_key` không tạo job trùng),
  lease hết hạn được reclaim, `max_attempts` là terminal; Deno test cho contract của Edge Function;
  hai lần invoke liên tiếp không xử lý trùng một job.
- **Non-goals:** không trích xuất thật, không gọi Gemini.

### P5-03 — Extraction + Wiki generation

- **Scope:** trích xuất theo class (bắt đầu PDF + DOCX + TXT), sanitize + chuẩn hóa NFKC + hash;
  adapter provider (`_shared/ai-provider.ts`); sinh Wiki draft có cấu trúc + đề xuất evidence; ghi
  `provider/model/prompt_version`; phát hiện mẫu injection ghi vào `warnings`; bổ sung `GEMINI_*`
  vào `.env.example`.
- **Acceptance:** chạy trên **dữ liệu tổng hợp**, không dùng tài liệu thật (STRICT NON-GOAL của
  P5-00 vẫn áp dụng cho tới khi có phê duyệt riêng); tài liệu 100 trang không timeout (job tách
  bước); định dạng ngoài allowlist ⇒ `FAILED` có mã lỗi, không đoán mò; không có nội dung tài liệu
  nào xuất hiện trong log.
- **Non-goals:** không publish, không embedding, không retrieval.

### P5-04 — Review & publish workflow

- **Scope:** RPC transition (`submit_for_review`, `approve_wiki_version`, `reject_wiki_version`,
  `publish_wiki_version`, `withdraw_wiki`, `regenerate_wiki_draft`, `mark_evidence_incorrect`) — có
  kiểm `can_manage_document`, transaction, `audit_logs`; UI admin theo mẫu `/admin/van-ban`; diff
  giữa hai version; hiển thị warnings.
- **Acceptance:** không đường nào publish mà không có `auth.uid()` hợp lệ và đúng scope; service
  role **không** publish được (pgTAP khẳng định); bản đã `APPROVED` không sửa được tại chỗ; mọi
  transition có hàng `audit_logs`.
- **Non-goals:** không retrieval, không Ask AI.

### P5-05 — Retrieval engine

- **Scope:** job sinh embedding (chỉ chạy sau `PUBLISHED`); hàm retrieval hybrid `security definer`
  (intent → exact/metadata → Wiki → evidence); `pg_trgm`/`tsvector`/`unaccent`; chọn lại chỉ mục
  vector theo số đo thật.
- **Acceptance:** pgTAP — user org A **không bao giờ** nhận hàng của org B ở mọi nhánh chiến lược;
  câu hỏi có số hiệu trả về đúng văn bản đó (không phải "văn bản giống"); văn bản `HET_HIEU_LUC`
  không lọt vào kết quả mặc định; đo recall trước/sau khi thu hẹp scope để chứng minh lỗi §3.7 đã
  đóng.
- **Non-goals:** không gọi model sinh, không UI.

### P5-06 — Ask AI backend

- **Scope:** Edge Function `ask-ai` **viết lại từ đầu** (file cũ đã DROP); kiểm sở hữu
  `conversation_id`; kiểm `account_status='ACTIVE'`; quota + rate limit cưỡng chế trong DB; system
  prompt có version; delimiter + phân tầng chỉ thị; **từ chối ở tầng code khi không có nguồn**; ghi
  `ai_messages` + `ai_message_sources` đầy đủ provenance.
- **Acceptance:** Deno test cho contract; test hồi quy tường minh cho audit §3.1/§3.2/§3.3; không
  nguồn ⇒ **không** gọi provider; hết quota ⇒ từ chối **trước** khi gọi provider; không lộ nội dung
  trong log.
- **Non-goals:** không UI, không bật cho người dùng thật.

### P5-07 — AI frontend + citations

- **Scope:** `src/services/aiService.js`; trang hỏi đáp; hiển thị 4 hạng nguồn kèm nhãn; link mở
  văn bản gốc qua signed URL; cảnh báo hiệu lực; feedback; hiển thị quota.
- **Acceptance:** không câu trả lời nào render mà không có khối nguồn; phần `AI_SYNTHESIS` có nhãn
  rõ; nội dung Wiki render qua `dompurify` (đã có sẵn); test frontend + lint + build xanh.
- **Non-goals:** không redesign 5 khu vực chính, không đụng mock của Innovation.

### P5-08 — Security & adversarial tests

- **Scope:** bộ test injection (bảng ở `06-security-threat-model.md` §2.8); test cách ly RLS xuyên
  tổ chức trên mọi đường AI; test tài liệu độc hại/quá lớn/định dạng lạ; test ranh giới service role;
  test rate limit khi gọi song song.
- **Acceptance:** toàn bộ ca âm PASS; **không** ca nào được sửa kỳ vọng để cho qua (quy tắc cứng #7).
- **Non-goals:** không tính năng mới.

### P5-09 — Runtime rehearsal

- **Scope:** chạy end-to-end trên project rehearsal (không production), dữ liệu tổng hợp, actor
  thật, theo đúng mẫu P4-02R/P4-04R2 và P3-08A/B.
- **Acceptance:** ingest → duyệt → publish → hỏi → có nguồn đúng; hai tổ chức không thấy dữ liệu của
  nhau qua HTTP thật; không secret trong repo/log.
- **Non-goals:** không production, không dữ liệu thật.

### P5-10 — Final Phase 5 acceptance

- **Scope:** audit tích hợp, ma trận production-readiness, cập nhật `docs/brain/*`, ghi rõ blocker
  còn lại.
- **Acceptance:** CI xanh trên đúng HEAD; mọi P5-0x có báo cáo; Code Graph khớp thực tế.

---

## 4. Các quyết định (D1 → D10)

### D1 — Có tiếp tục dùng `document_chunks` hiện tại không?

- **DECISION:** **REFACTOR.** Giữ bảng, đổi vai trò từ "chunk toàn văn" thành `knowledge_evidence`
  (trích đoạn chọn lọc). Thêm `document_version_id`, `evidence_kind`, `selected_by`,
  `selected_reason`, `locator`; bỏ `visibility_level` (cột chết) và `embedding` (chuyển sang bảng
  riêng); sửa unique key. Đổi tên bảng là tùy chọn của P5-01.
- **RATIONALE:** Hình dạng cột (`content`, `content_hash`, `section_path`, `page_from/to`,
  `review_status`) đã đúng cho evidence. Bảng đang ở 0 hàng nên refactor không tốn migration dữ liệu.
  Dựng bảng mới song song sẽ để lại một bảng chết mà agent sau tin nhầm.
- **TRADEOFF:** Tên `document_chunks` gợi sai ý nghĩa mới; nếu không đổi tên phải ghi chú rõ trong
  Code Graph. Đổi tên thì phải sửa `match_document_chunks` và mọi tham chiếu tài liệu.

### D2 — Có embedding full text cho mọi document không?

- **DECISION:** **KHÔNG.**
- **RATIONALE:** Chi phí embedding cao hơn 3–4 lần và context/câu cao hơn ~2 lần mà precision thấp
  hơn (PART L). Quan trọng hơn: 400 chunk/tài liệu không thể kiểm duyệt, nên quyết định
  *"AI chỉ dùng chunk APPROVED"* (đã chốt 2026-07-30) trở thành không thể thực thi. Và chunk thô
  không mang thông tin hiệu lực/phiên bản, nên vector search sẽ trả về văn bản đã hết hiệu lực.
- **TRADEOFF:** Recall thấp hơn ở những câu hỏi rơi vào phần tài liệu chưa được chọn làm evidence.
  Giảm thiểu bằng: (a) `zero-source answers` là metric hàng đầu ở PART P; (b) evidence bổ sung được
  theo nhu cầu truy vấn thật (`selected_by='QUERY_DRIVEN'`); (c) hệ thống **từ chối** thay vì đoán.

### D3 — Wiki có phải retrieval layer chính không?

- **DECISION:** **CÓ.** Wiki đã duyệt là đơn vị truy hồi mặc định; evidence là tầng thứ hai, chỉ mở
  khi câu hỏi cần trích dẫn chi tiết hoặc Wiki không đủ.
- **RATIONALE:** Wiki là đơn vị duy nhất vừa cô đọng, vừa có cấu trúc, vừa được người duyệt, vừa
  mang metadata hiệu lực/phiên bản. Nó trả lời đúng lớp câu hỏi phổ biến nhất ("quy định thế nào",
  "ai chịu trách nhiệm", "hạn bao lâu") với ít token nhất.
- **TRADEOFF:** Chất lượng câu trả lời phụ thuộc thông lượng duyệt — người duyệt trở thành nút cổ
  chai. Đo bằng metric "Wiki approval time"; nếu nghẽn thì mở rộng số người duyệt, **không** bỏ cửa
  duyệt.

### D4 — Evidence chunks được tạo theo tiêu chí nào?

- **DECISION:** Một đoạn trở thành evidence khi thỏa **ít nhất một** tiêu chí, và luôn ghi
  `selected_by` + `selected_reason`:
  1. **Quy phạm trực tiếp** — điều/khoản/điểm đặt ra nghĩa vụ, quyền, điều kiện.
  2. **Thời hạn, con số, mốc thời gian** — thứ mà diễn giải sai gây hậu quả thật.
  3. **Định nghĩa** thuật ngữ mà phần còn lại dựa vào.
  4. **Bước thủ tục** trong quy trình.
  5. **Trường biểu mẫu** (Class D) — nhãn + hướng dẫn điền, giữ nguyên cụm.
  6. **Mục Wiki cần chống lưng** — mỗi mục Wiki phải có ít nhất một evidence; mục nào không có sẽ
     bị đánh dấu `AI_SYNTHESIS` và cảnh báo cho reviewer.
  7. **Query-driven** — log cho thấy câu hỏi thật rơi vào vùng chưa có evidence; admin bổ sung.
- **RATIONALE:** Tiêu chí gắn với *hậu quả của việc trả lời sai*, không gắn với độ dài văn bản. Đó
  là lý do chunk theo ký tự sai về bản chất: nó chia theo hình thức, không theo rủi ro.
- **TRADEOFF:** Cần AI đề xuất + người xác nhận, chậm hơn chunk tự động. Có trần số evidence/tài
  liệu để chi phí không trôi.

### D5 — Public official documents được lưu theo chiến lược nào?

- **DECISION:** **Option B + cơ chế staleness của Option C, và snapshot là bắt buộc.** Lưu URL
  chính thức **và** bản chụp đã sanitize trong Storage private, cộng Wiki đã duyệt và evidence chọn
  lọc.
- **RATIONALE:** Chỉ URL thì không có audit trail và link hỏng làm mất căn cứ của câu trả lời cũ.
  Snapshot trả lời được câu *"tại thời điểm đó hệ thống dựa trên nội dung nào"* — yêu cầu bắt buộc
  với một cơ quan.
- **TRADEOFF:** Tốn storage; và có độ trễ cập nhật bằng chu kỳ check + thời gian duyệt. Chấp nhận
  được vì văn bản quy phạm đổi theo tuần/tháng. UI hiển thị mốc đối chiếu + link nguồn.

### D6 — Có runtime fetch website chính thức không?

- **DECISION:** **KHÔNG.** Không có đường nào từ `ask-ai` ra Internet.
- **RATIONALE:** Runtime fetch đặt nội dung do bên thứ ba kiểm soát vào prompt mà không có bước
  người duyệt — đây là kênh prompt injection trực tiếp, và website bị chiếm trở thành đường tấn công
  vào hệ thống. Cộng thêm: độ trễ không kiểm soát, hỏng khi trang chết, và không chứng minh được đã
  đọc gì. Điều này **bác bỏ** khuyến nghị Class A của
  `00-ai-rag-architecture-proposal.md`; lý do là bảo mật, ghi rõ ở `05-retrieval-source-policy.md`
  PART F.
- **TRADEOFF:** Nội dung công khai có thể trễ. Giảm thiểu bằng `pg_cron` staleness check và nút
  "làm mới nguồn" thủ công cho admin.

### D7 — Versioning documents/Wiki xử lý thế nào?

- **DECISION:** Bốn thực thể tách bạch — `document` (danh tính) → `document_versions` (bất biến,
  có checksum) → `document_sources` (file/URL/snapshot) → `knowledge_wiki_versions` (bất biến sau
  khi duyệt, neo vào đúng một `document_version_id`). Nguồn đổi ⇒ version mới + Wiki về
  `NEEDS_REPROCESS`, **không bao giờ tự publish**. Xóa là hạ cấp trạng thái, không phải DELETE.
- **RATIONALE:** Cùng triết lý "không ghi đè phiên bản báo cáo đã nộp" đã chạy tốt ở Phase 2. Nó cho
  phép câu trả lời AI cũ giữ nguyên provenance: `ai_message_sources` trỏ tới version cụ thể, không
  trỏ tới "bản hiện tại".
- **TRADEOFF:** Nhiều bảng hơn, JOIN nhiều hơn, tốn storage hơn. Đổi lại là khả năng truy vết — thứ
  không thể thêm vào sau.

### D8 — Human review gate nằm ở đâu?

- **DECISION:** **Giữa `PENDING_REVIEW` và `PUBLISHED`**, và đó là cửa duy nhất. Không đơn vị tri
  thức nào có embedding hay vào retrieval trước khi qua cửa này. Cưỡng chế bằng **trigger DB** trên
  `knowledge_embeddings`, không bằng điều kiện trong Edge Function. Service role **không** publish
  được; transition yêu cầu `auth.uid()` có `can_manage_document(owner_organization_id)`.
- **RATIONALE:** Đặt gate ở DB thay vì ở code là khác biệt giữa "chúng tôi có quy trình duyệt" và
  "hệ thống không thể bỏ qua bước duyệt". Đúng nguyên tắc `docs/brain/02-coding-rules.md`: ưu tiên
  ràng buộc DB thay vì code.
- **TRADEOFF:** Người duyệt là nút cổ chai (xem D3). Giảm thiểu bằng diff theo version, duyệt theo
  mục, và warnings tự động để reviewer tập trung vào chỗ rủi ro.

### D9 — RLS/authorization xảy ra trước retrieval thế nào?

- **DECISION:** Phạm vi được tính trong Postgres bằng `auth.uid()` **trước** mọi bước xếp hạng.
  Retrieval là một hàm `security definer` `set search_path=public`, gọi qua `userClient.rpc(...)`.
  Edge Function **không** dùng service role để lấy context. `knowledge_embeddings.document_id` được
  denormalize để thu hẹp tập ứng viên **trước** toán tử `<=>`. Tham số client chỉ được thu hẹp phạm
  vi, không bao giờ mở rộng.
- **RATIONALE:** Mẫu này đã đúng sẵn ở `match_document_chunks`; phần cần sửa là thứ tự lọc (audit
  §3.7) — hiện lọc *sau* khi index sắp xếp nên vừa mất recall vừa tốn công vô ích. Lọc sau khi truy
  hồi thì dữ liệu ngoài phạm vi đã rời database — coi như đã rò rỉ.
- **TRADEOFF:** Hàm retrieval phức tạp hơn và khó tối ưu hơn một câu `order by ... limit` thuần.
  Chấp nhận: đây là ranh giới bảo mật, không phải chỗ để tối ưu sớm.

### D10 — Uncommitted Phase 5 work: KEEP / REFACTOR / DROP?

**Làm rõ trước:** không có uncommitted work nào. Working tree sạch; phần từng nằm ở worktree đã
được commit và merge qua PR #30 và **chỉ gồm một file tài liệu**. Phần code Phase 5 thật đã nằm trên
`master` từ `9f01b37 chore: initial commit`, chưa từng được review. Quyết định áp cho phần đó:

| Hạng mục | Quyết định | Lý do |
| --- | --- | --- |
| `supabase/functions/ask-ai/index.ts` | **DROP** | 4 lỗi bảo mật/đúng đắn (ghi xuyên hội thoại, không kiểm ACTIVE, không quota/rate limit, không phòng thủ injection), 0 test, code minify một dòng. Viết lại ở P5-06 rẻ hơn sửa. |
| `supabase/functions/process-document/index.ts` | **DROP** | Hiện thân của kiến trúc bị bác bỏ; thêm privilege escalation xuyên tổ chức, giả mạo nội dung nguồn, bỏ qua state machine + audit của Phase 4, và chắc chắn timeout. |
| `supabase/functions/_shared/*` | **KEEP** | Đã nghiệm thu qua Phase 2–4. P5 dùng `requireScopedRole`, không dùng `requireAnyRole`. |
| `document_chunks` (+ index ivfflat) | **REFACTOR** | Xem D1. |
| `match_document_chunks` | **REFACTOR** | Hình dạng bảo mật đúng, giữ nguyên tắc; viết lại phần hybrid + thứ tự lọc ở P5-05. |
| `ai_conversations`, `ai_feedback` | **KEEP** | Schema và RLS đã đúng. |
| `ai_messages` | **REFACTOR** | Thêm cột provenance/observability. |
| `ai_message_sources` | **REFACTOR** | PK hiện tại khiến không trích dẫn được ở mức Wiki/tài liệu (NULL trong PK). |
| Grant `insert/update/delete` trên `document_chunks` + `ai_*` cho `authenticated` | **REFACTOR (revoke)** | Rộng hơn nhu cầu, hiện chỉ được RLS chặn. Đóng như Phase 4 đã làm với `documents`. |
| `docs/phase-5/00-ai-rag-architecture-proposal.md` | **KEEP (có banner superseded)** | Hồ sơ quyết định đã merge; nhưng khuyến nghị runtime-fetch của nó bị D6 bác bỏ, phải ghi rõ để agent sau không tin nhầm. |

- **RATIONALE chung:** DROP hai file không phải vì chúng "chưa hoàn thiện" mà vì mỗi file chứa ít
  nhất một lỗi *kiến trúc* (không chỉ lỗi cài đặt): `ask-ai` tin `conversation_id` của client trên
  đường service role; `process-document` tin nội dung của client làm nội dung văn bản chính thức.
  Sửa tại chỗ sẽ giữ lại hình dạng đã sai, và code minify một dòng khiến diff của bản sửa không
  review được.
- **TRADEOFF:** Mất phần "prompt tiếng Việt yêu cầu trả lời có `[Nguồn n]`" và mẫu gọi Gemini — cả
  hai đã được ghi lại ở tầng thiết kế (`05-retrieval-source-policy.md` PART E, PART O) nên không
  mất tri thức. **Việc DROP không được thực hiện trong P5-00** (P5-00 là audit); nó thuộc P5-06,
  cùng branch với bản viết lại, để không có khoảng thời gian nào repo mất chức năng mà chưa có thay
  thế.
