# NQ13 — Tổng hợp học tập của các Chi đoàn tại 148 xã/phường

## Current final closure — 2026-10-08

- #67 MERGED final12bb681, merge/master `b3c5393fbdcb30980f458d784a0c00c41509f8b6`;
  post-merge CI37741972809 GREEN. Old stacked #68 head `aa15f85c4fa4d5e4f161216d718ecee17ca3ff9c`
  rebased cleanly onto that master: merge-base=b3c5393, exactly two feature commits1a7a6e4/180d356.
  No duplicate certificate implementation/migration; print PDF fix retained.
- Owner confirms no verified roster: **pilot participation statistics**, attempts and average best
  score, not official competition ranking. Public UI removes rank/Top3/competition score and shows
  rolling30day guest policy/name collision limitation. Private50/30/20 calculation unchanged;
  admin labels it internal simulation, preserves full roster/drill-down/CSV.
- Migration `20261008130000_nq13_public_statistics_privacy`: server config threshold3; unit0/1/2
  average/pass/highest/cert/activity null. At3+ learning metrics available. All public units raw
  roster/completion/rank/score null, alphabetic order; no hidden rank ordering. Active-only current
  summary/units. Province sensitive totals null if a positive small cell exists, blocking subtraction
  inference. Admin separate `nq_admin_competition_dashboard`, global role server check incl SYSTEM_ADMIN;
  public endpoint stays suppressed even for admin. Direct REST roster/wildcard denied by column grants.
- Actual rehearsal82pgTAP PASS includes0/1/2/3/4 public cells, unchanged private rank/weights,
  ordinary/guest deny, YOUTH_ADMIN/SYSTEM_ADMIN full data, public/admin separation, inactive summary.
  Frontend258/lint0errors3existingwarnings/build/diff PASS. Catalogue seed twice148active=133xa+15phuong,
  duplicate0; 3000attempts/1500people EXPLAIN39.465ms (baseline39.178), full rollback.
- Final exact-head CI/full-reset/hosted Preview/1+2+3 fixtures/network/responsive/cleanup gates
  remain pending. No final PASS or merge until these gates complete; final SHA receipt will be pinned
  in PR #68. Only rehearsal database touched; Production DB NO.
