# P5.5-00 — Member Management Architecture & Data Contract

> Trạng thái: **ARCHITECTURE / DESIGN ONLY — không có code triển khai trong task này.**
> Base: `master@a775a637a29217dbce6d658086935fd1b64da5c9` (Phase 1–5 đã đóng).
> Forensic audit trước task này (verdict `P5_5_NOT_FOUND`) xác nhận không có code/schema/branch/PR
> Phase 5.5 nào tồn tại trước đây — đây là fresh initiative.

---

## 1. Scope reconciliation — quyết định cũ vs quyết định mới

**Quyết định cũ** (`docs/brain/00-project-overview.md` mục "Ngoài scope (bản đầu)",
`docs/brain/04-current-tasks.md` mục "Không làm lúc này", ghi từ 2026-07-30):

> "Đoàn phí, chuyển sinh hoạt Đoàn, **hồ sơ đoàn viên đầy đủ**, xếp loại tự động — ngoài scope
> bản đầu."

Quyết định này **không bị xoá hoặc viết lại**. Nó vẫn đúng cho đúng phạm vi nó mô tả:
**complete personnel dossier** (hồ sơ đoàn viên đầy đủ — đoàn phí, chuyển sinh hoạt, xếp loại tự
động, lịch sử kỷ luật, HRM) tiếp tục **ngoài scope**.

**Quyết định mới (P5.5-D0):** Sau khi Phase 1–5 ổn định (RAG/knowledge base đã đóng, `master` xanh),
owner chủ động đưa **lightweight Member Management** (danh sách đoàn viên tối thiểu: định danh, đơn
vị công tác, chức vụ, chức danh Đoàn, trình độ lý luận chính trị, trạng thái) vào Phase 5.5, thực
hiện **trước** Innovation Corner mở rộng (Phase 6), vì Ban Thanh niên cần một nơi tra cứu/theo dõi
tình hình đoàn viên tối thiểu mà hệ thống hiện tại hoàn toàn không có (5 trang chính vẫn chạy dữ
liệu demo, không có bảng member nào tồn tại).

**Lý do thay đổi:** Business priority changed — không phải lỗi tài liệu, không phải agent trước
"quên" làm. Ghi rõ ở `docs/brain/03-decisions.md` (P5.5-D0).

**Ranh giới giữa hai quyết định:**

| | Quyết định cũ (vẫn đứng) | Quyết định mới (P5.5) |
|---|---|---|
| Phạm vi | Complete personnel dossier | Lightweight member list |
| Đoàn phí | Ngoài scope | Ngoài scope |
| Chuyển sinh hoạt Đoàn (workflow) | Ngoài scope | Ngoài scope (chỉ lưu `member_status` tĩnh, không workflow chuyển tiếp) |
| Xếp loại tự động | Ngoài scope | Ngoài scope |
| Kỷ luật / lịch sử cán bộ | Ngoài scope | Ngoài scope |
| Danh sách đoàn viên + thông tin cơ bản + chức danh Đoàn/Ban TN + tra cứu | Không có | **Trong scope P5.5** |

---

## 2. Account Profile vs Member Record

Đây là quyết định kiến trúc chốt của owner, coi là authoritative cho toàn bộ P5.5+.

```text
ACCOUNT PROFILE                          MEMBER RECORD
────────────────                         ─────────────
Người có tài khoản đăng nhập hệ thống     Đoàn viên được quản lý trong danh sách
Supabase Auth (auth.users)                Không auth.users, không login, không password
profiles + user_roles                     Member API + PostgreSQL tại Mắt Bão (Việt Nam)
Số lượng: nhỏ (cán bộ được cấp quyền)     Số lượng: ~3.000 (toàn bộ đoàn viên pilot)
Ví dụ: Bí thư, Phó Bí thư, Ban TN,        Ví dụ: mọi đoàn viên, kể cả người không
cán bộ quản trị                           bao giờ đăng nhập hệ thống
```

**Hệ quả bắt buộc (acceptance criterion, xem mục 11):**
- Import 3.000 đoàn viên **không** tạo 3.000 `auth.users`, **không** tạo 3.000 `profiles`, **không**
  gửi invitation email.
- Member Record tồn tại **độc lập hoàn toàn** với authentication identity.
- Một phần nhỏ PII cần thiết cho account vận hành (`profiles.full_name`, `.phone`, `.job_title`) tiếp
  tục ở Supabase — **không có yêu cầu cụ thể nào để xoá hoặc migrate các cột này**, nên không đụng
  tới.
- Không mặc định migrate `profiles` sang Mắt Bão. `profiles` là account data, member record là
  member data — hai bảng, hai hệ thống, hai vòng đời.

---

## 3. Data classification

| Data | Classification | Source of truth | Storage | Access | Logged? | Sent to external service? |
|---|---|---|---|---|---|---|
| Account email | SENSITIVE PERSONAL | Supabase Auth (`auth.users`) | Supabase | Bản thân, SYSTEM_ADMIN | Không log giá trị | Không |
| Account full name / phone / job_title | PERSONAL | `profiles` | Supabase | Bản thân + scoped admin (RLS hiện có) | Không log giá trị | Không |
| Member full name | PERSONAL | Member API (Mắt Bão) | PostgreSQL VN | Bản thân org scope (mục 12) | Audit theo mục 16, không log full payload | **Không** gửi Gemini/RAG (mục 20) |
| Member date_of_birth | PERSONAL | Member API | PostgreSQL VN | Scoped member-management roles | Audit trên thay đổi | Không |
| Member work_unit / job_title | INTERNAL | Member API | PostgreSQL VN | Scoped roles + người xem danh sách | Audit trên thay đổi | Không |
| Member youth_position (chức danh Đoàn) | INTERNAL | Member API | PostgreSQL VN | Scoped roles | Audit trên thay đổi | Không |
| Member youth_board_position (Ban TN) | INTERNAL | Member API | PostgreSQL VN | Scoped roles | Audit trên thay đổi | Không |
| Member political_theory_level | SENSITIVE PERSONAL (nhạy cảm về đánh giá cán bộ) | Member API | PostgreSQL VN | Scoped roles, không public | Audit trên thay đổi | Không |
| Member status (ACTIVE/...) | INTERNAL | Member API | PostgreSQL VN | Scoped roles | Audit trên thay đổi | Không |
| Supabase JWT (access token) | AUTHORIZATION | Supabase Auth | Trình duyệt (memory), never persisted cross-session by design | Chính chủ | Không log giá trị token | Chỉ tới Member API qua HTTPS như bearer, không log |
| Member API shared secret / DB credential | SECRET | Vault/hosting secret manager | Backend-only (Mắt Bão + Supabase Vault) | Không ai đọc qua ứng dụng | Không log | Không |

Nguyên tắc phân loại: không over-classify — chỉ những field thực sự impact quyền riêng tư/an ninh
mới lên mức SENSITIVE PERSONAL; phần lớn dữ liệu vận hành (work_unit, job_title, youth_position) ở
mức INTERNAL vì cần thiết cho tác nghiệp bình thường của Ban Thanh niên.

---

## 4. Target architecture

```text
                              USER
                               │
                               ▼
                        React/Vite PWA
                            Vercel
                               │
                 ┌─────────────┴─────────────┐
                 │                            │
                 ▼                            ▼
             SUPABASE                    MEMBER API
      (Auth / Roles / Org /             (Mắt Bão, Việt Nam)
       Reports / Documents /                  │
       Learning / Notifications /              ▼
       AI-RAG / Innovation /              PostgreSQL
       authorization)                     MEMBER RECORDS
                 │                             │
                 └────────────┬────────────────┘
                               │
                 resolver call: Member API → Supabase
                 Edge Function `resolve-member-scope`
                 (verifies Supabase JWT, returns role/org
                  scope; see mục 13)
```

**Supabase giữ:** Auth, `profiles`, `user_roles`, `organizations`, reports, documents, learning,
notifications, AI/RAG, innovation, mọi authorization hiện có. **Không đổi** — Phase 1–5 không bị
chạm vào.

**Mắt Bão giữ:** member records, member-related PII, member history (nếu cần, mục 16), member
import staging/audit.

**Ràng buộc cứng:** Frontend **không bao giờ** gọi trực tiếp PostgreSQL của Mắt Bão. Mọi truy cập đi
qua Member API. Member API **không bao giờ** tự ý tin role/org do frontend gửi — luôn xác thực lại
qua Supabase (mục 13).

---

## 5. Member data model (MVP)

| Field | Type | Required | Allowed values | Sensitive? | Notes |
|---|---|---|---|---|---|
| `member_id` | UUID | Yes (PK) | — | No | **Technical primary key only.** Sinh tại Member API, không phải Supabase UUID nào. KHÔNG phải số hiệu, mã cán bộ, member number hay bất kỳ business identifier nào — không hiển thị cho người dùng như một mã định danh nghiệp vụ, không mang ý nghĩa, không được dùng để suy ra đơn vị/chức vụ |
| `full_name` | text | Yes | — | Personal | Tên tiếng Việt có dấu |
| `date_of_birth` | date | No (`OPTIONAL_MVP`) | — | Personal | Strongly recommended nếu roster hiện có sẵn dữ liệu; dùng hỗ trợ nhận diện duplicate candidate (mục 10) — KHÔNG dùng như unique key; NULL được phép |
| `gender` | enum | No | `NAM` / `NỮ` / `KHÁC` hoặc NULL | Personal | Chỉ thêm nếu owner xác nhận thực sự cần (mục 28) |
| `work_unit_code` | text | Yes | tham chiếu `organizations.code` (mục 6) | Internal | KHÔNG lưu UUID Supabase trực tiếp |
| `job_title` | text | No | free text ngắn, có validate length | Internal | Chức vụ/chức danh công tác — **tách biệt** `work_unit_code` |
| `member_status` | enum | Yes | `ACTIVE` / `INACTIVE` / `TRANSFERRED` / `ARCHIVED` (mục 17) | Internal | Default `ACTIVE` |
| `political_theory_level` | enum \| NULL | No | `SO_CAP` / `TRUNG_CAP` / `CAO_CAP` / NULL | Sensitive personal | NULL = chưa có thông tin, **không invent giá trị khác** |
| `youth_position` | enum \| NULL | No | `BI_THU` / `PHO_BI_THU` / `UY_VIEN` / NULL | Internal | Chức danh Đoàn — tách biệt Ban Thanh niên |
| `youth_board_position` | enum \| NULL | No | `TRUONG_BAN_THANH_NIEN` / `PHO_BAN_THANH_NIEN` / NULL | Internal | Xem mục 8 về constraint |
| `account_user_id` | UUID \| NULL | No | Supabase `auth.users.id` nếu có | Authorization mapping | Nullable — member không mặc định có account (mục 11) |
| `external_ref_note` | text \| NULL | No | free text ngắn | Internal | Chỗ chứa ghi chú đối soát thủ công khi import — KHÔNG phải khoá dedup (mục 15) |
| `created_at` / `updated_at` | timestamptz | Yes | — | — | Chuẩn convention hiện có |

