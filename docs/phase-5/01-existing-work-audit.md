# P5-00 Part A/B — Audit hiện trạng Phase 5

> **Loại tài liệu:** audit, read-only. Không sửa một dòng code runtime nào để tạo tài liệu này.
> **Trạng thái:** `NO_RUNTIME_CODE_CHANGED`.

---

## 1. Baseline đã ghi nhận

| Mục | Giá trị |
| --- | --- |
| Branch | `claude/phase-5-rag-audit-0sfm7y` |
| HEAD | `343547cb5a81d5e1e69cea26a6a232c990e8c92b` |
| `master` HEAD | `343547cb5a81d5e1e69cea26a6a232c990e8c92b` (giống hệt HEAD) |
| `origin/master` | `343547cb5a81d5e1e69cea26a6a232c990e8c92b` |
| Working tree | **SẠCH** — `git status --porcelain` không trả về dòng nào |
| Stash | rỗng (`git stash list` không có entry) |
| Untracked / ignored | không có file nào (`--untracked-files=all --ignored=matching` rỗng) |

### Sai lệch so với giả định của task

Task P5-00 mô tả *"Current worktree có pre-existing uncommitted Phase 5 work"* và yêu cầu không
xóa/reset/commit phần đó. **Giả định này không còn đúng tại thời điểm audit.** Không có dirty
worktree nào để bảo toàn. Provenance xác định được:

```
343547c  Merge pull request #30 from vi-phuong-158/docs/phase-5-00-architecture-proposal
└─ ecb5dbf  docs(phase-5): propose AI/RAG architecture (P5-00, no implementation)
   author: vi-phuong-158 <anmphongandn@gmail.com>  2026-08-17 08:48:40 +0700
   Co-Authored-By: Claude Sonnet 5
   diff: docs/phase-5/00-ai-rag-architecture-proposal.md | 188 ++++++++++ (1 file, docs only)
```

Nghĩa là: phần "Phase 5 work" từng nằm ở worktree đã được **commit và merge vào `master` qua PR
#30**, và nó **chỉ gồm một file tài liệu** — không có migration, không có Edge Function, không có
code. Không có gì bị mất; không cần worktree/branch phụ để khảo sát.

### Nhưng: có code Phase 5 thật, đã nằm trên master từ lâu

Điều quan trọng hơn mà task không nêu: `ask-ai` và `process-document` **đã tồn tại và đã được
commit từ `9f01b37 chore: initial commit`** (2026-07-30, cùng đợt dựng khung Phase 1). Chúng chưa
bao giờ được review, chưa bao giờ được test, chưa bao giờ chạy. `docs/brain/04-current-tasks.md`
xếp chúng vào backlog *"Hoàn thiện Edge Functions còn khung"*. Đây mới là "existing Phase 5 work"
thực sự cần audit, và nó nguy hiểm hơn dirty worktree vì nó **trông như đã hoàn thành**.

Tương tự, toàn bộ schema AI/RAG (`document_chunks` + `vector(768)`, `ai_conversations`,
`ai_messages`, `ai_message_sources`, `ai_feedback`, RPC `match_document_chunks`, index ivfflat)
đã có từ `202607300001_initial_schema.sql`. Phase 4 **cố ý** không đụng vào (xem
`docs/brain/03-decisions.md` mục `[2026-08-16] P4-02 KHÔNG revoke grant của
document_relations/document_chunks` và comment dòng 14 của `202608160001`).

---

## 2. Bảng audit — từng artefact

Ký hiệu: **K** = Keep, **R** = Refactor, **D** = Drop.

### 2.1 Edge Functions