- Advisors: private config RLS/no policies is intentional deny-all; explicit public aggregate
  definer and authenticated admin definer are intentional tested boundaries, not blanket project
  clean bill. [Supabase advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Forward-fix: retain the additive schema and privacy default, repair RPC/UI with another migration.
  Frontend rollback to #67 preserves certificates. Never restore unrestricted public dashboard or
  public roster grants. Synthetic fixtures cleaned only by exact IDs; no production migration.

## Historical implementation and receipts below

The sections below preserve old stacked-head evidence. Their official-ranking/Top3/public-roster
and pre-merge status are superseded by the current pilot/privacy contract above.

## Baseline và phạm vi

- Ngày thực hiện: 2026-10-08. Repository `vi-phuong-158/so-tay-doan-vien-so`.
- `origin/master`: `a7f0aa2eb713e0cb619924fb0e43da1740de3459`.
- PR #67 còn OPEN: `feat(quiz): add NQ13 assessment certificate flow`.
- Branch `codex/nq13-unit-competition-dashboard` được tạo từ exact head #67
  `7195fc33099f4d3446f4d17f6ec460a838115e63`. Đây là stacked development;
  không copy hay tạo lại certificate/participant migrations. PR vào master phải rebase sạch
  sau khi #67 merge, chạy lại acceptance trên head mới. Không merge trong task này.
- Chỉ rehearsal Supabase `znexculhbdjiflkczpyu`; không deploy database Production.
- Exact final head, CI run và Preview deployment được ghi trong PR receipt sau commit:
  một commit không thể chứa chính SHA của nó. Các ảnh bàn giao là local rehearsal;
  nghiệm thu hosted phải được kiểm tra lại trên final head.

## Danh mục có nguồn kiểm chứng

Nguồn chính: [Cổng Chính phủ — danh sách 148 xã/phường Phú Thọ](https://xaydungchinhsach.chinhphu.vn/sap-xep-dvhc-danh-sach-148-xa-phuong-cua-tinh-phu-tho-119250623074347981.htm),
theo Nghị quyết **1676/NQ-UBTVQH15**, kiểm tra 2026-10-08. Danh sách gồm 146 đơn vị
mới và hai xã không sắp xếp **Thu Cúc, Trung Sơn**. Tổng **148**, **133 xã + 15 phường**,
0 duplicate name/code/UUID, 0 inactive trong seed, tên Unicode NFC.
[Thông tin tỉnh tháng 6/2026](https://phutho.dcs.vn/ContentDetail/NewsDetailView?NewsId=2ab9ddc9-74e8-4eba-817b-93ed53980322)
tiếp tục ghi nhận 148 đơn vị. Repository và rehearsal không có danh mục tương đương để tái sử dụng;
20 organizations hiện hữu không được dùng như danh mục hành chính mới.

- `scripts/data/nq-competition-units.json`: catalogue và provenance đã đóng băng.
- SHA256 HTML: `eea869bde1c5dba4fafce7139b57b8d965d1e7d82969a9e531fdd419defcb162`.
- `scripts/build-nq-unit-seed.py`: đọc HTML đã tải từ nguồn trên, xác nhận counts/NFC/duplicates,
  sinh JSON và seed; không gọi API trong React, không tự sinh tên.
- `PT-NQ-001`…`PT-NQ-148` là **mã nội bộ ổn định**, không phải mã hành chính chính thức.
  Ordinal đóng băng theo danh sách; UUID5 có namespace/provenance ổn định. Không renumber
  khi tên thay đổi. Chỉnh metadata về sau bằng migration có kiểm soát.
- Seed `ON CONFLICT(code) DO NOTHING`; chạy lại không ghi đè tên/quân số/active hay xóa lịch sử.
  Assertion active count = 148 sẽ fail nếu cấu hình thay đổi, để owner xử lý discrepancy.

## Database và Code Graph

Migration `supabase/migrations/20261008021004_nq13_unit_competition.sql`:

| Object | Vai trò |
|---|---|
| `public.nq_competition_units` | UUID, code/name unique, short_name, xa/phuong, display_order, eligible_members nullable, active, timestamps |
| `public.nq_attempt_participants` | Thêm unit FK RESTRICT, unit_name_snapshot, server-assigned authenticated_user_id, normalized_full_name NFC, is_competition_test |
| `quiz_private.nq_competition_config` | Singleton: weights 0.50/0.30/0.20, sum=1, public_missing_units=false; client không đọc/ghi trực tiếp |
| `quiz_private.nq_competition_attempts` | Chỉ NQ_300, submitted, snapshot SUBMITTED/EXPIRED, score hợp lệ, có unit link, không test marker |
| `quiz_private.nq_competition_people` | Group unit + identity; max(score), counts, latest; không tạo bảng result thứ hai |
| `quiz_private.nq_unit_competition_stats` | LEFT JOIN mọi unit, zero states, denominator, weights và deterministic rank |
| `nq_save_unit_participant` | Owner + active/scoped NQ guest; active UUID; snapshot tên lấy từ DB; khóa sau submit |
| `nq_competition_dashboard` | Public JSON aggregate-only: summary, unit metrics, harmless config |
| `nq_update_eligible_members` | Chỉ global YOUTH_ADMIN hoặc SYSTEM_ADMIN; int>=0 hoặc NULL |
| `nq_admin_unit_participants` | Cùng quyền global; pagination 50; tên, lượt, best, cert count, latest; unmapped count admin-only |

Index `(unit_id, authenticated_user_id, normalized_full_name)` partial mapped participants;
`(quiz_id, submitted_at, id) INCLUDE(score,passed)` partial submitted attempts; các PK/FK
attempt/unit và index lifecycle hiện hữu được tái sử dụng.

```text
Home / NqQuiz result -> /tri-thuc/nq13/thanh-tich[/:unitCode] -> NqCompetition
  -> nqCompetitionService.dashboard -> nq_competition_dashboard
  -> private attempts -> best result per identity -> weighted unit statistics

NqQuiz -> NqUnitSelect -> cached active catalogue (one read / 5 minutes)
  -> nqQuizService.saveUnitParticipant -> nq_save_unit_participant
  -> participant organization/unit snapshot -> existing nq_attempt -> certificate snapshot

Admin -> AuthGuard + RoleGuard -> /admin/nq13-thanh-tich[/:unitCode]
  -> roster RPC / private paginated participants RPC -> server global-role check
```

## Identity, thi lại và công thức

- Thi lại không bị giới hạn bởi thi đua. Mỗi identity tại mỗi unit đóng góp **max(score)**;
  lượt thi vẫn đếm tất cả finalized attempts hợp lệ.
- Permanent authenticated user dùng Auth UUID server xác minh; guest dùng lower(NFC(trim +
  collapse whitespace(full_name))) + unit UUID. Không sửa tên hiển thị của snapshot/certificate.
- Hai guest trùng tên trong cùng unit có thể bị gộp; người đổi tên có thể tách nhóm.
  Guest participant de-duplication by normalized full name + unit is suitable for pilot competition
  statistics but is not a strong identity proof. Auth ID của guest không được giả coi là member ID.
- Cùng người ở hai unit đóng góp riêng tại từng đơn vị; summary là số participation identities
  theo đơn vị, không tuyên bố đã xác thực distinct con người toàn tỉnh.
- Average = average(best per identity); pass count = best>=80; pass rate = pass/people*100.
- Completion = people/eligible*100 chỉ khi eligible>0. NULL/0 => INCOMPLETE_ROSTER,
  completion/score/rank=NULL. People>eligible => ROSTER_EXCEEDED, không official score/rank;
  giữ tỷ lệ thực để admin sửa quân số, không âm thầm clamp.
- Score = 0.50*completion + 0.30*average + 0.20*pass rate. Trusted server config có constraint
  weights trong [0,1] và sum=1; không frontend/guest mutation.
- Tie: score DESC, completion DESC, average DESC, pass rate DESC, name COLLATE C ASC,
  code ASC. Rank dùng numeric trước rounding; UI tối đa hai chữ số.
- Unit không người: attempts/participants/pass/cert=0; average/highest/pass rate=NULL.
  Unit inactive giữ historical metrics nhưng không xếp hạng chính thức.
- Certificate count là số chứng nhận VALID của các attempts đang được tính, không đếm một
  chứng nhận cho mỗi người và không cộng certificates mất attempt link sau cleanup.

## Backward compatibility, quyền và privacy

- Giữ nguyên 9 historical unmapped participant records; không delete/force-map. Không đưa chúng
  vào competition. Admin được thông báo count này.
- RPC cũ `nq_save_participant` giữ compatibility, không tạo unit mapping. Trigger gỡ mapping
  nếu legacy edit làm organization khác snapshot. Old clients có thể tiếp tục unmapped;
  service worker cache v6 giúp frontend mới thay shell cũ.
- Certificate cũ và `verify_nq_certificate` không sửa; participant.organization_name và certificate
  organization snapshot vẫn giữ đúng lịch sử kể cả rename/live inactive.
- Units RLS chỉ SELECT active cho anon/auth; global admin đọc historical inactive. Client không
  INSERT/UPDATE/DELETE unit. Private config/views không exposed/granted. RLS config không policy
  là intentional deny-all. Security-definer RPC đặt search_path rỗng và checks rõ ràng.
- Public aggregate chỉ unit metadata, numeric statistics, rank/status/latest và weights; không
  full_name, auth/participant/attempt IDs, email, answers, certificate code/UUID.
- Public verification bằng certificate code vẫn là contract riêng có consent từ #67, không được
  kết nối thành participant enumeration endpoint. Dashboard không tải raw attempts về browser.
- Route guard là UX; RPC kiểm tra role **global** ở server. Scoped YOUTH_ADMIN không có quyền
  xem toàn tỉnh/chỉnh roster chỉ vì frontend nhận role_code.
- Export admin CSV whitelist aggregate, Unicode BOM và neutralize spreadsheet formula injection;
  không mặc định export tên người.
- Missing participation section public mặc định chỉ count; trusted config có thể bật danh sách.
  Unit table/filter vẫn là catalogue aggregate công khai. Admin thấy danh sách searchable.

## UI và acceptance

Dropdown label, autofocus, search có/không dấu, Arrow/Enter/Escape, focus trả lại button,
touch target>=44px. Dashboard dùng tokens/Be Vietnam Pro, summary 9 chỉ số, tiến độ,
top three có dữ liệu rank, bảng/cards mobile, các filters yêu cầu, unit detail/latest activity
Asia/Ho_Chi_Minh, loading/error/retry/empty states. Admin roster, drill-down 50/page, CSV tổng hợp.

| Gate đã chạy trước PR | Bằng chứng |
|---|---|
| Frontend | 257/257 npm tests; lint 0 errors/3 warnings Fast Refresh có sẵn; production build thành công, main chunk >500kB warning hiện hữu |
| Rehearsal migration | Apply thành công; 148 active =133 xa+15 phuong; duplicate=0; seed không ghi đè roster |
| DB new suite | 60 pgTAP assertions, transaction rollback; catalogue/RLS/ownership/NFC/retake/identity/weights/rank/NULL/zero/test/unmapped |
| NQ regression | `scripts/nq-runtime-check.sql` NQ_RUNTIME_ASSERTIONS_PASS; 23/30 FAIL,24/30 PASS, old snapshot/verification/retention/ownership |
| Synthetic stats | A:8 people/12 attempts, avg83.75,pass6/75%,completion80%,score80.125; B20/20,avg90,score97 outranks C1person100 |
| Performance | 3,000 attempts/1,500 identities/all148; EXPLAIN ANALYZE public RPC 39.178ms,21779 shared buffer hits; complete rollback, measurement not an SLA |
| Local browser | Real Auth/RPC, no intercepted data; Home->select Việt Trì by unaccented search/Enter->submit30/30->certificate unit snapshot->leaderboard attempts/people/cert updated |
| Responsive/privacy | 360/390/430/768/1440, no horizontal overflow; public network JSON allowlist/no individual fields; search/types/missing/incomplete/details/auth admin redirect |

## Hosted receipt — implementation head

- [PR #68](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/68), implementation head
  **`81f793cffb48b4c29aabafea1dfdd03ebe09efa8`**.
- [CI run37721276959](https://github.com/vi-phuong-158/so-tay-doan-vien-so/actions/runs/37721276959):
  success build, test-db và member-api-test. Migration reset,35pgTAP files/**934 assertions**,
  catalogue seed twice, NQ_RUNTIME_ASSERTIONS_PASS, Deno checks/tests,257frontend/273Member API tests.
- [Immutable Preview](https://so-tay-doan-vien-aqop30837-vi-phuong-158s-projects.vercel.app),
  deployment `dpl_HKHuZ8QkkSvydqqjHqdwMHWuAKta`, READY, metadata exact implementation SHA,
  Preview target (không Production). Protection giữ nguyên, access cookie từ quyền chia sẻ tạm,
  không ghi token/link có secret vào source/receipt.
- Hosted **ui/participant/finish/rank** browser assertions PASS, không intercept data: dropdown
  search/Enter; own30/30 result, certificate Phường Việt Trì; people/attempts/pass/certificate counts
  cập nhật; public aggregate allowlist/privacy;5viewport widths; search/type/missing/incomplete/detail;
  anonymous admin gate. Temporary eligible=1 chỉ phục vụ own rehearsal fixture: completion100%,
  score100,rank1,top-three card; refresh không đổi ranking. Đây không phải quân số nghiệp vụ.
- Cleanup checked: exact actor/attempt/certificate remaining0; eligible và updated_at khôi phục
  đúng giá trị cũ; catalogue active148; historical unmapped9. Không broad deletion.
- Ảnh hosted prefix `preview-*` trong `unit-competition-evidence/`; ảnh không prefix là local.
  Screenshot tên NQTEST là dữ liệu synthetic đã cleanup, không phải người tham gia thật.
- Receipt commit này bổ sung hồ sơ/ảnh và cải thiện vị trí chụp rank trong harness; source app/
  migration không đổi so với implementation head. Final latest head, CI và immutable Preview
  được retest và ghi chính xác trong body PR #68 sau push (tránh tự tham chiếu SHA của commit).

`scripts/nq-unit-browser-check.mjs` supports ui/participant/finish/rank against NQ_BASE_URL;
uses existing bundled Playwright and Chrome, no install. Correct choices for the own synthetic
attempt are read through trusted rehearsal SQL into gitignored tmp only; no key appears in client
exam payload or committed evidence. Session/access URLs are also never committed/logged.
Admin credentials are not available: authorization/update/drill-down acceptance is real pgTAP
role/RLS evidence, not a claimed browser admin PASS. Browser anonymous route denial is checked.

## Rollout, cleanup, rollback và giới hạn

1. Independent review cả stacked dependency #67 lẫn delta feature; merge #67 trước, rebase branch
   lên master và retest migration reset/full suites/final-head Preview trước merge feature.
2. Rehearsal đã có dependency certificate migrations qua management timestamps; không replay
   migration đã applied. Production cần owner riêng cho migration/seed/roster/retention.
3. Browser fixtures prefix NQTEST, exact actor/attempt IDs giữ trong gitignored receipt; xóa
   certificate synthetic theo exact attempt, rồi đúng anonymous actor theo lifecycle. Không broad
   DELETE. Restore exact eligible value nếu tạm nhập để nghiệm thu rank; kiểm tra catalog148 và
   synthetic leftovers=0 sau cleanup. pgTAP/performance tự rollback.
4. Nếu frontend lỗi, rollback frontend release về #67; migration additive có thể giữ, legacy
   registration/certificate tiếp tục hoạt động. Không drop unit FK/snapshot/history để rollback.
   Disable new RPC grants trong forward-fix được owner kiểm duyệt nếu cần đóng tính năng.
5. Fix data/catalogue bằng migration có kiểm soát; deactivate đơn vị thay hard delete. Quân số
   thật phải do Ban Thanh niên cập nhật; không seed giả denominator để làm bảng có hạng.
6. **Retention quan trọng:** guest cleanup hiện xóa Auth/attempts sau 30 ngày. Competition tính
   attempts đang tồn tại, nên guest metrics và counted certificate totals giảm sau cleanup;
   certificate record độc lập vẫn tồn tại. Thi đua dài hạn cần owner chốt retention/lưu aggregate
   bền vững trong phase riêng. Task này không âm thầm đổi cron/retention hay duplicate result table.
7. Có các security-advisor warnings hiện hữu của project; không tuyên bố toàn bộ project sạch.
   Private config deny-all và aggregate-only security-definer là thiết kế chủ ý được kiểm bằng tests.
8. Không bổ sung CCCD/điện thoại/email hay dữ liệu nhạy cảm để khử trùng tên. Không deploy
   Production database, không merge PR, không thay secrets/dependencies.