**KHÔNG có các trường sau** (loại bỏ chủ động theo yêu cầu owner, không khôi phục dưới tên khác):
`police_number`, `personnel_number`, `service_number`, hoặc bất kỳ dạng "số hiệu" nào.

**KHÔNG có** trong MVP vì thuộc "hồ sơ đoàn viên đầy đủ" (ngoài scope, mục 1): đoàn phí, lịch sử
chuyển sinh hoạt (chỉ có `member_status = TRANSFERRED` tĩnh), xếp loại tự động, kỷ luật.

---

## 6. Organization reference model

**Vấn đề:** `organizations` (Supabase) và "work_unit" (Member Record tại Mắt Bão) là hai khái niệm
có thể trỏ tới cùng một đơn vị thật, ở hai hệ thống khác nhau. Cần tránh duplicate taxonomy và
tránh hai nguồn tên đơn vị lệch nhau.

**Ba phương án đã đánh giá:**

| | A — UUID trực tiếp | B — Shadow table đầy đủ | C — Stable external code |
|---|---|---|---|
| Mô tả | `member.work_unit_id = organizations.id` | Mắt Bão có bản sao toàn bộ `organizations` | `member.work_unit_code` tham chiếu `organizations.code` (đã tồn tại, unique) |
| Coupling | Rất cao — Member API phải biết UUID nội bộ Supabase, đổi UUID (hiếm nhưng có thể khi seed/migrate) là vỡ liên kết | Trung bình-cao — hai nguồn dữ liệu phải đồng bộ liên tục, dễ lệch tên/is_active | **Thấp** — chỉ một string ổn định làm khoá |
| Duplicate taxonomy? | Không, nhưng khoá không có ý nghĩa nghiệp vụ (opaque UUID khó đối soát thủ công/import Excel) | Có — đúng thứ owner đã cấm ("không tự quyết PostgreSQL Mắt Bão phải có bản sao toàn bộ organizations") | Không — `code` là business key sẵn có (`organizations.code` đã `unique not null` từ initial schema), Member API chỉ cache tối thiểu code+tên hiển thị |
| Đồng bộ | Không cần đồng bộ, nhưng Excel import khó nhập UUID tay | Cron/webhook đồng bộ liên tục — over-engineer cho pilot 3.000 record | Đồng bộ **lười**: Member API cache `(code, display_name, is_active)` chỉ để hiển thị/validate import, refresh qua resolver call (mục 13), không phải nguồn thẩm quyền |

**Khuyến nghị: Phương án C.** `organizations.code` đã là business key ổn định, unique, đang tồn tại
từ `202607300001_initial_schema.sql`. Member Record lưu `work_unit_code` (text) — con người đọc
được, dùng trực tiếp khi import Excel (owner đã có sẵn tên đơn vị dạng text trong bảng hiện tại,
không phải UUID).

**Thẩm quyền tên/hiển thị:** `organizations` (Supabase) vẫn là **source of truth duy nhất** cho tên
đơn vị. Member API **không** lưu bản sao đầy đủ `organizations` — chỉ một cache tối thiểu, không
thẩm quyền, dùng cho autocomplete/hiển thị, được làm mới qua endpoint đọc-only (Edge Function hoặc
RPC hiện có `is_organization_in_scope`/danh sách org trong scope) — không phải một bảng "shadow"
đồng bộ hai chiều.

**Authorization dùng `code`, không dùng UUID:** Khi Member API cần biết "user X được xem đơn vị
nào", resolver (mục 13) trả về **danh sách `organizations.code`** trong phạm vi user đó (Supabase
tự dịch UUID→code phía trong Edge Function, vì Supabase đã có toàn bộ `organizations` + hàm
`is_organization_in_scope`), không phải UUID. Member API chỉ so sánh string code — không bao giờ
cần biết UUID nội bộ Supabase.

**Immutability contract (bắt buộc, chốt 2026-09-04 revision).** Phương án C chỉ an toàn nếu
`organizations.code` là:

```text
UNIQUE
IMMUTABLE AFTER CREATION
NEVER REPURPOSED
```

Cụ thể:
- **Đổi tên đơn vị không được đổi `code`.** `code` và `name`/`short_name` là hai khái niệm khác
  nhau — display name có thể đổi tự do (đúng vai trò hiện tại của nó), `code` thì không, một khi đã
  được Member API tham chiếu.
- **Merge/split/reorganization đơn vị phải có migration/reconciliation riêng**, không được xử lý
  bằng cách âm thầm đổi `code` của một đơn vị đang tồn tại sang nghĩa mới (repurpose) — đây là thao
  tác hiếm, có chủ đích, cần một task riêng phối hợp cả hai hệ thống, không phải một UPDATE thường.
- **Member subsystem không tự invent `organization code`.** Mọi `work_unit_code` trong Member Record
  phải khớp một `organizations.code` đã tồn tại ở Supabase (validate tại import/tạo mới, mục 10) —
  Member API không được tự sinh code cho một đơn vị "mới" mà Supabase chưa có.
- **Member API không tin `organization code` do browser gửi cho mục đích authorization** — đúng
  nguyên tắc chung của mục 13: scope luôn đến từ resolver (Supabase), không bao giờ từ request của
  client, kể cả khi giá trị đó là một `code` "trông hợp lệ".

**Bằng chứng hiện tại (đã verify với source, không suy đoán):** `organizations` chỉ có
`grant select on table public.organizations to anon, authenticated`
(`202607300001_initial_schema.sql`); **không có INSERT/UPDATE/DELETE grant nào và không có RLS
write policy nào** cho `organizations` ở bất kỳ migration nào tính đến `master@a775a637`. Nghĩa là
hiện tại **chưa tồn tại đường ghi nào** (kể cả cho `SYSTEM_ADMIN`/`YOUTH_ADMIN` qua ứng dụng) có thể
sửa `code`. Đây là bằng chứng ủng hộ Option C là an toàn tại thời điểm này — nhưng đây là một sự
thật về hiện trạng (absence of a write path), không phải một ràng buộc database (không có CHECK/
trigger nào chặn UPDATE nếu ai đó có quyền `service_role` hoặc quyền DB trực tiếp chạy nó).

**Trạng thái ràng buộc:**
```text
ARCHITECTURE CONTRACT NOW
DATABASE ENFORCEMENT IN A LATER IMPLEMENTATION TASK
```
Tài liệu này CHỐT contract ở tầng kiến trúc (bất kỳ tính năng tương lai nào cho phép sửa
`organizations` đều phải tôn trọng bất biến trên, hoặc phải có một reconciliation path phối hợp
Member API). Việc thêm ràng buộc cứng ở tầng database (ví dụ trigger chặn `UPDATE code` sau khi đã
có Member Record tham chiếu) là việc của một implementation task sau này (không phải P5.5-00, và
không migration nào được viết trong task này).

---

## 7. Authorization model — role/scope matrix

Không tạo role mới song song trong Member API. **Member API tái sử dụng `user_roles.role_code`
hiện có của Supabase**, được resolver dịch nghĩa cho ngữ cảnh member-management.

**Export không nằm trong bảng dưới đây — Export bị `DEFERRED` khỏi P5.5 MVP (mục 9, quyết định
2026-09-04).** Lý do: export tạo ra một bản sao thứ cấp lớn của Member PII ra ngoài ranh giới
source-of-truth (Member API/Mắt Bão); Import là requirement, Export thì không mặc định là
requirement. Nếu sau này thêm export, đó là một architecture/security decision riêng (authorization,
masking, audit, file lifecycle) — không tự thêm vào P5.5 MVP.

| Role hiện có (`user_roles.role_code`) | Xem toàn bộ member? | Xem member đơn vị mình? | Sửa | Import | Xoá/Archive | Mặc định thấy PII nhạy cảm (political_theory_level)? |
|---|---|---|---|---|---|---|
| `SYSTEM_ADMIN` (đơn lẻ, không kèm `YOUTH_ADMIN`) | **Không** | **Không** | **Không** | **Không** | **Không** | **Không** |
| `SYSTEM_ADMIN` + `YOUTH_ADMIN` (cùng một người giữ cả hai role) | Theo scope của `YOUTH_ADMIN` đang giữ (xem hai dòng dưới) — quyền kỹ thuật của `SYSTEM_ADMIN` không tự mở rộng scope nghiệp vụ | | | | | |
| `YOUTH_ADMIN` scope-toàn-cục (`scope_organization_id IS NULL`) | Có | Có | Có | Có | Có (archive) | Có, trong scope |
| `YOUTH_ADMIN` scope theo đơn vị | Không | Có (đơn vị mình + đơn vị con theo `is_organization_in_scope`) | Có, trong scope | Có, trong scope | Có, trong scope | Có, trong scope |
| `BRANCH_OFFICER` (Bí thư chi đoàn, ví dụ) | Không | Có, đơn vị mình | **Không** (đề xuất: chỉ xem, không sửa — MVP giữ đơn giản; owner có thể nâng lên "sửa cơ bản" sau) | Không | Không | Có, đơn vị mình (cần xem để nắm tình hình) |
| `MEMBER` | Không | Không (member thường không có nhu cầu quản lý — chỉ Ban TN/Bí thư cần) | Không | Không | Không | Không |
| `INNOVATION_MEMBER` | Không | Không | Không | Không | Không | Không |

**Nguyên tắc:**
- **Least privilege:** mặc định không ai xem được gì; quyền phải được cấp rõ ràng qua `user_roles`
  giống hệt cách các phân hệ khác (reports, documents) đang làm — không có role mới, dùng lại
  `YOUTH_ADMIN`/`BRANCH_OFFICER` hiện có với ý nghĩa mở rộng sang member-management.