| File | Mục đích hiện tại | Trạng thái | K | R | D | Lý do |
| --- | --- | --- | :-: | :-: | :-: | --- |
| `supabase/functions/ask-ai/index.ts` | Embed câu hỏi → `match_document_chunks` → Gemini → lưu `ai_messages` + sources | Skeleton chạy được về cú pháp, **chưa từng chạy**, 0 test, code minify 1 dòng | | | **D** | 7 lỗi bảo mật/đúng đắn (§3). Viết lại từ đầu ở P5-06 rẻ hơn sửa. Ý tưởng "chỉ trả lời từ nguồn + luôn ghi `[Nguồn n]`" được giữ lại ở tầng thiết kế, không giữ file. |
| `supabase/functions/process-document/index.ts` | Chunk toàn văn → embed từng chunk → ghi `document_chunks` → set `PENDING_REVIEW` | Skeleton, chưa từng chạy, 0 test, minify 1 dòng | | | **D** | Hiện thân trực tiếp của kiến trúc "chunk tất cả / embed tất cả" mà P5-00 bác bỏ. Thêm vào đó là privilege escalation + content forgery (§3). |
| `supabase/functions/_shared/auth.ts` | `clients()`, `requireUser`, `requireGlobalRole`, `requireScopedRole` | Đã dùng thật ở Phase 2–4, có test gián tiếp | **K** | | | Ranh giới auth đã được nghiệm thu. P5 dùng `requireScopedRole`, **không** dùng `requireAnyRole`. |
| `supabase/functions/_shared/http.ts`, `validation.ts` | CORS, JSON, `safeText`, `assertUuid`, `safeFileName` | Đã dùng thật ở Phase 2–4 | **K** | | | Không đổi. |

### 2.2 Database schema (đã ở trên `master`, chưa có dữ liệu)

| Đối tượng | Nơi định nghĩa | Trạng thái | K | R | D | Lý do |
| --- | --- | --- | :-: | :-: | :-: | --- |
| `public.document_chunks` | `202607300001` L170–176 | 0 hàng, không pipeline nào ghi vào | | **R** | | Giữ bảng nhưng **đổi vai trò**: từ "chunk toàn văn" thành `knowledge_evidence` (trích đoạn có chủ đích). Cần thêm `document_version_id`, `evidence_kind`, `selected_by`, `selected_reason`; bỏ `visibility_level` chết (§3.8). Đổi tên là tùy chọn của P5-01. |
| `document_chunks.embedding vector(768)` | cùng trên | chưa dùng | | **R** | | 768 chiều khóa cứng vào `text-embedding-004`. Chuyển embedding sang bảng riêng có `embedding_model` + `embedding_dimension` (PART O). |
| `idx_document_chunks_embedding` (ivfflat, lists=100) | `202607300001` L~343 | chưa dùng | | **R** | | `lists=100` được chỉnh cho ~100k vector. Với mô hình Wiki-first (ước lượng 10²–10³ vector) ivfflat sai tham số sẽ giảm recall; HNSW hoặc lists nhỏ hơn phù hợp hơn. Quyết định ở P5-05 khi biết cardinality thật. |
| `public.match_document_chunks(vector, integer)` | `202607300001` L364, thay bởi `202607300003` L80 | `security definer`, lọc `review_status='APPROVED' and can_access_document(...)` | | **R** | | **Hình dạng bảo mật đúng** — lọc quyền xảy ra bên trong Postgres, context không rời Supabase khi chưa lọc. Nhưng lọc đặt *sau* `order by embedding <=>` nên với ivfflat sẽ mất recall (§3.7). Viết lại thành hàm retrieval hybrid ở P5-05, giữ nguyên nguyên tắc `security definer` + lọc trong DB. |
| `ai_conversations` | `202607300001` L~330 | 0 hàng, RLS `user_id = auth.uid()` | **K** | | | Đúng hình dạng, RLS đúng. |
| `ai_messages` | `202607300001` | 0 hàng, RLS chỉ SELECT theo chủ hội thoại | | **R** | | Cần thêm `prompt_version`, `provider`, `retrieval_strategy`, `refusal_reason` để phục vụ PART O/P. |
| `ai_message_sources` | `202607300001` | 0 hàng | | **R** | | **Defect thật:** PK là `(message_id, document_id, chunk_id)` trong khi `chunk_id` nullable. Postgres không cho NULL trong PK ⇒ **không thể trích dẫn ở mức tài liệu/Wiki, chỉ mức chunk**. Phải sửa PK và thêm `wiki_version_id`. |
| `ai_feedback` | `202607300001` | 0 hàng, RLS đúng | **K** | | | Đủ cho P5-07. |
| Bảng quota AI | **không tồn tại** | — | | | | `docs/brain/01-architecture.md` L340 mô tả `requireUser + quota` nhưng không có bảng nào. Phải tạo mới ở P5-01. |
| `grant select, insert, update, delete on public.document_chunks to authenticated` | `202607300001` L401 | còn nguyên (Phase 4 cố ý không revoke) | | **R** | | Xem §3.8 — grant rộng hơn nhu cầu, hiện chỉ được chặn bởi RLS. P5-01 phải revoke như Phase 4 đã làm với `documents`. |
| `grant ... ai_conversations/ai_messages/ai_message_sources/ai_feedback to authenticated` | `202607300001` L412–415 | còn nguyên | | **R** | | Tương tự: `ai_messages` không có policy INSERT nên RLS chặn, nhưng grant vẫn thừa. Đóng ở P5-01. |

