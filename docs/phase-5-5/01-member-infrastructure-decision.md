# P5.5-01 pre-req — Member Management hosting/runtime decision

> Trạng thái: **INFRASTRUCTURE ARCHITECTURE DECISION** — không phải implementation, không phải
> provisioning. Đóng câu hỏi mục 28.1 (`BLOCKS_IMPLEMENTATION_START`) của
> `docs/phase-5-5/00-member-management-architecture.md` ở mức **quyết định sản phẩm/kiến trúc**;
> **không** đóng ở mức **đã mua/đã provisioned** — việc mua dịch vụ nằm ngoài phạm vi task này và
> chưa được thực hiện.

## 1. Context

`docs/phase-5-5/00-member-management-architecture.md` (P5.5-00, đã merge-ready qua PR #38) chốt
kiến trúc: Member Record (~3.000 bản ghi) sống ở một **Member API + PostgreSQL** tại **Mắt Bão
(Việt Nam)**, tách biệt hoàn toàn khỏi Supabase. Tài liệu đó **không** chọn sản phẩm hosting cụ thể
của Mắt Bão — mục 28, mục con 1 để ngỏ câu hỏi này và gắn nhãn `BLOCKS_IMPLEMENTATION_START`: P5.5-01
không thể xác định ngôn ngữ/runtime, connection string, migration tool nếu chưa biết chạy trên hạ
tầng cụ thể nào.

Owner-side research trước đó nêu ứng viên `Mắt Bão Vibe Host v2` với một danh sách tính năng tự ghi
nhận. Task này xác minh độc lập danh sách đó bằng nguồn chính thức, so sánh với hai phương án khác,
và ra quyết định kiến trúc — **không code, không migration, không mua dịch vụ**.

## 2. Requirements (từ P5.5-00, không đổi)

- Backend runtime chạy được một HTTP API dài hạn (long-running), không phải chỉ static site.
- PostgreSQL managed hoặc tự cài, đủ để lưu ~3.000 member record + audit + import job staging.
- Secret/connection string không được lộ ra frontend, không commit vào Git.
- Custom domain + TLS cho Member API khi chạy thật (không bắt buộc ngay ở giai đoạn code).
- Backup/restore khả thi ở mức tối thiểu (đã phân loại `BLOCKS_RUNTIME_ACCEPTANCE` +
  `BLOCKS_PRODUCTION`, không chặn implementation start — giữ nguyên, xem mục 9 bên dưới).
- **Không** trộn Member data vào Supabase chỉ vì tiện (mục 13 tài liệu này).
- Không overprovision cho quy mô ~3.000 record, CRUD/import/audit workload thấp.

## 3. Official sources checked

Ưu tiên nguồn chính thức `matbao.net` / `wiki.matbao.net` theo đúng yêu cầu; không dùng blog bên
thứ ba làm nguồn quyết định khi có nguồn chính thức. Các trang wiki/pricing của Mắt Bão không hiển
thị ngày xuất bản/cập nhật công khai — ghi nhận thời điểm truy cập: **2026-09-04**.

| # | URL | Dùng để xác minh |
|---|---|---|
| 1 | `wiki.matbao.net/huong-dan-su-dung-trien-khai-website-nhanh-de-dang-nen-tang-deploy-website-tu-dong-tren-nen-tang-vibe-host-v2/` | Vibe Host v2 — deploy flow, database, env var, domain/SSL, backup, logs |
| 2 | `matbao.net/hosting/vibe-hosting.html` | Vibe Host v2 (thương hiệu hiển thị "Vibe Hosting") — pricing tier, container isolation, env var encryption, background services, rollback |
| 3 | `wiki.matbao.net/kb/danh-sach-day-du-cac-goi-dich-vu-cloud-server/` | Cloud Server Linux — package CPU/RAM/storage, quản trị qua SSH |
| 4 | `wiki.matbao.net/kb/huong-dan-su-dung-nodejs-va-xu-ly-cac-loi-co-ban/` | Hosting Linux Premium — cơ chế chạy Node.js qua cPanel |
| 5 | `wiki.matbao.net/kb/huong-dan-quan-tri-dich-vu-hosting-linux-premium/` | Hosting Linux Premium — cPanel, SSL, quản trị chung |
| 6 | Kết quả tìm kiếm chỉ ra trang "Cloud Hosting Linux là gì" (wiki.matbao.net) | Xác nhận cPanel hỗ trợ MySQL **và** PostgreSQL như một tính năng chung của phần mềm cPanel (không riêng cho gói Mắt Bão) |

**Ghi chú phương pháp:** nguồn 1–5 được truy xuất trực tiếp; nguồn 6 chỉ có qua kết quả tìm kiếm
tổng hợp, không truy xuất được trang gốc để trích dẫn chính xác 100% — xử lý như bằng chứng yếu hơn
(xem mục 5, PostgreSQL trên Premium Hosting).

## 4. Option matrix

| Tiêu chí | A. Vibe Host v2 (PaaS) | B. Cloud Server Linux (VPS) | C. Hosting Linux Premium (cPanel) |
|---|---|---|---|
| PostgreSQL availability | **VERIFIED** — managed, chọn được PostgreSQL 16, connection string cấp một lần | Không managed — tự cài qua SSH | **NOT VERIFIED cho gói Mắt Bão cụ thể**; chỉ xác nhận cPanel *nói chung* hỗ trợ PostgreSQL, nhiều shared host tắt module này |
| Node.js backend runtime (long-running API) | **VERIFIED (mức tồn tại)** — container riêng/app, autodetect Node.js, "dịch vụ chạy nền" theo tier | Có — full OS, tự cài Node bất kỳ version | **KHÔNG PHÙ HỢP** — chỉ qua cPanel "Setup Node.js App" (Passenger-style), yêu cầu **restart thủ công** sau mọi thay đổi code/package, route qua `.htaccess`/Apache proxy |
| Container/process isolation | Có — mỗi app một container riêng, CPU/RAM riêng | Không (toàn VPS là 1 process space, tự quản) | Không — shared cPanel account |
| Environment-secret handling | **VERIFIED** — biến môi trường quản lý trong UI, mã hoá AES-256 trước khi lưu DB, kể cả vận hành viên không đọc được plaintext | Tự quản (file `.env`/systemd env — không có cơ chế mã hoá nền tảng) | Không tài liệu hoá |
| Custom domain / TLS | **VERIFIED** — trỏ domain qua DNS, Let's Encrypt tự động, có auto-renewal | Tự cấu hình (Nginx + Certbot thủ công) | Có, qua cPanel (SSL miễn phí, mọi gói) |
| Automatic deployment / GitHub | **VERIFIED** — GitHub connect, Git URL, Vercel import, `.zip`, dán HTML; auto build khi push | Không — tự dựng CI/CD | Không có Git-based deploy tài liệu hoá |
| Database backup (managed) | **VERIFIED (mức tồn tại)** — snapshot thủ công + lịch Daily/Weekly/Monthly, Restore/Download 1-click | Không managed — tự viết `pg_dump` cron | Không tài liệu hoá riêng cho DB (chỉ có backup cPanel tổng thể ở một số gói, không xác minh trong task này) |
| Resource scaling | Slider/tier cố định (Starter/Basic/Pro), không tuỳ biến tự do | Tuỳ biến rộng (CS1→CS16, 1→12 core, 1→24GB RAM) | Cố định theo gói shared hosting |
| Operational burden (OS) | **Thấp** — PaaS, không quản lý OS | **Cao** — tự vá lỗi/patch/security OS | Thấp (nhà cung cấp quản lý) nhưng **không phù hợp use-case** |
| Database administration burden | **Thấp** — managed, connection string sẵn | **Cao** — tự cài đặt/patch/tối ưu PostgreSQL | Không áp dụng (không xác minh có Postgres) |
| Network control (firewall/private networking) | `PRIVATE_DATABASE_NETWORKING_NOT_VERIFIED` (mục 7) | Có khả năng (full OS, iptables/ufw tự cấu hình) nhưng không tài liệu hoá tính năng platform-native | Không áp dụng |
| Production suitability cho MVP CRUD (~3.000 record) | **Phù hợp** — đúng quy mô, đúng loại tải (CRUD/import/audit, không high-throughput) | Dư khả năng nhưng đội chi phí vận hành không cần thiết cho MVP | **Không phù hợp** (runtime model) |
| Fit với ràng buộc kiến trúc P5.5 (mục 13 — không trộn Supabase) | Phù hợp — độc lập hoàn toàn với Supabase | Phù hợp | Không áp dụng (bị loại ở tiêu chí runtime) |

## 5. Vibe Host v2 — xác minh cụ thể

### Runtime

- **VERIFIED (mức tồn tại):** nền tảng tự nhận diện framework khi deploy — tài liệu liệt kê rõ
  "Node.js, React, Python, PHP,…". Trang pricing chính thức mô tả mỗi tier cho phép chạy tối đa
  2/5/10 **"dịch vụ chạy nền"** — thuật ngữ này chỉ có ý nghĩa nếu nền tảng hỗ trợ tiến trình
  backend thường trực (persistent background process), không chỉ static hosting.
- **NOT VERIFIED:** không có tài liệu mô tả chi tiết process model (single process? worker pool?),
  health-check cấu hình, restart policy khi process crash, hay port-exposure model cụ thể (app tự
  bind port nào, nền tảng route ra sao). Đây là chi tiết vận hành production, không phải "có tồn
  tại hay không" — xếp vào `BLOCKS_RUNTIME_ACCEPTANCE`, không phải `BLOCKS_IMPLEMENTATION_START`
  (mục 11).
- Logs: 200 dòng console gần nhất hiển thị trong UI — không xác minh được retention dài hạn/export
  log ra ngoài.
- Redeploy: "Triển khai lại (Re-deploy)" + rollback 1-click về version trước, dữ liệu được giữ
  nguyên qua các lần redeploy (theo trang pricing).

### PostgreSQL

- **VERIFIED:** tạo được PostgreSQL (chọn version, ví dụ PostgreSQL 16) trong cùng giao diện quản
  lý database của Vibe Host v2, cùng MySQL/MongoDB/Redis.
- **VERIFIED:** cấp Connection String (URI) sau khi tạo; mật khẩu database chỉ hiển thị **một lần
  duy nhất** (best-practice bảo mật, nhưng cũng có nghĩa: mất là phải reset, cần lưu secret đúng
  cách ngay từ đầu — không lưu plaintext trong chat/note thường).
- **NOT VERIFIED:** dung lượng lưu trữ riêng cho database (trang pricing chỉ ghi "storage" theo
  tier — 1GB/4GB/8GB — không rõ đây là storage tổng cho toàn project hay tách riêng cho DB).
- pgvector/pgcrypto/uuid extension: **NOT VERIFIED** có sẵn hay không. **Không cần thiết** cho
  Member Management (đã xác nhận P5.5-00 mục 20/21: Member data không dùng pgvector, không liên
  quan RAG) — nếu Vibe Host có pgvector, ghi rõ **NOT REQUIRED** cho use-case này, không phải một
  yêu cầu.
- SSL/TLS cho kết nối database: **NOT VERIFIED** — tài liệu không nói rõ connection string có bắt
  buộc `sslmode=require` hay tuỳ chọn.

### Member API runtime decision

Với bằng chứng trên, **runtime tồn tại** (Node.js + PostgreSQL managed) nhưng **chi tiết vận hành
production chưa đầy đủ tài liệu công khai**. Theo đúng nguyên tắc mục 14/20 của yêu cầu gốc (không
biến production detail thành implementation-start blocker khi chưa cần cho việc viết schema/API
cục bộ/rehearsal):

```text
VIBE_HOST_V2_ACCEPTED_FOR_MEMBER_RUNTIME
```

Bảng minh chứng tối thiểu:

| Hạng mục | Trạng thái |
|---|---|
| Node backend runtime | VERIFIED (mức tồn tại; process-lifecycle detail NOT VERIFIED — runtime-gated) |
| PostgreSQL | VERIFIED |
| Persistent DB (giữ dữ liệu qua redeploy) | VERIFIED |
| Secret/env mechanism | VERIFIED (AES-256 at rest, không đọc được plaintext kể cả vận hành viên) |
| TLS/domain | VERIFIED (Let's Encrypt tự động) |
| Basic backup capability | VERIFIED (mức tồn tại; retention/encryption/PITR NOT VERIFIED — runtime-gated, xem mục 9 và mục 18 tài liệu P5.5-00, không đổi) |

## 6. Network security (gate quan trọng)

Kiến trúc mong muốn:

```text
Member API
      │
      ▼
private/internal DB connection
```

**Không tìm thấy bằng chứng chính thức** rằng kết nối Member API ↔ PostgreSQL trên Vibe Host v2 là
private/internal-network-only thay vì một connection string có thể route qua internet công khai
(chỉ bảo vệ bằng mật khẩu + khả năng TLS chưa xác nhận). Ghi đúng như owner yêu cầu, không mặc định
coi "có password" là đủ an toàn:

```text
PRIVATE_DATABASE_NETWORKING_NOT_VERIFIED
```

**Phân loại rủi ro:** MEDIUM — không chặn implementation start (schema/API cục bộ không phụ thuộc
việc này), nhưng **phải xác minh trước khi P5.5 được coi production-ready** (gộp vào cùng gate với
mục 18 P5.5-00 — `BLOCKS_RUNTIME_ACCEPTANCE` + `BLOCKS_PRODUCTION`, không tạo nhãn mới). Mitigation
tối thiểu khi provisioning thật: bắt buộc `sslmode=require` nếu Mắt Bão hỗ trợ, credential coi là
`SECRET` (đã đúng phân loại P5.5-00 mục 3), rotate được, và không log connection string ở bất kỳ
đâu kể cả CI.

## 7. Secret management

- `DATABASE_URL` (Member API → PostgreSQL Mắt Bão): lưu trong biến môi trường Vibe Host v2 (AES-256
  at rest theo tài liệu chính thức) — **không** lưu trong Git, **không** dùng `VITE_*`.
- Supabase service credential cho resolver (nếu Member API cần gọi `resolve-member-scope` bằng một
  service-to-service secret dạng P3-08): vẫn theo đúng mô hình đã chốt ở P5.5-00 mục 13 — không đổi
  ở task này.
- Không ghi secret thật (connection string, password) vào bất kỳ tài liệu nào trong repo, kể cả tài
  liệu này.

## 8. Backup / restore — xác minh bổ sung cho mục 18 (P5.5-00)

Vibe Host v2 **thực sự có** tính năng backup như owner-side research ghi nhận:

- `CAPABILITY_VERIFIED`: manual snapshot + lịch tự động Daily/Weekly/Monthly; Restore và Download
  1-click.
- `RETENTION_NOT_VERIFIED`: không công bố số bản backup giữ lại hoặc thời gian giữ.
- `POLICY_NOT_CONFIGURED`: lịch Daily/Weekly/Monthly là tính năng có thể bật, không phải mặc định
  đã bật hay có SLA cam kết — cần owner/infra tự cấu hình khi provisioning.
- Backup encryption: **NOT VERIFIED**.
- PITR (point-in-time recovery): **NOT VERIFIED** — tài liệu chỉ nói tới snapshot/lịch, không nhắc
  continuous WAL archiving.
- `RESTORE_REHEARSAL_NOT_RUN`: đúng như P5.5-00 mục 18 đã yêu cầu — phải test restore thật trước
  P5.5-09, không tin tài liệu nhà cung cấp.

**Kết luận:** không thay đổi phân loại đã chốt ở P5.5-00 mục 18/mục 28 mục con 2
(`BLOCKS_RUNTIME_ACCEPTANCE` + `BLOCKS_PRODUCTION`, không `BLOCKS_IMPLEMENTATION_START`). Việc xác
nhận Vibe Host v2 "có tính năng backup" **không** nâng cấp trạng thái này lên PASS — có tính năng
backup ≠ backup acceptance PASS, đúng nguyên tắc gốc.

## 9. Domain / TLS

- Custom domain: gắn domain riêng cho Member API, cấu hình DNS theo hướng dẫn Vibe Host v2.
- TLS: Let's Encrypt tự động khi DNS được nhận diện đúng — **VERIFIED** ở mức cơ chế; auto-renewal
  được đề cập nhưng không có tài liệu chi tiết chu kỳ renew.
- **Không tự đặt hostname production.** Giữ nguyên placeholder đã có ở P5.5-00 mục 28 mục con 3:

```text
Member API domain: OWNER/DEPLOYMENT DECISION REQUIRED
```

  Ví dụ minh hoạ (không phải quyết định): `member-api.<domain-thật-do-owner-chọn>.vn`.

## 10. Data location / governance

- Không tìm thấy trang chính thức nào của Mắt Bão công bố cụ thể: vị trí trung tâm dữ liệu chính
  xác, jurisdiction pháp lý, chứng nhận bảo mật (ISO 27001/PCI-DSS...), chính sách giữ dữ liệu sau
  khi xoá, hay quyền truy cập của operator vào dữ liệu khách hàng.
- Có tài liệu marketing chung ("Vibe Hosting làm chủ dữ liệu hạ tầng Việt") khẳng định hạ tầng đặt
  tại Việt Nam — phù hợp giả định đã có trong P5.5-00 ("Mắt Bão (Việt Nam)") nhưng đây là tuyên bố
  marketing, không phải tài liệu compliance/pháp lý chính thức.

```text
NOT PUBLICLY VERIFIED — data center location, jurisdiction, security certification,
operator access policy, post-deletion retention
```

  Không suy đoán ngược rằng vì thiếu tài liệu public nên các mục này không tồn tại — chỉ ghi nhận
  chưa xác minh được.

## 11. Target scale ~3.000 members

MVP workload: CRUD, pagination, filter, search, import XLSX theo batch, audit, authorization —
không có yêu cầu high-throughput hay real-time. ~3.000 record PostgreSQL là tải rất nhẹ cho bất kỳ
tier nào trong 3 tier Vibe Host v2 công bố.

Cấu hình khởi đầu hợp lý (không overprovision, dùng đúng số liệu tier đã công bố, không bịa giá):

| Tier | CPU | Storage (theo tier, chưa rõ có tách riêng cho DB) | Số dịch vụ nền | Giá (trước VAT, tối thiểu 3 tháng) |
|---|---|---|---|---|
| Starter | 1 core | 1GB | 2 | 79.000đ/tháng |
| **Basic (đề xuất khởi điểm)** | 2 core | 4GB | 5 | 149.000đ/tháng |
| Pro | 4 core | 8GB | 10 | 290.000đ/tháng |

**Đề xuất Basic** làm điểm khởi đầu: đủ slot cho Member API + PostgreSQL instance (2 trong số 5 "dịch
vụ nền"), còn dư chỗ cho môi trường rehearsal/staging riêng nếu cần, chi phí thấp, không overprovision
như Pro khi tải thực tế chưa xác định. **Đây là đề xuất, không phải quyết định cuối** — owner/infra
xác nhận tier chính xác tại thời điểm provisioning (ngoài phạm vi task này).

## 12. Không trộn Supabase/Mắt Bão (nhắc lại, không đổi)

Giữ nguyên ranh giới đã chốt ở P5.5-00 mục 4/13: Supabase tiếp tục giữ Auth/roles/organization
identity/toàn bộ app data hiện có; Mắt Bão (Vibe Host v2) chỉ giữ Member API + Member operational DB
+ Member audit + Member import job. Quyết định hạ tầng ở tài liệu này **không** thay đổi ranh giới
đó — không tạo Auth account cho member, không lưu Member PII vào Supabase.

## 13. Decision

```text
RECOMMENDED_ARCHITECTURE: Mắt Bão Vibe Host v2
  - Runtime: Node.js container (Express/Fastify hoặc tương đương — chọn cụ thể ở P5.5-01)
  - Database: PostgreSQL 16 (managed, cùng nền tảng)
  - Tier khởi điểm đề xuất: Basic (2 core / 4GB / 5 dịch vụ nền) — owner xác nhận khi provisioning
```

**Lý do ưu tiên Vibe Host v2 trên Cloud Server Linux cho MVP** (đúng tiêu chí mục 15 yêu cầu gốc,
đã xác minh chứ không suy đoán):
- Operational burden thấp hơn hẳn — không tự vá OS, không tự cài PostgreSQL, không tự cấu hình
  Nginx/Certbot.
- PostgreSQL managed + connection string sẵn, thay vì tự cài đặt/patch/tối ưu.
- Backup tích hợp sẵn ở mức capability (dù còn thiếu chi tiết retention/encryption — vẫn tốt hơn
  không có gì trên VPS trần).
- Custom domain + TLS tự động, GitHub deploy — khớp trực tiếp với cách P5.5 đã hình dung deploy
  Member API (mục 4 P5.5-00).
- Không có yêu cầu nào trong P5.5-00 đòi hỏi private networking/OS-level control/custom firewall/
  extension đặc biệt/custom backup policy vượt quá khả năng PaaS — nên không có lý do chọn Cloud
  Server Linux "mạnh hơn" một cách không cần thiết.

## 14. Rejected alternatives

- **B. Cloud Server Linux (VPS):** không loại bỏ hoàn toàn — vẫn là phương án dự phòng hợp lệ nếu
  provisioning Vibe Host v2 thực tế lộ ra giới hạn không chấp nhận được (ví dụ: xác nhận network
  connection tới PostgreSQL bắt buộc public và không thể enforce TLS). Bị xếp sau vì gánh nặng vận
  hành OS + database administration không cần thiết cho MVP CRUD nhẹ này.
- **C. Hosting Linux Premium (cPanel):** **REJECTED cho Member API runtime.** Lý do quyết định,
  không phải sở thích: cơ chế chạy Node.js qua cPanel "Setup Node.js App" là mô hình Passenger-style
  yêu cầu **restart thủ công sau mọi thay đổi code/package** và route qua `.htaccess`/Apache proxy —
  không phù hợp một backend HTTP API production cần tự phục hồi khi crash, tự động redeploy theo
  Git push (yêu cầu đã nêu ở P5.5-00 mục 4). PostgreSQL trên gói cụ thể của Mắt Bão không được xác
  minh (chỉ có bằng chứng yếu rằng phần mềm cPanel nói chung hỗ trợ PostgreSQL — không đặc thù cho
  gói Premium của Mắt Bão).

## 15. Open runtime gates (không đổi phân loại đã có, chỉ làm rõ thêm)

| Gate | Trạng thái sau task này |
|---|---|
| Chọn đúng sản phẩm/gói Mắt Bão | **RESOLVED (kiến trúc):** Vibe Host v2, tier đề xuất Basic |
| Hạ tầng đã provisioned (mua, tạo app, tạo PostgreSQL, lấy connection string) | **CHƯA THỰC HIỆN** — hành động mua dịch vụ, nằm ngoài phạm vi task này |
| Private DB networking | `PRIVATE_DATABASE_NETWORKING_NOT_VERIFIED` — xác minh khi provisioning, không chặn code |
| Backup retention/encryption/PITR | `RETENTION_NOT_VERIFIED` / NOT VERIFIED — không đổi, vẫn `BLOCKS_RUNTIME_ACCEPTANCE` + `BLOCKS_PRODUCTION` |
| Domain/TLS hostname thật | Chưa chọn — placeholder, owner quyết định khi deploy |
| Restore rehearsal thật | Chưa chạy — bắt buộc trước P5.5-09 (không đổi) |

## 16. P5.5 dependency impact

- **P5.5-01** ("Dựng PostgreSQL schema tại Mắt Bão + skeleton Member API"): phần **viết schema/code
  cục bộ hoặc trên môi trường rehearsal tương đương PostgreSQL 16 + Node.js container** có thể bắt
  đầu **ngay** — không còn phụ thuộc một câu hỏi kiến trúc mở, vì sản phẩm hạ tầng đã được xác định
  và có bằng chứng khả thi (mục 5, 13). Phần **deploy thật lên Vibe Host v2 đã provisioned** vẫn chờ
  hành động mua/tạo instance (ngoài phạm vi task này) — đây không phải một blocker kiến trúc, mà là
  một hành động vận hành/mua sắm còn lại, tách khỏi việc bắt đầu viết code.
- **P5.5-00 mục 28, mục con 1** cập nhật trạng thái RESOLVED-AT-ARCHITECTURE-LEVEL trong chính tài
  liệu 00 (xem diff kèm theo) — trỏ về tài liệu này làm bằng chứng, không lặp lại nội dung.
- **P5.5-00 mục 26 (P5.5-01 dependency line)** cập nhật để phản ánh: quyết định sản phẩm hạ tầng đã
  có, còn "đã provisioned" tách thành một dòng riêng, không gộp chung khiến người đọc tưởng cả hai
  đã xong.
- Không có invariant nào trong P5.5-00 bị thay đổi bởi quyết định này (Account≠Member, không số
  hiệu/CCCD/passport, AI/Gemini/RAG exclusion, không cache PII trình duyệt, fail-closed authorization,
  `organizations.code` immutable) — quyết định này thuần về **nơi chạy** Member API/DB, không về
  **cách** nó hoạt động.

---

**Verdict của task này:**

```text
P5_5_MEMBER_INFRASTRUCTURE_DECISION_PASS
```