- **Fail closed:** thiếu role/scope hợp lệ → 403, không trả rows rỗng kèm 200 (tránh nhầm "không có
  dữ liệu" với "không có quyền").
- **`SYSTEM_ADMIN` không phải Member Data Approver và không tự động là Member PII reader (quyết định
  chốt 2026-09-04, thay cho "MVP tạm thời cho phép" trước đó):** quyền hạ tầng (deploy, secret, DB,
  vận hành/khắc phục sự cố) là một trục quyền hoàn toàn khác quyền nghiệp vụ quản lý đoàn viên.
  `SYSTEM_ADMIN` **chỉ** có bất kỳ quyền Member Management nào (kể cả chỉ xem danh sách, chưa nói
  đến trường nhạy cảm) khi đồng thời giữ `YOUTH_ADMIN` (dual-role, không tạo role mới) — và khi đó,
  quyền/scope áp dụng đúng theo scope của `YOUTH_ADMIN` đang giữ, không phải một quyền "toàn cục" suy
  từ `SYSTEM_ADMIN`. Một quyền emergency/support tường minh (có audit riêng) cho tình huống khắc phục
  sự cố khẩn cấp có thể được thiết kế sau nếu vận hành thực tế cho thấy cần — **không** nằm trong
  scope P5.5-00.
- Không dùng ẩn nút frontend làm authorization — mọi quyết định trên nằm ở Member API (server-side),
  y hệt nguyên tắc đã áp dụng toàn bộ Phase 1–5 (`docs/brain/02-coding-rules.md`).

---

## 8. Chức danh Ban Thanh niên — constraint 1 Trưởng + 2 Phó

Bối cảnh hiện tại: 1 Trưởng Ban Thanh niên, 2 Phó Ban. Đánh giá cách enforce:

- **Không hardcode số lượng vào frontend hay CHECK constraint cứng** (ví dụ
  `CHECK (count(TRUONG_BAN) <= 1)` cấp database) — tổ chức có thể thay đổi (2 Phó có thể thành 1
  hoặc 3), và một constraint cứng sẽ chặn thao tác hợp lệ trong giai đoạn chuyển giao (bổ nhiệm
  người mới trước khi gỡ người cũ).
- **Khuyến nghị:** `youth_board_position` là optional enum field trên member record, **không có
  ràng buộc unique/count ở tầng schema**. Thay vào đó:
  - UI hiển thị cảnh báo mềm (soft warning, không chặn) khi số người giữ `TRUONG_BAN_THANH_NIEN`
    vượt 1 hoặc `PHO_BAN_THANH_NIEN` vượt số owner kỳ vọng (số này để **cấu hình**, không hardcode
    "2" trong code — ví dụ một dòng metadata/config đơn giản, không phải bảng riêng).
  - Audit log (mục 16) ghi rõ mọi thay đổi field này để dễ đối soát nếu có sai sót.
- **Lý do không over-engineer:** đây là tổ chức 3.000 người, thay đổi lãnh đạo Ban TN là sự kiện
  hiếm (không phải hot path), một constraint cứng tạo rủi ro block thao tác hợp lệ lớn hơn lợi ích
  chống lỗi nhập liệu hiếm gặp mà audit log đã đủ khả năng phát hiện sau.

---

## 9. Member API contract (MVP)

Base path đề xuất: `https://<member-api-host>/v1` (host cụ thể là OWNER/INFRA DECISION, mục 28).

| Endpoint | Method | Auth | Scope check | Notes |
|---|---|---|---|---|
| `/members` | GET | Bearer Supabase JWT | Resolved org scope (mục 7) | Pagination, search, filter, sort — xem mục 14 |
| `/members/:id` | GET | Bearer Supabase JWT | Member's `work_unit_code` phải nằm trong scope | 404 nếu không tồn tại HOẶC ngoài scope (không phân biệt, tránh id enumeration) |
| `/members` | POST | Bearer Supabase JWT | Role có quyền tạo trong `work_unit_code` mục tiêu | Validate đầy đủ trước insert |
| `/members/:id` | PATCH | Bearer Supabase JWT | Role có quyền sửa + trong scope | Partial update, audit before/after |
| `/members/:id/archive` | POST | Bearer Supabase JWT | Role có quyền archive + trong scope | Thay cho DELETE vật lý (mục 17) |
| `/members/import` | POST | Bearer Supabase JWT | Role có quyền import + trong scope | Trả `jobId`, xem mục 15 |
| `/members/import/:jobId` | GET | Bearer Supabase JWT | Chủ job hoặc role quản lý | Trạng thái/preview/kết quả job |
| `/member-metadata` | GET | Bearer Supabase JWT | Bất kỳ role có quyền xem member | Trả enum values (`member_status`, `political_theory_level`, `youth_position`, `youth_board_position`) + danh sách `work_unit_code` trong scope (từ cache mục 6) |

**Không có DELETE vật lý trong MVP** — chỉ `archive`. Nếu sau này cần hard delete (ví dụ yêu cầu
pháp lý xoá dữ liệu cá nhân), đó là một RPC riêng có audit + xác nhận kép, không nằm trong P5.5 MVP.

**Không có endpoint export (`/members/export` hoặc tương đương) trong MVP — chủ đích, không phải
thiếu sót.** Export bị `DEFERRED` khỏi P5.5 (xem mục 7, mục 12, mục 28): đây là điểm tạo ra một bản
sao thứ cấp lớn của Member PII ra ngoài ranh giới source-of-truth, trong khi Import là requirement
còn Export thì không mặc định là requirement. Thêm export sau này cần một architecture/security
decision riêng (authorization, masking, audit, file lifecycle), không tự thêm vào P5.5-01…10.

---

## 10. Import Excel contract

**Nguyên tắc cứng:** không "upload xong ghi thẳng DB". Luồng bắt buộc:

```text
upload (file Excel) → parse → validate từng dòng → staging (chưa ghi bảng chính)
    → preview (valid / invalid / possible-duplicate / warning, hiển thị cho người import xem TRƯỚC
      khi commit)
    → confirm (người dùng bấm xác nhận, có thể loại bỏ dòng lỗi) → commit (ghi member records thật)
    → audit (ai import, khi nào, bao nhiêu dòng, job nào)
```

**Import job state machine (bổ sung 2026-09-04 revision).** Mỗi import job có một `import_job_id`
kỹ thuật riêng và trạng thái đi qua đúng một chiều — không over-engineer thêm trạng thái ngoài những
gì cần cho correctness ở quy mô ~3.000 dòng:

```text
UPLOADED           — file đã nhận, chưa parse
    ↓
PARSED              — đã parse xong, đang chạy validate/dedup từng dòng
    ↓
READY_FOR_CONFIRM    — preview sẵn sàng (valid/invalid/possible-duplicate/warning), chờ người dùng
                        xác nhận; job có thể dừng ở đây vô thời hạn hoặc bị CANCELLED
    ↓ (confirm)                              ↓ (người dùng huỷ, hoặc validate phát hiện lỗi nghiêm
COMMITTED            — đã ghi member records   trọng ở toàn bộ file)
  (terminal)                              CANCELLED (terminal)

  (commit transaction lỗi giữa chừng)
    ↓
  FAILED (terminal) — không dòng nào được ghi (xem Atomicity dưới)
```

**Staging job cần lưu (tối thiểu):**
- `import_job_id`, trạng thái hiện tại (theo state machine trên), người tạo, thời điểm, tên file gốc
  (không lưu nội dung file thô vĩnh viễn sau khi xử lý xong — chỉ giữ đủ để hỗ trợ điều tra sự cố
  trong thời gian ngắn, retention cụ thể là OWNER DECISION).
- Từng dòng: `row_number`, dữ liệu đã parse, trạng thái (`VALID` / `INVALID` / `POSSIBLE_DUPLICATE` /
  `WARNING`), lý do nếu invalid/warning.
- Tổng hợp: số dòng valid/invalid/possible-duplicate/warning để preview UI hiển thị trước commit.

**Confirm/commit idempotency (bổ sung 2026-09-04 revision).** `confirm` (chuyển
`READY_FOR_CONFIRM → COMMITTED`) phải **idempotent theo `import_job_id`**:
- Job chỉ có thể rời `READY_FOR_CONFIRM` đúng một lần theo hướng thành công (`→ COMMITTED`) — trạng
  thái là nguồn khoá, không phải một cờ boolean có thể race.
- Nếu `confirm` được gọi lần thứ hai trên một job **đã** `COMMITTED` (double-click, retry sau
  timeout mạng): Member API **không** ghi thêm record, **không** sinh thêm audit row cho việc ghi
  dữ liệu — trả lại đúng kết quả đã có của lần commit trước (job status + số record đã tạo), y hệt
  tinh thần "request lặp trả kết quả hiện có" của `publish_report_campaign` (P2-12) và ownership
  token của `claim_email_queue` (P3-02) đã được review trong dự án này.
- Upload lại **cùng file** một lần nữa tạo một `import_job_id` **mới**, hoàn toàn độc lập (staging
  riêng, preview riêng) — đây không phải vấn đề cần chặn ở tầng file, vì các dòng của job thứ hai sẽ
  tự nhiên được validate/dedup như bất kỳ dòng nào khác, bao gồm khả năng bị đánh dấu
  `POSSIBLE_DUPLICATE` so với các record job đầu đã commit.

**Deduplication — không có "số hiệu", không invent CCCD/passport làm khoá:**

Owner đã chủ động loại bỏ "số hiệu" (mục 5) — nghĩa là **không tồn tại một trường định danh duy nhất
đáng tin cậy** trong dữ liệu hiện có để dedup tự động chắc chắn. Đây là sự thật cần nói rõ, không
giả vờ có unique identifier. Ba trạng thái khi đối chiếu một dòng import (đổi terminology 2026-09-04
để không ngụ ý chắc chắn sai chỗ):

```text
EXACT_EXISTING_RECORD  — dòng import tham chiếu tường minh một member_id đã tồn tại (ví dụ cột
                          "cập nhật cho member" trong file, do người import điền thủ công) — đây là
                          match kỹ thuật thật, không phải suy đoán
POSSIBLE_DUPLICATE      — tín hiệu heuristic (xem bên dưới) — KHÔNG BAO GIỜ là một khẳng định chắc
                          chắn, chỉ là gợi ý cần con người xem lại
NEW                     — không khớp gì, tạo record mới
```

- **Không dùng CCCD/passport** làm dedup key — không nằm trong data model đã chốt (mục 5), và thêm
  vào chỉ để dedup sẽ tái tạo đúng vấn đề "số hiệu nhạy cảm" mà owner vừa loại bỏ.
- **`full_name` + `date_of_birth` không bao giờ được coi là định danh duy nhất toàn cục** — đây chỉ
  là tín hiệu `POSSIBLE_DUPLICATE`, không phải bằng chứng đủ để tự động xác định đây là cùng một
  người. So khớp `(full_name đã chuẩn hoá, date_of_birth, work_unit_code)` chỉ tạo tín hiệu
  `POSSIBLE_DUPLICATE` (trùng cả 3) hoặc `WARNING` (trùng tên+đơn vị nhưng thiếu ngày sinh) — không
  bao giờ tự động nâng cấp thành `EXACT_EXISTING_RECORD`.
- **Không tự động ghi đè hoặc tự động gộp trong mọi trường hợp, kể cả `POSSIBLE_DUPLICATE` có độ
  khớp cao.** Preview hiển thị nghi vấn trùng, người import (có quyền) phải **human review** trước
  khi quyết định: bỏ qua dòng mới / tạo record mới / xem đây là update cho record cũ (chọn thủ công
  `member_id` để merge — lúc đó dòng mới trở thành một `EXACT_EXISTING_RECORD` tường minh do người
  dùng chỉ định, không phải hệ thống tự suy ra).
  Auto-merge sai người không bao giờ xảy ra vì không có đường code nào tự chuyển
  `POSSIBLE_DUPLICATE → merge` mà không qua xác nhận thủ công của người có quyền.
- Đây là **manual reconciliation có hỗ trợ**, không phải uniqueness đảm bảo bằng database — nói rõ
  trong UI ("hệ thống không thể đảm bảo phát hiện 100% trùng lặp nếu thiếu định danh duy nhất").
- Nếu owner sau này quyết định cần một định danh mạnh hơn (khác "số hiệu"), đó là ADR mới, không tự
  quyết trong P5.5-00.

**Atomicity (làm rõ 2026-09-04 revision):** `commit` là **ALL-OR-NOTHING** — một transaction duy
nhất ở PostgreSQL Mắt Bão cho toàn bộ batch đã qua preview/validate. Nếu một dòng bất kỳ (ví dụ dòng
742/3.000) lỗi ở bước commit, **toàn bộ transaction rollback** — 741 dòng trước đó không bị ghi dở,
không có partial-commit dưới bất kỳ hình thức nào. Quy mô pilot (~3.000 dòng, một transaction) ưu
tiên correctness hơn throughput — không cần streaming/batch-commit phức tạp. Job thất bại giữa
chừng chuyển sang `FAILED` (terminal, có thể xem lại lý do), không tạo record một phần; người dùng
sửa dữ liệu và tạo một `import_job_id` mới để thử lại (không "resume" job đã `FAILED`).

---

## 11. Không tạo account cho member (acceptance criterion)

Import 3.000 đoàn viên **không** tạo `auth.users`, **không** tạo `profiles`, **không** gửi 3.000
invitation email — đây là điều kiện chấp nhận bắt buộc, không phải khuyến nghị.

**Mapping có chủ đích khi member sau này được cấp quyền dùng hệ thống:**

- Field `member.account_user_id UUID NULL` (mục 5) — nullable, chỉ set khi có **hành động rõ ràng**
  gán quyền (một cán bộ Đoàn viên được cấp tài khoản để tự nộp báo cáo, ví dụ), không phải mặc định
  của import.
- Việc gán này là một RPC/endpoint riêng (`POST /members/:id/link-account`, không có trong MVP nếu
  chưa có nhu cầu thật — hiện tại hệ thống dùng account do quản trị viên tạo/nhập, không tự đăng ký,
  nên gán member↔account vẫn là thao tác quản trị hiếm, không phải hot path).
- **Không triển khai mapping table riêng trong MVP** — một cột nullable trên member record đủ cho
  quy mô 3.000 record và tần suất gán thấp; nếu sau này cần lịch sử gán/gỡ nhiều lần, nâng cấp lên
  bảng mapping là một migration nhỏ, không phải redesign.

---

## 12. Quyền truy cập Member Management (chi tiết)

Xem ma trận role/scope đầy đủ ở mục 7. Tóm tắt quyết định least-privilege (chốt 2026-09-04):

- **Ai được xem toàn bộ:** `YOUTH_ADMIN` scope-toàn-cục. `SYSTEM_ADMIN` đơn lẻ — **không ai cả**
  (không có quyền Member Management nào nếu không đồng thời giữ `YOUTH_ADMIN`).
- **Ai chỉ xem đơn vị mình:** `YOUTH_ADMIN` scope theo đơn vị, `BRANCH_OFFICER`.
- **Ai được sửa:** `YOUTH_ADMIN` (toàn cục hoặc trong scope). `BRANCH_OFFICER` chỉ xem trong MVP
  (owner decision nếu muốn mở sửa cơ bản sau — mục 28, mục 8).
- **Ai được import:** `YOUTH_ADMIN` (toàn cục hoặc trong scope của org đích).
- **Export:** `DEFERRED` khỏi P5.5 MVP (mục 7, mục 9) — không có ai "được export" vì tính năng này
  chưa tồn tại trong MVP.
- **Ai được xoá/archive:** như sửa — không có hard delete cho ai trong MVP (mục 9, mục 17).
- **`SYSTEM_ADMIN` mặc định thấy PII nhạy cảm?** **Không, tuyệt đối không mặc định** — `SYSTEM_ADMIN`
  không phải Member Data Approver. Quyền kỹ thuật (deploy, secret, DB, khắc phục sự cố) và quyền
  nghiệp vụ (xem/sửa dữ liệu đoàn viên, kể cả `political_theory_level`) là hai trục tách biệt hoàn
  toàn. Một `SYSTEM_ADMIN` muốn thao tác Member Management phải đồng thời được cấp `YOUTH_ADMIN` —
  đây không còn là một owner decision đang chờ, mà là quy tắc mặc định của P5.5 kể từ bản sửa này.

---

## 13. Authorization cross-system — Member API xác minh Supabase JWT

Đây là phần kiến trúc quan trọng nhất về bảo mật. Nguyên tắc: **Member API không bao giờ tin
role/organization/is_admin do frontend gửi lên** — mọi authorization decision phải do server (Member
API, dựa trên xác minh với Supabase) tự tính lại.

```text
Browser
  → Supabase JWT (access token, đã có sẵn từ session hiện tại — không đổi luồng login)
  → gọi Member API kèm `Authorization: Bearer <supabase JWT>`
       │
       ▼
Member API
  → forward JWT tới Supabase Edge Function `resolve-member-scope`
    (server-to-server, KHÔNG qua browser, kèm shared trusted secret
     — cùng pattern `x-cron-secret`/Vault đã dùng ở P3-08)
       │
       ▼
Edge Function `resolve-member-scope` (Supabase, dùng lại `_shared/auth.ts`)
  → requireUser(userClient) — xác minh JWT bằng chính Supabase Auth
    (signature, issuer, audience, expiration đều do Supabase tự kiểm — không
     cần Member API tự làm JWKS verification riêng, tránh trùng lặp logic
     xác minh JWT ở hai nơi)
  → resolve profiles.account_status (phải ACTIVE — account SUSPENDED/ARCHIVED bị từ chối)
  → resolve user_roles (role_code + scope_organization_id)
  → dịch scope_organization_id → danh sách organizations.code trong scope
    (dùng is_organization_in_scope() đã có, KHÔNG cần logic mới)
  → trả về: { user_id, account_status, roles: [{ role_code, org_codes: [...] }] }
       │
       ▼
Member API dùng response này (KHÔNG dùng bất kỳ giá trị nào browser tự gửi) để
authorize request hiện tại theo ma trận mục 7, rồi mới query PostgreSQL Mắt Bão.
```

**So sánh ba phương án authorization bridge (bổ sung 2026-09-04 revision — kết luận không đổi,
chỉ làm rõ tradeoff):**

| | Option A — Edge Function resolver mỗi request (**đã chọn**) | Option B — Member API verify JWT cục bộ (JWKS) + gọi authorization RPC | Option C — JWT custom claims (role/scope nhúng sẵn trong JWT) |
|---|---|---|---|
| Cơ chế | Member API forward JWT → `resolve-member-scope` → Supabase tự xác minh + resolve role/scope mỗi lần | Member API tự verify chữ ký/exp/iss/aud qua JWKS cục bộ, rồi vẫn phải gọi một RPC/API riêng để lấy role/scope hiện tại | Supabase Auth Hook nhúng role/scope vào JWT lúc mint token; Member API chỉ verify JWKS cục bộ, không gọi gì thêm |
| Security | Cao — dùng lại `userClient.auth.getUser(token)`, cơ chế đã được toàn bộ Edge Function hiện có tin cậy | Verify chữ ký hợp lệ, nhưng vẫn cần một round-trip riêng cho phần authorization — không giảm được rủi ro, chỉ tách logic ra hai nơi | Chữ ký hợp lệ (không thể giả mạo), nhưng dữ liệu role/scope bên trong có thể đã lỗi thời |
| **Revocation freshness** | **Xuất sắc** — `profiles.account_status`/`user_roles` được đọc lại mỗi request | Giống Option A nếu không cache role/scope (thì chỉ là A với 2 hop thay vì 1); **vi phạm invariant nếu cache** | **Kém** — role/scope "đông cứng" trong JWT tới khi token refresh (mặc định ~1h của Supabase); revoke/suspend không có hiệu lực ngay |
| Role-change freshness | Xuất sắc, tức thời | Như trên | Kém, như trên |
| Latency | Một network hop thêm (Member API → Edge Function) | Bằng hoặc tệ hơn A (JWKS cục bộ + vẫn cần round-trip cho role/scope) | Tốt nhất — không round-trip — **nhưng chỉ khi chấp nhận đánh đổi freshness ở trên** |
| Availability dependency | Phụ thuộc Supabase Auth + đúng một Edge Function (đã là dependency toàn hệ thống) | Tương tự A, cộng thêm phụ thuộc JWKS endpoint | Thấp nhất khi hoạt động bình thường, nhưng nếu cần vá lỗi freshness (revocation check) thì lại quay về round-trip, mất hết lợi thế |
| Implementation complexity | **Thấp** — tái dùng gần nguyên vẹn `_shared/auth.ts` | Cao hơn — cần xử lý JWKS caching, key rotation, clock skew ở Member API, cho lợi ích ròng gần như bằng 0 so với A | **Cao nhất** — Supabase Auth Hook (Custom Access Token hook) là tính năng CHƯA từng dùng ở đâu trong codebase này; thêm một pattern mới cần review riêng |
| Secret requirements | Một shared secret (Vault, giống pattern P3-08) | Secret tương tự A, cộng JWKS fetch/cache | Không cần shared secret mới, nhưng cần tin cậy cấu hình Auth Hook đúng |
| Cacheability | Không cache (mục dưới) | Có thể cache role/scope — nhưng cache chính là nguồn vi phạm invariant | Bản chất chính là một dạng cache (trong JWT) — đây là vấn đề, không phải tính năng |
| Failure mode | Resolver lỗi/timeout → 401/403 (deny), rõ ràng | Tương tự A nếu không cache | Auth Hook cấu hình sai → claims sai lặng lẽ, không có tín hiệu lỗi rõ ràng — failure mode nguy hiểm hơn |

**Invariant bắt buộc (đối chiếu cả ba phương án):** Member API không bao giờ tin role/JWT
body/header từ browser; không tin `organization_id` do browser gửi; user hết hạn/bị revoke phải
fail closed; profile `SUSPENDED` phải fail closed; scope phải luôn đến từ dữ liệu server-side đáng
tin cậy tại thời điểm request — Option C vi phạm trực tiếp hai invariant cuối trừ khi được vá bằng
một cơ chế bổ sung (short token TTL + forced refresh, hoặc một revocation-check riêng) — mà khi vá
xong thì Option C đã quay về đúng hình dạng round-trip của Option A, chỉ phức tạp hơn (thêm Auth
Hook) mà không có lợi ích ròng.

**Chốt (không đổi so với bản gốc, nay có lập luận đầy đủ):**
```text
P5.5 TARGET = OPTION A
```
cho quy mô pilot hiện tại (~3.000 record, admin tool nội bộ, không phải hệ thống tần suất cao). Có
thể tối ưu latency sau (JWKS cục bộ chỉ cho phần signature/exp — không cache role/scope) **nếu có
bằng chứng thực tế** latency round-trip là vấn đề, không phải suy đoán trước.

**Không cache kết quả authorization (làm rõ invariant fail-closed):** Member API **không**
persistent-cache kết quả `resolve-member-scope` giữa các request, và **không** lưu role/scope vào
database nội bộ như một nguồn thẩm quyền thứ hai (đúng mục 9 — không tạo `member_api_roles` hay
tương đương). Nếu tương lai cần một in-memory micro-cache cho hiệu năng, TTL phải rất ngắn (đơn vị
giây, không phải phút) và đây là một quyết định riêng, có đánh giá lại rủi ro fail-closed, không
phải mặc định của P5.5-00. Hệ quả cụ thể:
- Account bị `SUSPENDED` → resolver từ chối ngay ở lần gọi kế tiếp, không có "grace period" nhờ cache.
- Role bị revoke → không còn hiệu lực nhờ một cache cũ, vì không có cache nào tồn tại theo mặc định.
- Resolver/mạng lỗi (timeout, 5xx, unreachable) → Member API trả **DENY** (401/403), không bao giờ
  fallback "allow" khi không xác minh được — fail closed tuyệt đối, không có exception.

**Shared secret giữa Member API và Edge Function:** provisioning giống hệt pattern
`email_queue_worker_url`/`email_queue_worker_cron_secret` đã có (P3-08) — lưu ở Supabase Vault, không
literal trong migration/code, không commit. Đây chỉ là bảo vệ tầng server-to-server (chống ai đó gọi
thẳng Edge Function này giả làm Member API) — **không** thay thế việc verify JWT của user thật.

**Điều KHÔNG được làm (nhắc lại tường minh):**
- Browser không bao giờ gửi `role`, `organization_scope`, `is_admin` cho Member API rồi được tin.
- Member API không bao giờ trực tiếp query bảng `profiles`/`user_roles` của Supabase (không có
  credential đó) — chỉ qua resolver Edge Function, giữ đúng ranh giới "mọi thao tác đặc quyền qua
  Edge Function/RPC" đã áp dụng toàn dự án.

---

## 14. List/search/filter — hiệu năng và server-side

- **Không tải toàn bộ 3.000 record về browser** rồi filter client-side. `GET /members` luôn
  pagination (limit/offset hoặc keyset theo `(full_name, id)` — theo đúng convention keyset đã dùng
  ở `documentService.listDocuments` để ổn định khi có insert xen giữa).
- **Search tên tiếng Việt:** cần collation/normalize phù hợp dấu tiếng Việt. PostgreSQL
  `unaccent` extension + index trigram (`pg_trgm`) là đủ cho 3.000 record — không cần
  Elasticsearch/OpenSearch (owner đã loại trừ rõ, mục 28).
- **Filter:** `work_unit_code`, `member_status`, `youth_position`, `youth_board_position`,
  `political_theory_level` — tất cả server-side qua query param, có index composite phù hợp
  (`(work_unit_code, member_status)` là truy vấn phổ biến nhất — Ban TN xem đơn vị mình, lọc theo
  trạng thái).
- **Sort:** mặc định `full_name asc`; cho phép sort theo `updated_at desc` để xem thay đổi gần nhất.

---

## 15. (đã trình bày ở mục 10 — Import Excel contract)

---

## 16. Audit contract

**Sự kiện cần audit (tối thiểu):** create, update (field-level before/after cho các field nghiệp vụ:
`work_unit_code`, `youth_position`, `youth_board_position`, `member_status`, `political_theory_level`
— không cần audit thay đổi cosmetic như ghi chú), import (job-level: bao nhiêu dòng, ai, khi nào),
bulk update (nếu có trong tương lai — không có trong MVP endpoints mục 9), archive, restore (nếu
restore được hỗ trợ — xem mục 17).

**Mỗi audit row phải trả lời:** ai (`actor_user_id`, từ resolver mục 13 — không tin actor id do
client tự khai), làm gì (`action`), với member nào (`member_id`), khi nào (`created_at`), giá trị
trước (`before_data`), giá trị sau (`after_data`), và **`import_job_id` (nullable)** khi thay đổi
đến từ một bulk import (mục 10) — cho phép truy ngược một record cụ thể về đúng job đã tạo/sửa nó.
Không cần copy `full_name`/tên hiển thị của actor vào audit row nếu `actor_user_id` đã đủ để trace
ngược (resolver/Supabase vẫn còn giữ profile để tra cứu khi cần điều tra).

**Không log:** JWT, password, secret, toàn bộ nội dung file Excel gốc (chỉ log số dòng/kết quả tổng
hợp của import job, không log từng cell).

**Đặt audit ở đâu — Mắt Bão hay reuse Supabase `audit_logs`?**

**Khuyến nghị: audit đặt tại Member API/PostgreSQL Mắt Bão, KHÔNG dùng chung `audit_logs` của
Supabase.** Lý do:
- Member API là **system of record** cho dữ liệu member — mọi mutation xảy ra trong transaction của
  PostgreSQL Mắt Bão. Nếu audit ghi sang Supabase, đó là một distributed transaction hai database
  không có gì đảm bảo atomic (đúng như mục 16 yêu cầu tránh — "ưu tiên audit không phụ thuộc vào một
  transaction distributed mong manh").
- `actor_user_id` (ai làm) đến từ Supabase (qua resolver, mục 13), nhưng **giá trị này chỉ cần lưu
  làm dữ liệu tham chiếu** (UUID + có thể kèm tên hiển thị tại thời điểm ghi, để audit vẫn đọc được
  ngay cả khi account đó sau này bị đổi/archive ở Supabase) — không cần audit row nằm trong cùng
  transaction với `profiles`.
- Cấu trúc audit table tại Mắt Bão nên đồng dạng với `audit_logs` hiện có ở Supabase (cùng field
  shape: actor, action, entity_type, entity_id, before/after, created_at) để dễ hiểu/vận hành, nhưng
  là **bảng riêng, database riêng** — không phải cùng một bảng.

---

## 17. Delete / archive lifecycle

**Không hard delete Member Record trong MVP.** `member_status` enum tối thiểu, chỉ giữ giá trị thật
sự có yêu cầu:

```text
ACTIVE       — đoàn viên đang sinh hoạt bình thường
INACTIVE     — tạm thời không sinh hoạt (lý do không cần structured — ghi ở note nếu cần)
TRANSFERRED  — đã chuyển sinh hoạt đi nơi khác (KHÔNG có workflow chuyển tiếp — chỉ là trạng thái
               tĩnh đánh dấu, workflow chuyển sinh hoạt đầy đủ ngoài scope, mục 1)
ARCHIVED     — không còn quản lý (ví dụ ra khỏi độ tuổi Đoàn) nhưng giữ lại record cho tra cứu lịch sử
```

Không thêm trạng thái thừa (ví dụ không tách `SUSPENDED` riêng nếu chưa có yêu cầu nghiệp vụ cụ thể
— đây không phải hệ thống kỷ luật, mục 1).

`archive` (endpoint `POST /members/:id/archive`) chuyển `member_status → ARCHIVED`, có audit. Không
xoá bytes. Nếu cần "restore" từ ARCHIVED về ACTIVE, đó là một PATCH `member_status` bình thường, có
audit — không cần endpoint riêng.

---

## 18. Backup / restore contract

Vì Member data nằm ngoài Supabase (không được Supabase managed backup bao phủ), đây là điều kiện bắt
buộc để P5.5 được acceptance — không thể để dữ liệu 3.000 đoàn viên không có backup.
`BLOCKS_RUNTIME_ACCEPTANCE` + `BLOCKS_PRODUCTION` — **không** `BLOCKS_IMPLEMENTATION_START` (xem
mục 28, mục con 2): P5.5-01 vẫn phát triển được schema/API trên môi trường local/rehearsal mà chưa cần
biết SLA backup của gói production; câu trả lời chỉ bắt buộc phải có trước khi P5.5-07/P5.5-09 được
coi PASS và trước khi hệ thống production-ready.

**Tối thiểu cần có (đề xuất, không invent capability của Mắt Bão khi chưa xác nhận gói hosting):**

| Hạng mục | Đề xuất tối thiểu | Trạng thái |
|---|---|---|
| PostgreSQL automated backup | Daily full backup + point-in-time recovery nếu gói Mắt Bão hỗ trợ | **OWNER/INFRA DECISION REQUIRED** |
| Backup frequency | Tối thiểu 1 lần/ngày cho quy mô 3.000 record (không cần liên tục) | Đề xuất, cần xác nhận khả năng thực tế |
| Retention | Tối thiểu 30 ngày rolling; cụ thể hơn tuỳ chính sách | **OWNER/INFRA DECISION REQUIRED** |
| Encrypted backup | Bắt buộc (dữ liệu cá nhân) — at-rest encryption cho backup file | **OWNER/INFRA DECISION REQUIRED** (tuỳ khả năng gói hosting) |
| Restore rehearsal | Phải test restore thật trên môi trường không phải production trước khi go-live (đúng tinh thần "runtime rehearsal" đã áp dụng Phase 3/4/5) | Bắt buộc trước P5.5 acceptance cuối (P5.5-09) |
| RPO (Recovery Point Objective) | Đề xuất ≤ 24h cho pilot (dữ liệu ít thay đổi, không phải hệ giao dịch tần suất cao) | Cần owner xác nhận mức chấp nhận được |
| RTO (Recovery Time Objective) | Đề xuất ≤ vài giờ cho pilot (không phải hệ thống 24/7 critical) | Cần owner xác nhận |

**Checklist cần xác minh trước khi P5.5 coi là production-ready** (không phải trước P5.5-00 —
architecture có thể tiếp tục mà chưa có câu trả lời, nhưng P5.5-07/P5.5-09 không được PASS nếu thiếu):

1. Gói Mắt Bão cụ thể đang dùng có automated backup không, tần suất thế nào?
2. Có point-in-time recovery hay chỉ snapshot theo lịch?
3. Backup có encrypted at rest không?
4. Ai có quyền trigger restore, quy trình xác thực yêu cầu restore là gì?
5. Đã từng test restore thật chưa (không phải chỉ tin tài liệu nhà cung cấp)?

---

## 19. Failure model

| Tình huống | Hành vi bắt buộc |
|---|---|
| Supabase hoạt động, Member API down | Frontend hiện lỗi rõ ràng ("Không thể tải dữ liệu đoàn viên, thử lại sau") ở đúng khu vực Member Management; **không** ảnh hưởng các phân hệ khác (reports/documents/AI vẫn hoạt động bình thường — hai hệ thống độc lập theo thiết kế mục 4) |
| Member API hoạt động, Supabase Auth unavailable | Không request nào tới Member API có thể authorize được (vì cần resolver, mục 13) → toàn bộ Member Management fail closed cùng lúc với phần còn lại của app (Supabase Auth down vốn đã chặn toàn hệ thống) |
| Mắt Bão PostgreSQL unavailable | Member API trả lỗi 503 rõ ràng cho mọi endpoint; **không** fallback sang lưu dữ liệu member ở Supabase (rule cứng — dữ liệu member không bao giờ chạm Supahost) |
| Resolver Edge Function timeout/lỗi | Member API trả **DENY** (401/403) ngay — không có fallback "allow", không có cache resolver nào để dựa vào (mục 13: zero persistent cache theo mặc định) |
| JWT hợp lệ nhưng account vừa `SUSPENDED` | Resolver re-check `profiles.account_status` mỗi request → deny ngay lần gọi kế tiếp, không có grace period (mục 13, mục 22 threat #5) |
| Role vừa bị revoke, request đang bay tới Member API | Không có cache role/scope nào "còn sống" để dựa vào (mục 13) — request kế tiếp luôn resolve lại từ `user_roles` hiện tại |

**Không cache PII member vô hạn ở browser trong mọi trường hợp trên** — xem mục 20.

---

## 20. Caching

Owner: "không thật cần caching cho ~3.000 records". Đồng ý — **mặc định NO COMPLEX CACHE**:

- Không Redis, không cache layer riêng cho Member API trong MVP — PostgreSQL với index đúng
  (mục 14, mục 28) đủ nhanh cho pagination/search/filter ở quy mô này.
- Nếu browser cache bất cứ gì (ví dụ React Query default in-memory cache trong phiên làm việc hiện
  tại): **KHÔNG** toàn bộ dataset member trong `localStorage`, **KHÔNG** `sessionStorage` cho dataset
  member, **KHÔNG** IndexedDB mirror của dữ liệu member trừ khi được duyệt riêng bằng một quyết định
  khác (không phải mặc định P5.5), **KHÔNG** persistent plaintext cache qua reload dưới bất kỳ hình
  thức nào ở trên. Session/in-memory state chỉ giữ dữ liệu cần cho màn hình hiện tại (trang danh
  sách đang xem, chi tiết một member đang mở) — không giữ toàn bộ 3.000 record trong bộ nhớ trình
  duyệt "phòng khi cần sau".
- Logout **hoặc** thay đổi scope (đổi vai trò/đơn vị, nếu tương lai có) phải xoá sạch mọi state
  Member Management đang giữ ở client, đồng bộ với cách `AuthContext` hiện tại xử lý session.
- **Không thiết kế offline Member Management trong MVP** — không service-worker cache riêng cho dữ
  liệu member, không sync-khi-có-mạng-lại. Nếu Member API không truy cập được, UI báo lỗi rõ ràng
  (mục 19), không cố phục vụ dữ liệu cũ từ cache.
- Cache tối đa là in-memory, trong-phiên, mất khi refresh — đúng mức "không over-engineer" owner yêu
  cầu.

---

## 21. AI boundary

**Member PII KHÔNG được gửi Gemini/RAG dưới bất kỳ hình thức nào**, mặc định và không có ngoại lệ
trong P5.5:

- Không tạo embedding cho danh sách đoàn viên.
- Không đưa member records vào `document_chunks`/`knowledge_articles`/pipeline RAG Phase 5.
- Không dùng AI để phân loại/xếp hạng/đánh giá cá nhân đoàn viên.
- Member API và Supabase Phase 5 RAG là **hai pipeline dữ liệu hoàn toàn tách biệt** — không có
  Edge Function hoặc job nào đọc từ Member API rồi feed vào `ask-ai`/`generate-knowledge-article`.

Nếu tương lai có nhu cầu AI liên quan member (ví dụ: gợi ý phân công dựa trên hồ sơ), đó là một
architecture decision mới, ngoài phạm vi P5.5.

---

## 22. Security threat model — top threats & mitigations

| # | Threat | Mitigation |
|---|---|---|
| 1 | Frontend gửi `role`/`org_scope`/`is_admin` giả để bypass quyền | Member API không bao giờ đọc các field này từ request body/header của client — luôn resolve qua Edge Function (mục 13) |
| 2 | Biết `member_id` (UUID) là đủ để đọc dữ liệu | `GET /members/:id` luôn re-check scope; ngoài scope → 404 (không phân biệt "không tồn tại" vs "không có quyền", tránh id enumeration/existence leak) |
| 3 | Cross-org data leak — admin đơn vị A đọc được đơn vị B | Mọi query ở Member API bắt buộc filter theo `org_codes` trả về từ resolver; không có "no filter = xem tất cả" mặc định |
| 4 | JWT hết hạn/không hợp lệ vẫn được chấp nhận | Resolver dùng `userClient.auth.getUser(token)` — Supabase tự kiểm expiry/signature; JWT invalid → resolver trả lỗi → Member API 401 |
| 5 | Account bị suspend/archive vẫn còn quyền vì JWT chưa hết hạn | Resolver luôn re-check `profiles.account_status = ACTIVE` mỗi request (không tin claim trong JWT cũ) — đúng pattern `requireGlobalRole`/`requireScopedRole` hiện có |
| 6 | Member API down/lỗi rò rỉ stack trace/thông tin hệ thống | Error response chuẩn hoá (mã lỗi + message chung), không trả raw exception/SQL error ra client — cùng nguyên tắc `errorResponse` đã có ở `_shared/http.ts` |
| 7 | Import tạo member vào đơn vị ngoài quyền người import | `POST /members/import` validate `work_unit_code` từng dòng nằm trong scope của actor **trước khi** cho vào staging hợp lệ; dòng ngoài scope → `INVALID`, không tự động reroute |
| 8 | Bulk operations (import, tương lai bulk update) vượt scope | Toàn bộ dòng trong một job phải cùng nằm trong scope actor; job chứa dòng ngoài scope bị đánh dấu lỗi cho đúng dòng đó, không abort toàn job một cách mơ hồ |
| 9 | Export trả dữ liệu ngoài scope | **Không áp dụng trong MVP — export bị `DEFERRED`, không có endpoint (mục 9).** Nếu/khi thêm sau, mitigation bắt buộc: export dùng cùng code path filter với list (mục 14), không có "export riêng, quên filter" (bài học từ P2-14: export luôn resolve scope qua RPC, không tin filter client-side) |
| 10 | Audit ghi sai actor (ai đó mạo danh) | `actor_user_id` luôn lấy từ resolver (Supabase xác thực), không bao giờ từ body request |
| 11 | Shared secret giữa Member API và resolver bị lộ | Lưu Vault, không literal trong code/migration — đúng pattern Vault đã dùng P3-08; xoay được độc lập với JWT signing key |
| 12 | Member PII vô tình vào log | Log của Member API chỉ ghi metadata (request id, endpoint, status code, actor id, entity id) — không log request/response body chứa PII, đúng nguyên tắc đã ghi ở P5 Gemini timeout logging decision |
| 13 | Excel import chứa formula injection (CSV/Excel injection khi sau này export lại) | Áp dụng cùng kỹ thuật "formula-neutralized" đã dùng ở `export-report-status` (P2-14) cho mọi export CSV từ member data |

---

## 23. Test matrix (P5.5 acceptance — negative-first)

**Positive (tối thiểu):**
- Actor có quyền đúng scope: list/search/filter/sort trả đúng kết quả, đúng phân trang.
- Actor có quyền tạo/sửa trong scope: thao tác thành công, audit ghi đúng before/after.
- Import hợp lệ toàn bộ: staging → preview đúng số liệu → commit tạo đúng số record → audit job.
- Archive rồi patch lại `ACTIVE`: hoạt động, có audit hai chiều.

**Negative (bắt buộc theo yêu cầu owner, đối chiếu threat model mục 22):**

1. Admin A không đọc được member của org B nếu không có scope rõ ràng.
2. Bí thư chi đoàn A không sửa được member của chi đoàn B.
3. User không spoof được organization identifier (gửi `work_unit_code` khác trong request body khi
   gọi list — server luôn dùng scope từ resolver, bỏ qua tham số này nếu client cố gửi để mở rộng).
4. User không spoof được role.
5. Biết `member_id` (UUID) là không đủ để đọc — phải đúng scope.
6. Account bị archived (Supabase `profiles.account_status != ACTIVE`) không truy cập được Member
   API dù JWT còn hạn.
7. JWT hết hạn bị từ chối.
8. JWT không hợp lệ (sai chữ ký/sai issuer) bị từ chối.
9. Member API unavailable không leak stack trace (response chuẩn hoá).
10. Import không thể tạo member vào đơn vị actor không có quyền.
11. Bulk import tôn trọng scope cho từng dòng, không phải chỉ check một lần đầu job.
12. ~~Export tôn trọng scope giống hệt list.~~ Không áp dụng trong MVP — export bị `DEFERRED` (mục
    9); test case này áp dụng lại nếu/khi export được thêm bằng một decision riêng.
13. Audit ghi đúng actor thật (không phải actor client tự khai).
14. Nếu `BRANCH_OFFICER`/`YOUTH_ADMIN` scope-toàn-cục có quyền toàn cục: đây phải là quyền **được
    cấp rõ ràng** qua `user_roles.scope_organization_id IS NULL`, không phải một nhánh code "nếu
    không có scope thì cho xem hết" (bypass ngầm).

---

## 24. UI information architecture (route/page only — chưa code)

```text
/quan-ly-doan-vien                          — danh sách, RoleGuard: YOUTH_ADMIN | BRANCH_OFFICER
  ├─ search, filter (đơn vị, trạng thái, chức danh Đoàn/Ban TN)
  ├─ member count (theo scope hiện tại)
  ├─ pagination (server-side, mục 14)
  ├─ nút "Thêm đoàn viên" (role có quyền tạo)
  └─ nút "Import Excel" → dẫn tới /admin/quan-ly-doan-vien/import
     (KHÔNG có nút "Export" trong MVP — export bị `DEFERRED`, xem mục 9)

/quan-ly-doan-vien/:memberId                — chi tiết một đoàn viên
  ├─ thông tin cơ bản (full_name, date_of_birth nếu có, work_unit, job_title)
  ├─ chức danh Đoàn / chức danh Ban Thanh niên
  ├─ trình độ lý luận chính trị
  ├─ trạng thái (member_status) + nút archive/restore (role có quyền)
  └─ lịch sử thay đổi (đọc từ audit, chỉ role có quyền quản lý xem — không phải mọi người xem được
     member detail đều thấy audit)

/admin/quan-ly-doan-vien/import             — luồng import Excel, RoleGuard chặt hơn (chỉ role có
                                               quyền import theo mục 12)
  ├─ bước 1: upload
  ├─ bước 2: preview (valid/invalid/possible-duplicate/warning — mục 10)
  └─ bước 3: confirm/commit + kết quả
```

**Role routing — `MemberManagementGuard`, KHÔNG dùng `RoleGuard` as-is (fix 2026-09-04, F1).**
`src/components/Guards.jsx` hiện có `RoleGuard` với logic `roles.includes('SYSTEM_ADMIN') ||
allowedRoles.some(...)` — `SYSTEM_ADMIN` **luôn** đi qua, bất kể `allowedRoles` truyền vào là gì.
Điều này **mâu thuẫn trực tiếp** với quy tắc đã chốt ở mục 7/mục 12: một `SYSTEM_ADMIN` đơn lẻ
(không có `YOUTH_ADMIN`) có **ZERO** quyền Member Management. Dùng `RoleGuard` nguyên trạng cho route
`/quan-ly-doan-vien*` sẽ cho tài khoản đó vào được page shell rồi mới nhận hàng loạt lỗi 403 từ
Member API — không lộ dữ liệu (backend vẫn đúng), nhưng là một trạng thái UX sai và mơ hồ, không
phải một `FORBIDDEN` rõ ràng.

**Quyết định:** Member Management dùng một guard riêng, khái niệm `MemberManagementGuard`, **không**
tái sử dụng `RoleGuard` nguyên trạng cho các route này (không cần viết component trong P5.5-00 — đây
là quyết định kiến trúc, code thuộc P5.5-06):
- Điều kiện qua guard: `roles.includes('YOUTH_ADMIN') || roles.includes('BRANCH_OFFICER')` — **không**
  có nhánh `SYSTEM_ADMIN` tự động qua. Dữ liệu `roles` đã có sẵn từ `AuthContext` (không cần thêm
  network call ở frontend) — guard này thuần là so khớp danh sách role hiện có với route, cùng độ
  phức tạp với `RoleGuard` gốc, không phải một cơ chế mới nặng hơn.
- `SYSTEM_ADMIN` không kèm `YOUTH_ADMIN`/`BRANCH_OFFICER` → guard trả về trạng thái **`FORBIDDEN`**
  tường minh ngay tại route (thông điệp kiểu "Cần quyền `YOUTH_ADMIN` để truy cập Quản lý đoàn
  viên"), **không** render page shell rồi để mỗi lệnh gọi Member API tự trả lỗi rời rạc.
- **Frontend guard chỉ là UX boundary, không phải security boundary.** Đây không phải "ẩn nút thay
  cho bảo mật" (nguyên tắc mục 7 vẫn giữ nguyên) — `MemberManagementGuard` chỉ tránh cho người dùng
  một trải nghiệm tệ (vào trang rồi gặp lỗi liên tục); **Member API (backend) vẫn là trust boundary
  thật sự** và **bắt buộc** tự re-check toàn bộ authorization qua resolver (mục 13) trên **mọi**
  request, kể cả khi frontend guard có bug hoặc bị bypass bằng cách gọi thẳng API. Nếu
  `MemberManagementGuard` có sai sót và lỡ cho một `SYSTEM_ADMIN` đơn lẻ vào trang, Member API vẫn
  phải deny toàn bộ — không có kịch bản nào frontend guard là tuyến phòng thủ duy nhất.
- `RoleGuard` gốc **không đổi** và tiếp tục dùng cho mọi route khác của ứng dụng (reports, documents,
  learning...) — đây không phải một thay đổi toàn cục, chỉ Member Management cần logic chặt hơn vì
  đây là dữ liệu PII nhạy cảm mà `SYSTEM_ADMIN` explicitly không có quyền nghiệp vụ.

**Mobile-first:** danh sách dùng card list (giống pattern `Documents.jsx`/`AdminReports.jsx` hiện
có) thay vì bảng rộng cứng nhắc trên màn hình nhỏ. Member detail là trang riêng có URL
(`/quan-ly-doan-vien/:memberId`), **không** nhồi toàn bộ vào modal — đúng nguyên tắc "mỗi nội dung
một URL" đã áp dụng toàn dự án (router thật, deep-link được).

---

## 25. Performance target (pilot ~3.000 records)

| Thao tác | Target | Cơ sở |
|---|---|---|
| List (trang đầu, có filter) | < 300ms server-side (không tính network) | Index composite `(work_unit_code, member_status)` + pagination, PostgreSQL xử lý dễ dàng ở 3.000 rows |
| Search theo tên | < 300ms | `pg_trgm` + `unaccent` index, dataset nhỏ |
| Import 3.000 dòng (một lần, pilot) | Vài giây tới dưới 1 phút cho toàn bộ parse+validate+preview; commit transaction dưới vài giây | Không cần streaming/batch phức tạp ở quy mô này — một transaction PostgreSQL xử lý 3.000 insert bình thường |
| Detail (1 record) | < 100ms | PK lookup |

**Không thiết kế Elasticsearch/OpenSearch, không distributed architecture, không sharding.**
PostgreSQL với index đúng đủ cho toàn bộ pilot và nhiều năm tăng trưởng tiếp theo trước khi cần xem
lại (owner đã xác nhận không thiết kế cho hàng triệu người).

---

## 26. Proposed P5.5 decomposition

Sau khi review kiến trúc hiện tại (auth pattern, RLS/RPC boundary, trusted-secret pattern P3-08,
scoped read model pattern P2-13/P4-05), đề xuất decomposition theo đúng dependency — mỗi subphase là
một branch riêng (`docs/brain/02-coding-rules.md`: "Mỗi phase một branch"):

### P5.5-01 — Member service foundation
- **Objective:** Dựng PostgreSQL schema tại Mắt Bão (bảng `members`, enum types mục 5) +
  Member API skeleton (routing, health check, config/secret loading) trên hạ tầng thật đã xác nhận
  (mục 28).
- **Dependencies:** P5.5-00 (tài liệu này) được review; owner đã trả lời mục 28.1
  (`BLOCKS_IMPLEMENTATION_START` — hạ tầng Mắt Bão cụ thể) và hạ tầng đó đã provisioned. Mục 28.2
  (backup capability) **không** phải dependency của P5.5-01.
- **Code surface:** repo Member API mới (ngôn ngữ/runtime — OWNER DECISION mục 28) + migration đầu
  tiên PostgreSQL Mắt Bão.
- **Security contract:** chưa expose endpoint công khai nào — chỉ nội bộ/health check.
- **Tests:** schema constraint test, enum validation test.
- **Acceptance:** schema tồn tại, migrate lên xuống được, health check trả 200.

### P5.5-02 — Auth bridge / scope authorization
- **Objective:** Edge Function `resolve-member-scope` (Supabase) + client xác thực trong Member API
  (mục 13).
- **Dependencies:** P5.5-01.
- **Code surface:** `supabase/functions/resolve-member-scope/`, Member API middleware gọi resolver.
- **Security contract:** toàn bộ threat #1, #4, #5, #11 (mục 22) phải có test.
- **Tests:** JWT hợp lệ/hết hạn/sai chữ ký, account suspended, scope dịch đúng `organizations.code`.
- **Acceptance:** mọi request tới Member API (kể cả stub endpoint) đều qua được authorization thật,
  không có bất kỳ đường bypass nào.

### P5.5-03 — Member CRUD
- **Objective:** `GET/POST/PATCH /members`, `/members/:id`, `/members/:id/archive` (mục 9).
- **Dependencies:** P5.5-02; owner đã trả lời mục 28.8 (`NON_BLOCKING_OWNER_DECISION` —
  `BRANCH_OFFICER` view-only hay được sửa) — bắt buộc phải chốt trước khi viết
  `PATCH /members/:id` vì nó quyết định trực tiếp permission matrix của endpoint này.
- **Code surface:** Member API route handlers + validation layer.
- **Security contract:** threat #2, #3, #6, #10 (mục 22).
- **Tests:** CRUD happy path + toàn bộ negative test #1–#6, #9, #10 liên quan (mục 23).
- **Acceptance:** CRUD hoạt động đúng scope, archive thay hard delete, audit ghi đầy đủ (đồng thời
  với P5.5-07 nếu audit implement chung).

### P5.5-04 — Search/filter/list
- **Objective:** Pagination/search/filter/sort server-side (mục 14).
- **Dependencies:** P5.5-03.
- **Code surface:** query layer + index migration (`pg_trgm`, `unaccent`, composite index).
- **Security contract:** filter luôn áp scope trước, không có "filter rỗng = xem hết".
- **Tests:** performance target mục 25 (dataset synthetic ~3.000 dòng), scope-filtered search.
- **Acceptance:** đạt target hiệu năng mục 25 trên dataset synthetic tương đương pilot.

### P5.5-05 — Excel import
- **Objective:** Toàn bộ luồng mục 10 (staging → preview → commit) + dedup soft-match.
- **Dependencies:** P5.5-03, P5.5-02 (scope check cho import).
- **Code surface:** import job service, file parser, staging tables.
- **Security contract:** threat #7, #8, #13 (mục 22).
- **Tests:** file hợp lệ, file lỗi định dạng, dòng trùng, dòng ngoài scope, transaction atomicity
  khi commit thất bại giữa chừng.
- **Acceptance:** import 3.000 dòng synthetic thành công, preview chính xác, không partial-commit.

### P5.5-06 — Admin/member frontend
- **Objective:** Route/page mục 24 (`/quan-ly-doan-vien*`), gọi Member API qua service layer mới
  (`src/services/memberService.js` kiểu factory giống `createReportService`/`createDocumentService`
  hiện có).
- **Dependencies:** P5.5-03, P5.5-04, P5.5-05.
- **Code surface:** `src/pages/AdminMembers*.jsx` hoặc tên tương đương, `src/services/memberService.js`.
- **Security contract:** ẩn nút không phải bảo mật — mọi enforcement đã ở Member API; frontend chỉ
  UX.
- **Tests:** unit test cho pure helper (nếu có, theo pattern `status.mjs`), không cần E2E đầy đủ ở
  bước này (để P5.5-09).
- **Acceptance:** UI hoạt động qua Member API thật (không mock), responsive mobile-first.

### P5.5-07 — Audit + backup/restore
- **Objective:** Audit table + ghi tại mọi mutation (mục 16); xác nhận & thiết lập backup/restore
  contract (mục 18) trên hạ tầng Mắt Bão thật.
- **Dependencies:** P5.5-01 (schema), song song được với P5.5-03–06 nếu audit ghi ngay từ đầu (
  khuyến nghị: audit đi kèm P5.5-03, không tách rời để tránh CRUD thiếu audit tạm thời).
- **Code surface:** audit table + write path trong mọi mutation; backup configuration (hạ tầng, có
  thể không phải "code" thuần).
- **Security contract:** threat #12 (không log PII).
- **Tests:** mọi mutation endpoint có audit row tương ứng đúng before/after.
- **Acceptance:** checklist backup mục 18 có câu trả lời (không còn "OWNER/INFRA DECISION REQUIRED"
  treo); restore rehearsal thật đã chạy trên môi trường không phải production.

### P5.5-08 — Security acceptance
- **Objective:** Chạy toàn bộ threat model mục 22 + test matrix mục 23 như một acceptance pass độc
  lập (tương tự P2-15/P4-06 "final acceptance" đã làm ở các phase trước).
- **Dependencies:** P5.5-02 đến P5.5-07.
- **Code surface:** test suite tổng hợp, không code nghiệp vụ mới trừ khi phát hiện gap.
- **Security contract:** toàn bộ 13 threat + 14 negative test case phải PASS.
- **Acceptance:** `PHASE_5_5_SECURITY_ACCEPTANCE_PASS`.

### P5.5-09 — Runtime rehearsal
- **Objective:** Chạy thật trên actor thật (giống P4-02R/P4-04R2) trên môi trường rehearsal không
  phải production — bao gồm restore rehearsal thật (mục 18).
- **Dependencies:** P5.5-08.
- **Code surface:** không code mới, chỉ vận hành/kiểm chứng.
- **Acceptance:** `PHASE_5_5_RUNTIME_READINESS_PASS`.

### P5.5-10 — End-to-end acceptance
- **Objective:** Đóng Phase 5.5, cập nhật `docs/brain/*`, quyết định mở Phase 6.
- **Dependencies:** P5.5-09.
- **Acceptance:** `PHASE_5_5_END_TO_END_ACCEPTANCE_PASS` — điều kiện duy nhất để bắt đầu business
  implementation Phase 6 (mục 27).

---

## 27. Phase 6 gate

```text
PHASE_6_BUSINESS_IMPLEMENTATION_MUST_NOT_START
until
PHASE_5_5_END_TO_END_ACCEPTANCE_PASS
```

Ngoại lệ tường minh: security remediation cho scaffold `innovation_*` hiện có (nếu owner yêu cầu
riêng) có thể được thực hiện như một **security fix độc lập**, **không** được coi là bắt đầu Phase 6,
và **không nằm trong scope P5.5-00 này** — không có thay đổi nào tới scaffold Phase 6 trong task này.

```text
Phase 5 → Phase 5.5 → Phase 6 → Phase 7
```

---

## 28. Owner decisions needed

Chỉ liệt kê những gì không thể tự xác minh từ code/docs hiện có. Mỗi mục được gắn đúng một nhãn
theo taxonomy thống nhất (fix 2026-09-04, đóng mâu thuẫn trước đó nói backup vừa chặn vừa không
chặn P5.5-01):

```text
BLOCKS_IMPLEMENTATION_START   — P5.5-01 không thể bắt đầu viết code/schema nếu thiếu
BLOCKS_RUNTIME_ACCEPTANCE     — không chặn viết code, nhưng chặn P5.5-08/P5.5-09 PASS
BLOCKS_PRODUCTION             — không chặn implementation/runtime rehearsal, chỉ chặn go-live thật
NON_BLOCKING_OWNER_DECISION   — không chặn subphase nào ngay, chỉ cần chốt trước khi phần liên quan
                                 được viết
```

1. **`BLOCKS_IMPLEMENTATION_START`** — Hạ tầng Mắt Bão cụ thể: gói/sản phẩm chính xác, PostgreSQL
   availability (managed hay tự cài), runtime khả dụng cho Member API (Node/Deno/Python/khác).
   **Lý do:** P5.5 đã chốt kiến trúc Member data/API trên hạ tầng Mắt Bão; không được giả định
   PostgreSQL/runtime/API hosting tồn tại khi chưa xác minh — quyết định này định hình trực tiếp
   code surface của P5.5-01 (ngôn ngữ/runtime, connection string, migration tool). **Đây là blocker
   thật sự duy nhất cho việc bắt đầu P5.5-01.**
2. **`BLOCKS_RUNTIME_ACCEPTANCE` + `BLOCKS_PRODUCTION`, KHÔNG `BLOCKS_IMPLEMENTATION_START`** —
   Backup capability thật của gói Mắt Bão đang/sẽ dùng (mục 18). P5.5-01 vẫn viết được schema/API
   trên môi trường local/rehearsal phù hợp mà chưa cần biết SLA backup cụ thể của gói production;
   nhưng câu hỏi này **bắt buộc** phải có câu trả lời trước khi P5.5-07 (audit + backup/restore) và
   P5.5-09 (runtime rehearsal) được coi là PASS, và trước khi hệ thống được coi production-ready.
   Không thể invent — cần owner hoặc bên hạ tầng xác nhận.
3. **`BLOCKS_RUNTIME_ACCEPTANCE` / `BLOCKS_PRODUCTION` (tuỳ kiến trúc thực tế triển khai), KHÔNG
   `BLOCKS_IMPLEMENTATION_START`** — Domain/TLS arrangement cho Member API (subdomain riêng? qua
   Vercel rewrite? trực tiếp domain Mắt Bão?) — ảnh hưởng CORS/cấu hình frontend gọi Member API khi
   chạy thật, không chặn viết schema/code cục bộ. Không tự bịa hostname/domain trong bất kỳ code hay
   config nào trước khi có câu trả lời — dùng placeholder/biến môi trường, không hardcode.
4. ~~`date_of_birth` có bắt buộc không?~~ **RESOLVED (2026-09-04 revision):** `OPTIONAL_MVP`, không
   `REQUIRED` — xem mục 5. Owner có thể ghi đè thành bắt buộc sau nếu có nhu cầu nghiệp vụ cụ thể.
5. **`NON_BLOCKING_OWNER_DECISION`** — `gender` có thực sự cần không? Đã để optional/loại trừ nếu
   owner xác nhận không cần. Không chặn P5.5-01: data model mục 5 đã thiết kế field này là optional
   enum \| NULL ngay từ đầu, nên P5.5-01 tạo schema có `gender` (nullable) hay bỏ hẳn cột này lúc
   khởi tạo đều là một migration `ADD COLUMN`/`DROP COLUMN` đơn giản không phá dữ liệu — không có
   nhánh nào của quyết định này buộc phải sửa lại schema đã có sau khi owner trả lời.
6. ~~Member export có bắt buộc trong MVP không?~~ **RESOLVED (2026-09-04 revision):** Export bị
   `DEFERRED` khỏi P5.5 MVP theo mặc định — xem mục 9/mục 24. Owner có thể yêu cầu thêm sau như một
   architecture/security decision riêng.
7. ~~`SYSTEM_ADMIN` có mặc định thấy `political_theory_level` không?~~ **RESOLVED (2026-09-04
   revision):** Không mặc định — `SYSTEM_ADMIN` chỉ thấy Member PII nếu đồng thời có `YOUTH_ADMIN`
   (hoặc quyền emergency/support tường minh thiết kế sau) — xem mục 7/mục 12.
8. **`NON_BLOCKING_OWNER_DECISION`** — `BRANCH_OFFICER` có được sửa member đơn vị mình không, hay
   MVP chỉ cho xem (mục 7)? Không chặn P5.5-01 (schema/auth-bridge không phụ thuộc câu trả lời này).
   **Nhưng phải chốt trước khi P5.5-03 (Member CRUD) bắt đầu viết endpoint** — endpoint permission
   chính xác cho `PATCH /members/:id` phụ thuộc trực tiếp quyết định này.

**Chỉ mục 1 là `BLOCKS_IMPLEMENTATION_START` thật sự.** Mục 2–3 chặn runtime/production, không chặn
việc bắt đầu viết code. Mục 5, 8 là `NON_BLOCKING_OWNER_DECISION` với hạn chốt riêng (8 phải xong
trước P5.5-03, 5 không có hạn chặn vì schema đã cho phép defer). Mục 4, 6, 7 đã `RESOLVED`.

---

## 29. Next task

**P5.5-01 — Member service foundation** (mục 26): dựng schema PostgreSQL tại Mắt Bão + skeleton
Member API, **chỉ sau khi** owner xác nhận mục 28.1 (hạ tầng Mắt Bão cụ thể — `BLOCKS_IMPLEMENTATION_
START`), vì quyết định này định hình toàn bộ code surface của P5.5-01 (runtime, connection string,
migration tool). Mục 28.2 (backup capability) **không** chặn P5.5-01 bắt đầu — chỉ bắt buộc phải có
câu trả lời trước P5.5-07/P5.5-09 (xem mục 28).
