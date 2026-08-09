# P2-03 — STORAGE AUTHORIZATION

**Phase:** 2 — Công việc & Báo cáo
**Task:** P2-03 (Storage RLS + metadata RLS — remediation S5, G2, G3, G14)
**Ngày:** 2026-08-09
**Branch:** `feat/phase-2a-report-foundation` (tiếp nối P2-02 @ `05aa1ec`, sau merge master `f67f4d1`)

> Chỉ chạm Storage policy + table RLS (templates/status_history) + 1 helper. KHÔNG sửa `submit-report` (P2-04), `review-report` (P2-05), frontend.

---

## 1. Before state

- Bucket `report-submissions-private` và `report-templates-private` đã tồn tại (private, có size limit — migration `202607300002`) nhưng **không có policy `storage.objects` nào** ⇒ RLS bật + không policy = **fail-closed**: an toàn khỏi rò rỉ nhưng **chặn luôn** upload của chi đoàn và tải template (S5, G2).
- `report_campaign_templates` và `report_status_history`: RLS bật, **không có policy** ⇒ chi đoàn không đọc được metadata template (để tải) và lịch sử trạng thái (G3, G14).

## 2. Threat → remediation

| Threat | Remediation |
| --- | --- |
| S5 — thiếu isolation policy submissions storage | SELECT/INSERT policy theo org segment `[2]` (RPT-F02/F03). |
| G2 — không tải được template | SELECT policy templates cho org được giao + admin. |
| G3 — không đọc metadata template | RLS SELECT `report_campaign_templates` (org được giao + admin). |
| G14 — không đọc timeline | RLS SELECT `report_status_history` (org sở hữu + admin scope). |
| Overwrite submission cũ (RPT-F05) | Không cấp UPDATE/DELETE policy cho end-user ⇒ không ghi đè. |
| Cast path độc hại gây lỗi query | Helper `uuid_or_null()` trả NULL thay vì raise. |

## 3. Migration

`supabase/migrations/202608090002_phase_2_report_storage_authorization.sql` — forward-only, idempotent (`drop policy if exists` + `create or replace`).

### 3.1. Helper an toàn
`public.uuid_or_null(text) -> uuid` (`immutable strict`, exception→NULL). Lý do: object name là **untrusted text**; `segment::uuid` sẽ **raise** trên input sai và PostgreSQL **không đảm bảo** `bucket_id = '...'` được đánh giá trước cast ⇒ query có thể vỡ khi có object ở bucket khác (vd template có `[2]` là tên file). Helper giữ policy bền vững bất kể planner ordering.

### 3.2. Path convention (nguồn isolation)
```text
report-submissions-private/{campaign}/{organization_id}/{assignment}/v{n}/{uuid-file}   -> org ở segment [2]
report-templates-private/{campaign}/{uuid-file}                                          -> campaign ở segment [1]
```

## 4. Policies đã thêm

### storage.objects — `report-submissions-private`
| Policy | Op | Điều kiện |
| --- | --- | --- |
| `read own org submission files` | SELECT | active + (`[2]`=`current_org_id()` OR `has_role_in_scope('YOUTH_ADMIN',[2])` OR SYSTEM_ADMIN) |
| `branch officers upload own org submissions` | INSERT | active + BRANCH_OFFICER + `[2]`=`current_org_id()` |
| *(không có UPDATE/DELETE cho end-user)* | — | ⇒ không overwrite (RPT-F05) |

### storage.objects — `report-templates-private`
| Policy | Op | Điều kiện |
| --- | --- | --- |
| `assigned orgs read report templates` | SELECT | active + (org có assignment trong campaign `[1]` OR admin) |
| `admins manage report templates` | ALL | YOUTH_ADMIN/SYSTEM_ADMIN |

### Table RLS
| Bảng | Policy | Op | Điều kiện |
| --- | --- | --- | --- |
| `report_campaign_templates` | `read campaign templates` | SELECT | active + (org được giao trong campaign OR admin) |
| `report_campaign_templates` | `admins manage campaign templates` | ALL | YOUTH_ADMIN/SYSTEM_ADMIN |
| `report_status_history` | `read status history in scope` | SELECT | org sở hữu assignment OR admin scope |

