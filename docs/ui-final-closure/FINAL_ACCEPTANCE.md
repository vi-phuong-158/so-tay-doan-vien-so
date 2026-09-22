# SOTAY_UI_FINAL_CLOSURE — Final Acceptance

## VERDICT

`SOTAY_UI_SOURCE_ACCEPTANCE_PASS_RUNTIME_ACCEPTANCE_BLOCKED`

UI source, guest/public rehearsal paths và auth-on-demand gates pass. Authenticated report, quiz,
Profile, Member Management, Admin và Innovation submission chưa được gọi PASS vì không có
authorized rehearsal account/Member API endpoint trong phiên này.

## BASELINE

- Starting master: `2095ebb98c572f10a5b04a08396e3e3569fb1271` (merge PR #54).
- PR #55 head: `f425e6eb0b04c3adfaa39f89e286268b2a64f2a1`.
- PR #56 head: `43237acad725c366f19b148cb8c4b833ab9ebdde`.
- Closure branch: `feat/ui-final-closure`.

## RECONCILIATION

- Từ #55: Home, Work, report detail, Knowledge, Ask AI, Quiz, Member Management, Login visual
  hierarchy, logo và reference screenshots.
- Từ #56: Public-First shell, navigation 5 khu vực, auth-on-demand, Lucide adapter, Skeleton,
  shared auth state/modal, Innovation, Profile/auth cleanup.
- Reconcile thủ công: `Icon`, `Layout`, `common`, `Home`, `Login`, `index.css`, architecture/task/log
  docs. Bổ sung desktop rules còn thiếu, no-evidence/retry cho Ask AI, text floor 11px và important
  target floor 44px.
- Loại bỏ: duplicated bottom navigation, competing Home block, icon imports trùng, CSS 7–10px và
  target 29–43px. Không đổi backend/security contract.

Chi tiết theo từng route: [UI_RECONCILIATION_MATRIX.md](./UI_RECONCILIATION_MATRIX.md).

## ROUTE MATRIX

- Audit đủ 30 route pattern/wildcard lấy trực tiếp từ `src/App.jsx`.
- Guest browser: 30/30 tại từng viewport 360, 390, 430, 768 và 1440 px.
- Kết quả 150 lượt: không blank page, không horizontal overflow, không visible text dưới 11px,
  không interactive target dưới 44px trên surface đang render.
- Public list/detail: loading/empty/not-found được render từ rehearsal thật; không bơm fixture.
- Protected route: auth-required state và destination-to-login PASS; nội dung sau login ghi BLOCKED.
- Ask AI guest: no-evidence response thật PASS, disclaimer “không phải kết luận chính thức” hiển thị.
- Wildcard: Not Found state PASS.

## DESIGN ACCEPTANCE

- Font: Be Vietnam Pro; Archivo chỉ ở display label/number theo design addendum.
- Icon: một adapter Lucide, không emoji/icon set cạnh tranh.
- Màu: youth blue chủ đạo; đỏ/vàng chỉ accent; card mềm, shadow nhẹ.
- Component reuse: shared shell, `PageHeader`, `BottomNavigation`, `Sidebar`, state primitives,
  `StatusBadge`, Skeleton, native `Modal`, form fields và domain cards.
- Mobile: safe-area/bottom-nav padding, 360–430 px không overflow; important targets 44px trở lên.
- Desktop: Home/Login/Knowledge/Ask AI được kiểm tra trực quan ở 1440 px; card giữ max-width/hierarchy.
- Accessibility: form Login có label/id thật, focus visible, ARIA nav/region/status, trạng thái không chỉ
  dùng màu. Keyboard Tab trên Login đi vào `#login-email`.
- CSS audit: không còn undefined custom property; visible pixel font nhỏ nhất trong browser sweep là
  11px.

## TEST RESULTS

- `npm test`: 208/208 PASS.
- `npm run lint`: 0 errors; 3 Fast Refresh warnings cũ ở `Guards.jsx` và `AuthContext.jsx`.
- `npm run build`: PASS; 2000 modules; main chunk 525.45 kB (cảnh báo >500 kB, không phải lỗi).
- `git diff --check`: PASS.
- Browser: 150/150 route × viewport checks PASS; 5-item nav, Forgot Password, Innovation/Work
  auth-on-demand, Login keyboard focus và Ask AI no-evidence PASS; public console clean.

## SCREENSHOT EVIDENCE

Mobile 390 px:

- `screenshots/mobile-390-home.png`
- `screenshots/mobile-390-work-auth-required.png`
- `screenshots/mobile-390-knowledge.png`
- `screenshots/mobile-390-documents.png`
- `screenshots/mobile-390-ask-ai.png`
- `screenshots/mobile-390-ask-ai-no-evidence.png`
- `screenshots/mobile-390-innovation.png`
- `screenshots/mobile-390-profile-auth-required.png`
- `screenshots/mobile-390-member-management-auth-required.png`
- `screenshots/mobile-390-login.png`

Desktop 1440 px:

- `screenshots/desktop-1440-home.png`
- `screenshots/desktop-1440-work-auth-required.png`
- `screenshots/desktop-1440-knowledge.png`
- `screenshots/desktop-1440-member-management-auth-required.png`
- `screenshots/desktop-1440-login.png`
- Bổ sung: `screenshots/desktop-1440-ask-ai.png`.

Bộ reference lịch sử của PR #55 được giữ tại `docs/ui-reference-reconciliation/screenshots/` để
chứng minh màn protected đã được reconcile, nhưng không được dùng thay authenticated runtime PASS.

## REMAINING BLOCKERS

- Source/UI blocker: không còn blocker đã biết trong scope.
- Rehearsal blocker: thiếu authorized user/role session và không có `VITE_MEMBER_API_URL`; do đó
  upload/submit/history/review/resubmit, quiz attempt/result, Profile/logout/session restore,
  notifications/change-password, Innovation submit, Member CRUD/import/audit và Admin mutations
  chưa được browser-acceptance thật.
- Mobile software keyboard: browser harness không mô phỏng bàn phím ảo; CSS focus rule ẩn bottom nav
  và modal dùng bounded `dvh`, nhưng device acceptance vẫn pending.
- Production blocker: production deployment/readiness nằm ngoài task; không deploy/chạm dữ liệu production.

## PR STATUS

- Closure PR: [#57](https://github.com/vi-phuong-158/so-tay-doan-vien-so/pull/57).
- Head SHA: `a6d7f02c8d6aaa3da64b4c2e5175be4e0f3bf8ca`.
- Exact-head CI run: `35700532914` — `build`, `test-db`, `member-api-test`, Vercel và Preview Comments đều xanh.
- Merge recommendation: merge #57 sau owner review; không merge nguyên trạng PR #55/#56.