### 2.3 Frontend

| File | Trạng thái | K | R | D | Lý do |
| --- | --- | :-: | :-: | :-: | --- |
| — | **Không có UI AI nào.** `grep -rn "ask-ai\|askAi\|chunk\|embedding" src/` trả về 0 kết quả. Không có `src/services/aiService.js`. | | | | Không có gì để keep/drop. P5-07 dựng mới. |
| `src/pages/Knowledge.jsx` | Tab Văn bản + Chuyên đề đã nối Supabase thật (P4-01/P4-03); không có tab AI | **K** | | | Không đụng vào. |

### 2.4 Tests

| Hạng mục | Trạng thái |
| --- | --- |
| Test frontend cho AI | **Không có** |
| pgTAP cho `document_chunks` / `match_document_chunks` / `ai_*` | **Không có** (`supabase/tests/` 25 file, không file nào chạm AI) |
| Deno test cho `ask-ai` / `process-document` | **Không có** (không có `contract.ts`/`*.test.ts` như các function Phase 2–3) |
| Bao phủ duy nhất | `deno check **/*.ts` trong CI job `test-db` — chỉ type-check, không chạy logic |

### 2.5 Tài liệu

| File | K | R | D | Lý do |
| --- | :-: | :-: | :-: | --- |
| `docs/phase-5/00-ai-rag-architecture-proposal.md` | | **R** | | Giữ làm hồ sơ quyết định (đã merged qua PR #30). Nhưng khuyến nghị Class A của nó — *"fetch và verify canonical source tại answer time"* — **bị bác bỏ** bởi phân tích prompt-injection ở `06-security-threat-model.md`. Đã thêm banner "superseded" vào đầu file để agent sau không tin nhầm. |

---

## 3. Vấn đề code/bảo mật trong phần chưa review

Đây là các phát hiện từ đọc code, **chưa sửa gì**. Đánh số để P5-06/P5-08 tham chiếu.

### 3.1 `ask-ai` — ghi được vào hội thoại của người khác (nghiêm trọng)

```js
let conversationId = body.conversation_id;          // ← lấy thẳng từ client
if (!conversationId) { /* tạo mới với user_id = user.id */ }
await adminClient.from('ai_messages').insert({ conversation_id: conversationId, ... });
```

`conversation_id` do client cung cấp **không được kiểm tra quyền sở hữu**, và `adminClient`
(service role) **bỏ qua RLS**. Một tài khoản `authenticated` bất kỳ có thể chèn message giả (cả
`role:'user'` lẫn `role:'assistant'`) vào hội thoại của người khác. Đọc thì vẫn bị RLS chặn, nhưng
đây là ghi xuyên tenant và làm hỏng provenance của lịch sử trả lời. Vi phạm trực tiếp nguyên tắc
`docs/brain/02-coding-rules.md` về validation ở ranh giới tin cậy.

### 3.2 `process-document` — kiểm quyền toàn cục thay vì theo scope (nghiêm trọng)

```js
await requireAnyRole(adminClient, user.id, ['YOUTH_ADMIN','SYSTEM_ADMIN']);
```

`requireAnyRole` là alias của `requireGlobalRole` — chỉ hỏi *"user này có role YOUTH_ADMIN ở
bất kỳ đâu không"*. Không so với `documents.owner_organization_id`. Một YOUTH_ADMIN của tổ chức A
có thể xử lý, xóa và ghi đè chunk của tài liệu thuộc tổ chức B. Phase 4 đã giải quyết đúng bài này
bằng `can_manage_document(p_org)` / `requireScopedRole`; `process-document` không dùng.

### 3.3 `process-document` — giả mạo nội dung nguồn (nghiêm trọng)

```js
let text = safeText(body.extracted_text, 2_000_000);
```

Client được phép nộp thẳng tối đa 2 triệu ký tự "nội dung đã trích xuất", và hệ thống ghi nó vào
`document_chunks` **dưới danh nghĩa văn bản chính thức đó**, không đối chiếu với file gốc trong
Storage. Bất kỳ ai qua được §3.2 đều có thể gán nội dung tùy ý cho một công văn thật. Đây là phá vỡ
provenance ở mức gốc — chính thứ mà toàn bộ Phase 5 tồn tại để bảo vệ.

### 3.4 `process-document` — bỏ qua state machine và audit của Phase 4

```js
await adminClient.from('documents').update({ status: 'PROCESSING' }).eq('id', documentId);
...
await adminClient.from('documents').update({ status: 'PENDING_REVIEW' }).eq('id', documentId);
```

Ghi thẳng `documents.status` bằng service role, không qua `publish_document` /
`withdraw_document` / `update_document_metadata` — nên **không validate transition và không ghi
`audit_logs`**. Cụ thể: một tài liệu đang `PUBLISHED` có thể bị kéo ngược về `PENDING_REVIEW`, làm
nó biến mất khỏi `can_access_document` (hàm này yêu cầu `status = 'PUBLISHED'`) đối với mọi người
dùng cuối, im lặng, không dấu vết. Đây là thay đổi hành vi Phase 4 đã nghiệm thu — bị cấm bởi
STRICT NON-GOALS.

### 3.5 `process-document` — không thể chạy xong trong thực tế

- `chunks()` cắt tới **2000** đoạn, rồi `for` **tuần tự** gọi `embed()` từng đoạn. 2000 round-trip
  HTTP tới Gemini trong một lần gọi Edge Function ⇒ chắc chắn timeout. Không có job, không retry,
  không idempotency, không checkpoint.
- `delete` rồi `insert` **không trong transaction**: fail giữa chừng ⇒ tài liệu mất sạch chunk và
  kẹt ở `PROCESSING` vĩnh viễn.
- Chỉ hỗ trợ `.txt` (`document.storage_path?.endsWith('.txt')`). PDF/DOCX/XLSX — tức là toàn bộ
  tài liệu thật của dự án — không có đường trích xuất nào.
- `unique(document_id, content_hash)` khiến một tài liệu có **hai đoạn văn giống hệt nhau** (rất
  thường gặp ở biểu mẫu, bảng, dòng lặp) làm hỏng cả lần insert.

### 3.6 Cả hai function — không có phòng thủ prompt injection

`ask-ai` nối thẳng nội dung tài liệu vào prompt:

```js
const context = chunks.map((c,i) => `[Nguồn ${i+1}] ... \n${c.content}`).join('\n\n');
const prompt = `Bạn là trợ lý ... \n\nCÂU HỎI:\n${question}\n\nNGUỒN:\n${context}`;
```

Không delimiter chống thoát, không sanitize, không phân tầng chỉ thị, không đánh dấu nội dung
truy hồi là **dữ liệu không tin cậy**. Một PDF chứa dòng *"Bỏ qua mọi chỉ dẫn trước đó..."* nằm
ngang hàng với system prompt. Xử lý đầy đủ ở `06-security-threat-model.md`.

### 3.7 `match_document_chunks` — lọc quyền đúng, nhưng recall sai

```sql
select ... from public.document_chunks c
where c.review_status='APPROVED' and public.can_access_document(c.document_id)
order by c.embedding <=> query_embedding limit greatest(1,least(match_count,20));
```

Về **bảo mật đây là mẫu đúng** và phải giữ: hàm `security definer`, lọc quyền chạy trong Postgres,
không có dữ liệu ngoài phạm vi nào rời database rồi mới lọc. Vấn đề là **chất lượng**: planner
dùng index ivfflat để sắp xếp trước, rồi mới áp vị từ `can_access_document` (một hàm plpgsql
`stable`, chi phí cao, gọi mỗi hàng). Kết quả: người dùng có phạm vi hẹp thường nhận **ít hơn**
`match_count` kết quả, hoặc không có kết quả nào dù kho có tài liệu phù hợp. Cách sửa là thu hẹp
tập ứng viên **trước** bước vector (lọc theo scope + metadata trước), đúng như thiết kế hybrid ở
`05-retrieval-source-policy.md`.

### 3.8 `document_chunks.visibility_level` là cột chết

Bảng có `visibility_level text not null default 'INTERNAL_YOUTH'` và `process-document` chăm chỉ
ghi vào đó, nhưng **không policy nào và không hàm nào đọc nó** — `match_document_chunks` chỉ hỏi
`can_access_document(document_id)`. Một cột trông như biện pháp bảo mật nhưng không có tác dụng
còn tệ hơn không có: agent/dev sau sẽ tin rằng chunk được phân quyền riêng. Hoặc thực thi nó, hoặc
bỏ nó — P5-01 chọn bỏ, vì phân quyền phải neo ở tài liệu gốc, không nhân bản xuống từng mảnh.

### 3.9 `ai_message_sources` không trích dẫn được ở mức tài liệu

`primary key (message_id, document_id, chunk_id)` với `chunk_id uuid references document_chunks(id)`
(nullable). Postgres cấm NULL trong PK ⇒ **mọi citation bắt buộc phải có `chunk_id`**. Mô hình
Wiki-first cần trích dẫn được một bản Wiki đã duyệt hoặc một tài liệu nguyên bản mà không cần
chunk. Phải sửa ở P5-01.

### 3.10 `ask-ai` không kiểm tra tài khoản còn hoạt động, không quota, không audit, không rate limit

`requireUser` chỉ xác thực JWT; không kiểm `profiles.account_status = 'ACTIVE'` (các function
Phase 2–4 kiểm qua `requireScopedRole`). Người dùng đã bị đình chỉ vẫn gọi được Gemini để embed
câu hỏi — retrieval sẽ trả rỗng vì `can_access_document` gọi `is_active_user()`, nên **không lộ dữ
liệu**, nhưng vẫn đốt quota và chi phí. Cộng thêm: không bảng quota, không rate limit, không ghi
`audit_logs` cho một endpoint gọi ra ngoài Internet có tính phí.

### 3.11 Không có secret nào bị hardcode — mục này PASS

`GEMINI_API_KEY` đọc qua `Deno.env.get`, không có literal key nào trong repo. `.env.example` khai
báo rõ *"Không đặt service role key, Gemini key hoặc email provider key trong biến `VITE_*`"*.
Thiếu sót duy nhất: `.env.example` **chưa liệt kê** `GEMINI_API_KEY` / `GEMINI_EMBEDDING_MODEL` /
`GEMINI_GENERATION_MODEL`, nên môi trường dựng theo file mẫu sẽ fail `GEMINI_NOT_CONFIGURED`. Bổ
sung ở P5-03, không phải P5-00 (P5-00 bị cấm tạo secret production).

### 3.12 Vi phạm quy tắc code

Cả hai file được viết dồn thành **một dòng ~4000 ký tự**. Không đọc được, không review được theo
dòng, không diff được có ý nghĩa. Trái `docs/brain/02-coding-rules.md`. Đây là một lý do độc lập
đủ để DROP thay vì refactor tại chỗ.

---

## 4. Tổng hợp: đã implement / mới là khung / đã test

| Câu hỏi | Trả lời |
| --- | --- |
| **1. Cái gì đã implement?** | Schema AI/RAG đầy đủ (5 bảng + RPC + index ivfflat) từ `202607300001`. Hai Edge Function `ask-ai`/`process-document` đủ để type-check. |
| **2. Cái gì mới là skeleton?** | Cả hai Edge Function — chưa từng deploy, chưa từng chạy, không xử lý được định dạng file thật, chắc chắn timeout với tài liệu thật. Toàn bộ 5 bảng ở 0 hàng. |
| **3. Cái gì đã test?** | Không có gì. 0 pgTAP, 0 Deno test, 0 frontend test chạm AI. Chỉ có `deno check` (type-check). |
| **4. Cái gì chưa test?** | Toàn bộ. |
| **5. Cái gì phụ thuộc kiến trúc full-chunk cũ?** | `process-document` (toàn bộ), `document_chunks.chunk_index`/`content_hash` unique, `idx_document_chunks_embedding`, và nhánh retrieval của `ask-ai`. |
| **6. Cái gì tái sử dụng được?** | `_shared/auth.ts` + `http.ts` + `validation.ts`; mẫu `security definer` + lọc quyền trong DB của `match_document_chunks`; `ai_conversations`/`ai_feedback`; toàn bộ mẫu review/publish/audit của Phase 4 (`can_manage_document`, `publish_document`, `audit_logs`); hạ tầng `pg_cron`+`pg_net` của Phase 3. |
| **7. Có code/security issue không?** | Có — 10 vấn đề (§3.1–§3.10), trong đó 3 mức nghiêm trọng: ghi xuyên hội thoại, privilege escalation xuyên tổ chức, giả mạo nội dung nguồn. Không có secret bị lộ (§3.11). |

---

## 5. Part B — Schema hiện tại có đỡ được mô hình mới không?

Đánh giá `documents`, `document_relations`, `document_chunks`, learning resources, visibility, RLS,
Storage theo từng năng lực mà mô hình ba lớp cần:

| Năng lực cần | Có sẵn? | Chi tiết |
| --- | --- | --- |
| Canonical source metadata | **Phần lớn** | `documents` đã có `document_number`, `issuing_authority`, `issued_date`, `effective_date`, `expiry_date`, `effect_status`, `scope`, `keywords[]`, `source_url`, `storage_path`. Rất tốt — không phải dựng lại. |
| Checksum nguồn | **KHÔNG** | Không có cột hash nào trên `documents`. Không phát hiện được nguồn đã đổi. |
| Document version (bất biến) | **KHÔNG** | `documents` là một hàng bị ghi đè tại chỗ. Không có `document_versions`. Không giữ được lịch sử như `report_submissions` đã làm cho báo cáo. |
| Snapshot nội dung nguồn | **KHÔNG** | Không có bảng nào lưu bản chụp của `source_url`. |
| Knowledge Wiki | **KHÔNG** | Không tồn tại. `documents.summary` là một cột text tự do, không có cấu trúc, không có version, không có review riêng. |
| Wiki version | **KHÔNG** | — |
| Provenance của nội dung AI sinh ra | **KHÔNG** | Không có `provider`/`model`/`prompt_version`/`generated_at` ở đâu cả. |
| Review workflow | **CÓ, tái dùng được** | `documents.status` có đủ 7 giá trị + `approved_by`/`approved_at`, `publish_document`/`withdraw_document` validate transition và ghi `audit_logs`. Đây là mẫu chuẩn để nhân bản cho Wiki — nhưng **Wiki cần vòng đời riêng**, không dùng chung cột status với tài liệu. |
| Selective evidence | **Một phần** | `document_chunks` có `section_path`, `page_from/to`, `content_hash`, `review_status` — đủ hình dạng, thiếu ý định: không có cột nào nói *vì sao* đoạn này được chọn, và không neo vào version nào. |
| Lifecycle văn bản (thay thế/hết hiệu lực) | **Một phần** | `document_relations(source, target, relation_type)` có cấu trúc đúng nhưng `relation_type` là `text` tự do — không constraint, không phân biệt `REPLACES`/`AMENDS`/`REFERENCES`. `effect_status` là text tự do, không check constraint. Retrieval không thể tin cậy lọc theo hiệu lực. |
| Retrieval scope / visibility filtering | **CÓ, đã nghiệm thu** | `can_access_document(uuid)` fail-closed, 4 mức `PUBLIC`/`INTERNAL_YOUTH`/`ORGANIZATION_ONLY`/`RESTRICTED`, `has_role_in_scope`, policy Storage dùng `uuid_or_null`. Đây là tài sản mạnh nhất đang có — Phase 5 phải neo vào, tuyệt đối không dựng mô hình quyền thứ hai. |
| Quota AI | **KHÔNG** | — |
| Ingestion job/queue | **KHÔNG** cho AI, nhưng **có mẫu** | `email_queue` (claim/retry/reclaim/idempotency_key/lease) là mẫu queue đã được nghiệm thu ở P3-02 và chạy thật ở P3-08. Sao chép mẫu này, không phát minh lại. |

**Kết luận Part B:** schema hiện tại **đủ tốt ở tầng canonical metadata và tầng quyền** — hai thứ
khó nhất — nhưng **thiếu hoàn toàn tầng Wiki, versioning và provenance**. Không cần thay
`documents`; cần bổ sung xung quanh nó. Đề xuất cụ thể ở `03-knowledge-data-model.md`.
**Không migration nào được viết trong P5-00.**