## 5. Storage invariants coverage (P2-01 §8)

| ID | Cách đáp ứng |
| --- | --- |
| RPT-F01 private mặc định | Bucket private (đã có). |
| RPT-F02 Org A không đọc Org B | SELECT policy so `[2]` với `current_org_id()`. |
| RPT-F03 không suy quyền từ path | INSERT with-check ràng `[2]`=org; biết path Org B không tải/ghi được. |
| RPT-F04 signed URL sau authz | **Còn lại cho Edge Function (P2-04/P2-13)**: signed URL do service_role tạo sau khi kiểm quyền; RLS ở đây là defense-in-depth cho truy cập trực tiếp. |
| RPT-F05 không overwrite | Không có UPDATE/DELETE policy cho end-user. |
| RPT-F06 verify object tồn tại | **P2-04** (submit-report verify object thật). |
| RPT-F07 orphan/reconciliation | **P2-04** (finalize atomic + cleanup strategy). |

## 6. Tests

`supabase/tests/report_storage_authorization.sql` (pgTAP, `no_plan()`, begin/rollback):

| Test | Kỳ vọng |
| --- | --- |
| Org A → file A | PASS (count 1) |
| Org A → file B | DENY (0) — isolation |
| Anon → file A | DENY (0) |
| Suspended → file A | DENY (0) — fail-closed |
| YOUTH_ADMIN (parent scope) → file A | PASS (recursive scope) |
| Officer A upload vào path org mình | PASS (lives_ok) |
| Officer A upload vào path Org B | DENY (RLS violation) — chống cross-org planting |
| Org được giao đọc template object / metadata | PASS |
| Org không được giao đọc template | DENY |
| Org sở hữu đọc status_history | PASS; org khác | DENY |

**Lệnh đã chạy (môi trường này):**
```text
npm test        → 9/9 pass
npm run lint    → 0 errors (3 warnings có sẵn)
npm run build   → success
npx supabase db reset → FAILED: Docker daemon không khả dụng
```

**BLOCKED_BY_ENVIRONMENT:** máy này không có Docker/Deno ⇒ chưa thực thi `supabase db reset` / `supabase test db`. pgTAP đã viết đầy đủ; phải chạy qua CI (`.github/workflows/ci.yml` job `test-db`) để nghiệm thu cứng. Đặc biệt các test **INSERT storage** phụ thuộc grant nền của Supabase local trên `storage.objects` cho role `authenticated` (có sẵn trong stack Supabase).

## 7. Remaining risks

- pgTAP chưa thực thi (Docker/Deno vắng). Đã tự-review: helper `uuid_or_null` tránh lỗi cast; message RLS storage = `"objects"`; policy OR-combined không xung đột với documents/innovation policy (guard `bucket_id`).
- `admins manage report templates` / `admins manage campaign templates` dùng kiểm role **global** (bất kỳ YOUTH_ADMIN) thay vì scope theo campaign owner — template là biểu mẫu trắng, độ nhạy thấp; sẽ siết scope khi P2-11 gắn `created_by` cho campaign nếu cần.
- Signed URL sau authorization (RPT-F04) và verify object (RPT-F06/F07) thuộc **P2-04**.

## 8. Mapping sang task sau

| Việc còn lại | Task |
| --- | --- |
| `submit-report`: verify object Storage thật + finalize atomic + signed URL flow | **P2-04** |
| `review-report`: scope + transition guard | **P2-05** |
| Download/export lọc scope + signed URL bundle | **P2-13** |
| Chạy pgTAP thực trên Docker/CI | **P2-06** |

---

**Kết luận:** Storage báo cáo đã có isolation theo tổ chức (đọc + ghi), template/timeline mở đúng phạm vi, không cho overwrite. Chờ thực thi pgTAP trên Docker/CI để nghiệm thu cứng.

**DỪNG. Chờ lệnh cho P2-04.**
