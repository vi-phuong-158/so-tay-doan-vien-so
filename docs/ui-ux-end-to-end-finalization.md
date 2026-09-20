# UI/UX End-to-End Finalization

## Baseline and scope

- Starting SHA: `2095ebb98c572f10a5b04a08396e3e3569fb1271` (`master`, PR #54 merge).
- Branch: `codex/ui-ux-end-to-end-finalization`.
- Public-first/auth-on-demand remains the route and data boundary. This task does not change RLS, RPC, Edge Function authorization, Member API authorization, or report workflow.
- Design read: public-sector mobile service for youth union members; use the existing blue system, Be Vietnam Pro, line icons, and selective glass.
- Local before review: Vite had no `.env.local`. A temporary local-only URL and placeholder key were used to render routes. They are not credentials and were not written to the repository.

## UI_ROUTE_AND_COMPONENT_MATRIX

The route inventory below comes from `src/App.jsx`, including every nested and role-gated route. “Current UI state”, “Design compliance”, “Responsive”, and “Action” record the before-state and findings from the initial inventory.

| Route/Page | Guest/Auth | Current UI state | Design compliance | Responsive | Action |
| --- | --- | --- | --- | --- | --- |
| `/` Home | Guest + Auth | Public landing; greeting, one featured knowledge block, AI/document links, innovation entry | Blue tokens and Be Vietnam Pro; home has no learning shortcut; guest nav has 4 items and ends at Login | Mobile CSS present; browser check pending | Add learning entry and five consistent nav items; retain one featured block |
| `/tri-thuc` Knowledge | Guest + Auth | Public knowledge hub with documents, topics, AI entry | Shared header/cards; audit tabs and empty/error states | Mobile CSS present; browser check pending | Verify public route and error/empty states |
| `/tri-thuc/hoi-ai` Ask AI | Guest + Auth | Prompt, answer, citations, no-evidence and error branches | Shared controls; keep backend messages normalized | Mobile CSS present; browser check pending | Verify guest entry and calm no-evidence presentation |
| `/tri-thuc/van-ban` Documents | Guest + Auth | Public search, filters, pagination and document list | Shared document rows and status labels | Mobile CSS present; browser check pending | Verify scanability and overflow |
| `/tri-thuc/van-ban/:documentId` Document detail | Guest + Auth | Public metadata and click-triggered signed download | Authorization boundary is service-backed | Mobile CSS present; browser check pending | Verify metadata cue and actions |
| `/tri-thuc/chuyen-de` Learning topics | Guest + Auth | Public searchable topic list and availability | Shared list, skeleton, empty and retry states | Mobile CSS present; browser check pending | Verify guest list and navigation |
| `/tri-thuc/chuyen-de/:topicId` Learning detail | Guest + Auth | Public topic/resources and quiz metadata | Shared resource cards and signed download boundary | Mobile CSS present; browser check pending | Verify guest metadata and quiz gate |
| `/tri-thuc/trac-nghiem/:quizId` Quiz | Auth | AuthGuard, then intro, attempt, result or error | Status text and accessible answer controls exist | Mobile CSS present; browser check pending | Keep auth-on-demand state explicit; verify touch targets |
| `/doi-moi-sang-tao` Innovation | Guest + Auth | Public project list; guest submit CTA routes to login; authenticated submit CTA currently has no action | Existing cards use shared status/progress patterns | Mobile CSS present; browser check pending | Wire responsive submission dialog to existing Edge Function contract; add project detail view |
| `/cong-viec` Work | Auth | Assignment list, filters, report status and CTA | Existing status text and labels; shared campaign cards | Mobile CSS present; browser check pending | Verify gate, mobile list and status hierarchy |
| `/cong-viec/bao-cao/:assignmentId` Report detail | Auth | Assignment, submission history, uploads, review and confirmation | Existing safe file service and user-facing error mapping | Mobile CSS present; browser check pending | Verify form, history, dialog and sticky actions |
| `/ca-nhan` Profile | Auth | Account identity, organization, settings and logout | Account record is separate from Member API record; one activity item links back to self | Mobile CSS present; browser check pending | Remove non-functional self-link and clarify account identity |
| `/ca-nhan/thong-bao` Notifications | Auth | Inbox, unread state, retry and pagination | Shared status and safe internal navigation | Mobile CSS present; browser check pending | Verify list and fixed navigation spacing |
| `/ca-nhan/doi-mat-khau` Change password | Auth | Password form, validation, success/error | Existing form has legacy inline styles and inconsistent surface tokens | Mobile CSS present; browser check pending | Align with shared form/card styles and labels |
| `/login` Login | Public auth | Email/password, generic login error, forgot-password link | Legacy inline styles; not an app entry gate | Mobile CSS present; browser check pending | Align with shared controls and standalone auth surface |
| `/quen-mat-khau` Forgot password | Public auth | Email form, success and error states | Legacy inline styles | Mobile CSS present; browser check pending | Align with shared controls |
| `/dat-lai-mat-khau` Reset password | Public auth | Password confirmation, success and error states | Legacy inline styles | Mobile CSS present; browser check pending | Align with shared controls |
| `/quan-ly-doan-vien` Member list | Authorized | Search, filters, create, list, pagination and service errors | Member API is the data boundary; no profile data is sourced from Auth profile | Mobile CSS present; browser check pending | Verify role-specific list and mobile layout; do not alter API contract |
| `/quan-ly-doan-vien/:memberId` Member detail | Authorized | Progressive member detail, edit/status, audit history | Separate Member Record surface with service authorization | Mobile CSS present; browser check pending | Verify detail/actions and responsive form |
| `/admin/quan-ly-doan-vien/import` Member import | YOUTH_ADMIN | Upload, validation preview, row filters and explicit confirm | Existing import contract and confirmation flow | Mobile CSS present; browser check pending | Verify preview and confirmation affordance |
| `/admin` Admin dashboard | YOUTH_ADMIN | Metrics and management entry points | Shared token surface; older dashboard styling | Tablet/mobile CSS present; browser check pending | Audit authorized view and overflow |
| `/admin/van-ban` Admin documents | YOUTH_ADMIN | Search/filter, document authoring and review | Shared form/list patterns with some legacy dense controls | Tablet/mobile CSS present; browser check pending | Audit forms and destructive confirmations |
| `/admin/van-ban/:documentId/tri-thuc` Knowledge article admin | YOUTH_ADMIN | Draft article generation/review states | Shared header, loading, empty/error | Tablet/mobile CSS present; browser check pending | Verify actions and safe content states |
| `/admin/chuyen-de` Learning admin list | YOUTH_ADMIN | Topic list/filter/create | Shared list and form controls | Tablet/mobile CSS present; browser check pending | Verify narrow layout |
| `/admin/chuyen-de/:topicId` Learning admin detail | YOUTH_ADMIN | Topic metadata, resources and quiz management | Shared cards/forms; native confirmation where applicable | Tablet/mobile CSS present; browser check pending | Verify narrow layout and actions |
| `/admin/chuyen-de/:topicId/trac-nghiem/:quizId` Quiz editor | YOUTH_ADMIN | Quiz/question/option editor and publish/close | Shared form components; dense nested form | Tablet/mobile CSS present; browser check pending | Verify editor at mobile/tablet widths |
| `/admin/bao-cao` Admin reports | YOUTH_ADMIN | Campaign list and draft/publish forms | Existing scoped service and status controls | Tablet/mobile CSS present; browser check pending | Verify list, forms, confirmation |
| `/admin/bao-cao/:campaignId` Admin campaign | YOUTH_ADMIN | Campaign editor/detail | Same component as report management route | Tablet/mobile CSS present; browser check pending | Verify authorized route |
| `/admin/bao-cao/:campaignId/dashboard` Report dashboard | YOUTH_ADMIN | Scoped metrics, search/filter and export | Responsive aggregate rows and download actions | Tablet/mobile CSS present; browser check pending | Verify no wide-table overflow |
| `*` Not found | Guest + Auth | Branded not-found EmptyState inside app shell | Shared empty state | Mobile CSS present; browser check pending | Verify back/navigation affordance |

### Shared component inventory (before changes)

| Existing component | Use | Audit finding |
| --- | --- | --- |
| `AppShell`, `Sidebar`, `BottomNav` | Responsive shell and primary navigation | Bottom nav was guest-specific and had 4 items; safe-area/keyboard behavior needed browser verification |
| `Brand` | App mark and wordmark | Uses existing app icon and shared type |
| `Button`, `StatusBadge`, `PageHeader`, `SectionHeader` | Common actions, state, page hierarchy | Shared and token-backed; `Button` lacks a consistent loading contract |
| `EmptyState`, `Toast`, `Skeleton` | Empty, success and loading feedback | Reused; no dedicated auth-required or modal/bottom-sheet primitive |
| `Icon` | Line icons | Hand-authored SVG path map, while project Design System selects Lucide |
| `src/index.css` | Tokens, global and responsive styles | Brand palette and radius tokens exist; an unused Archivo import and scattered small labels remain |

## Before browser observations

- `390px`, guest `/`: route renders without login. The first screen has one featured knowledge block. Learning is not a direct Home action; guest bottom navigation has Home, Knowledge, Innovation and Login.
- Local auth/data services cannot reach a configured Supabase instance because `.env.local` is absent. Browser visual evidence from this local run represents shell/empty/error states only, not real content, authentication, or backend acceptance.
- A separate open draft PR #55 also changes several of these UI surfaces. This branch remains based on the requested exact master SHA; its changes are not assumed to be merged.

## Acceptance report

### Changes made

- Added the Home shortcuts for public documents, learning topics, and Ask AI. Kept the public-first greeting and one featured knowledge card in the first view.
- Made the five primary navigation destinations consistent for guests and signed-in users. Protected destinations still open in place and show the auth-required state; removed the hard-coded “2” badges.
- Raised existing compact mobile labels to an 11px minimum while preserving desktop text sizing.
- Replaced the custom SVG path map with the project’s selected Lucide icon library, retaining a single shared icon adapter.
- Added shared `AuthRequiredState` and native `Modal` components. Added visible keyboard focus, a centered desktop dialog, a mobile bottom sheet, safe-area padding, and bottom navigation keyboard handling.
- Fixed the shared `Skeleton` to use defined design tokens and announce loading as a status. Before this fix, missing CSS variables made loading surfaces appear empty.
- Reworked Innovation cards and the project detail dialog, added retry/error/empty/loading states, and wired “Gửi bài toán” to the existing `submit-innovation-problem` Edge Function. The UI sends only `title` and `pain_point`; the server still derives the organization. The current contract has no attachment field, so the form states that files are unsupported. A success state is shown only after a successful server response.
- Aligned Login, Forgot Password, Reset Password, and Change Password with the shared forms. Kept the Supabase auth calls and route behavior; added safe network-error handling and loading states. Removed Profile links that navigated back to the same page and clarified that the Account profile and Member Record are separate surfaces.
- Updated the stale public-first navigation assertions to enforce the requested shared five-destination navigation and auth-on-demand gate. Added Innovation service tests for payload boundary, validation, and safe error mapping.

### UI_ROUTE_AND_COMPONENT_MATRIX — final result

Every route declared in `src/App.jsx` was opened on the local app in a fresh guest session, with a wildcard path checked separately. Role-protected routes rendered the same login-on-demand gate without redirect loops or horizontal overflow. Dynamic detail paths were opened with a synthetic UUID solely to exercise route matching; no record was created or requested from a real backend.

| Surface | Guest/Auth | 390px | 1440px | Loading | Empty | Error | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | Guest | Visual pass; public links and 5-item nav | Visual pass; sidebar active state | N/A | N/A | N/A | PASS for shell and navigation |
| Home | Auth | Not available | Not available | N/A | N/A | N/A | BLOCKED: no authenticated rehearsal session |
| Work | Auth | Shared auth gate rendered | Shared auth gate rendered | Auth session is resolved locally | N/A | N/A | Protected content blocked; gate PASS |
| Reports | Auth | Route gate matched at 360px; real report blocked | Not inspected | N/A | N/A | N/A | BLOCKED: requires a real account and assignment |
| Knowledge | Guest/Auth | Public route, tabs, visible skeleton | Route and width smoke | Skeleton visible | Backend result unavailable | Backend result unavailable | PARTIAL: UI shell/loading verified |
| Document detail | Guest/Auth | Dynamic route matched at 360px; no record data | Not content-checked | Backend result unavailable | Not available | Not available | BLOCKED: no live public/private document |
| Learning | Guest/Auth | Search and visible skeleton | Route and width smoke | Skeleton visible | Backend result unavailable | Backend result unavailable | PARTIAL: UI shell/loading verified |
| Quiz | Auth | Guest route gate matched at 360px | Not inspected | N/A | N/A | N/A | BLOCKED: no authenticated quiz session |
| Ask AI | Guest/Auth | Form and ready state render | Route and width smoke | Not triggered | No-evidence response not requested | Backend unavailable | PARTIAL: entry UI verified; response blocked |
| Innovation | Guest/Auth | Loading then safe error; guest CTA opens login | Route and width smoke | Visible skeleton | Not available | Retry state rendered after unavailable local API | PARTIAL: guest UX verified; live content/modal submit blocked |
| Member Management | Authorized | Guest routes show shared auth gate at 360px | Not inspected | N/A | N/A | N/A | BLOCKED: no role or Member API session |
| Profile | Auth | Guest route gate matched at 360px | Not inspected | N/A | N/A | N/A | BLOCKED: no authenticated account |
| Admin | Authorized | Guest routes show shared auth gate at 360px | Not inspected | N/A | N/A | N/A | BLOCKED: no YOUTH_ADMIN session |

### Browser and interaction evidence

- Browser viewport sweep: `360px`, `390px`, `768px`, and `1440px`. Home, Knowledge, Documents, Learning, Ask AI, Innovation, and the protected Work gate had no horizontal overflow at each width. Full route smoke at `360px` found no overflow on declared routes or the wildcard path.
- Public navigation clicks passed: Home → Ask AI, Home → public documents, bottom navigation → Knowledge, protected Work gate → Login, and Innovation guest submit CTA → Login.
- Login, Forgot Password, and Reset Password were checked at `360px`, `390px`, `768px`, and `1440px`; all render without overflow and every input has an associated label. Login at `1440px` shows both the introduction and form. A keyboard Tab placed focus on the email field with its blue border and halo visible.
- Computed styles on visible text were checked at `360px` and `390px` across Home, Knowledge, Innovation, Work auth gate, and Login; no text rendered below `11px`, and none of those routes overflowed.
- The browser used `127.0.0.1:5174` with a process-only dummy Supabase URL/key and no local Supabase service. No credentials or `.env` file were added or changed. Public data requests therefore remain in loading/error states; the Innovation list surfaced its retry error after about 12 seconds.
- Authenticated home, Work/report contents, private document detail, Profile, authorized Member Management/Admin, Ask AI citations/no-evidence, logout/session restore, Innovation modal/bottom sheet, and server submission could not be accepted locally without the real rehearsal Supabase and Member API environment. No synthetic account/session or fake content was used.

### Screenshot evidence

Screenshots are stored under `docs/ui-ux-end-to-end-finalization/screenshots/`:

| File | Route / state | Viewport | Before → after evidence |
| --- | --- | ---: | --- |
| `guest-home-390.png` | `/`, Guest | 390 × 844 | Four-item guest menu and no learning shortcut → public landing with five-item navigation and three direct public shortcuts |
| `guest-home-1440.png` | `/`, Guest | 1440 × 1000 | Same one-featured-card hierarchy in desktop shell |
| `public-knowledge-390.png` | `/tri-thuc`, Guest | 390 × 844 | Empty-looking card → visible token-backed loading skeleton |
| `public-documents-390.png` | `/tri-thuc/van-ban`, Guest | 390 × 844 | Loading list now visible below mobile filters |
| `public-learning-390.png` | `/tri-thuc/chuyen-de`, Guest | 390 × 844 | Loading topics now visible below search |
| `ask-ai-390.png` | `/tri-thuc/hoi-ai`, Guest | 390 × 844 | Public question form and calm ready state |
| `innovation-loading-390.png` | `/doi-moi-sang-tao`, Guest | 390 × 844 | Visible loading state |
| `innovation-390.png` | `/doi-moi-sang-tao`, Guest | 390 × 844 | Safe retry error because local data API is unavailable |
| `auth-on-demand-390.png` | `/cong-viec`, Guest | 390 × 844 | Protected feature shows a clear in-place login gate |
| `auth-on-demand-1440.png` | `/cong-viec`, Guest | 1440 × 1000 | Same gate in desktop sidebar layout |
| `login-mobile-390.png` | `/login`, Guest | 390 × 844 | Compact, branded sign-in form |
| `login-desktop-1440.png` | `/login`, Guest | 1440 × 1000 | Added the previously empty desktop intro column |
| `forgot-password-390.png` | `/quen-mat-khau`, Guest | 390 × 844 | Shared auth form and safe-area layout |
| `reset-password-390.png` | `/dat-lai-mat-khau`, Guest | 390 × 844 | Shared auth form and labelled password fields |

The authenticated and modal screenshots requested by the brief are not present because the local environment has no real account, role, or rehearsal backend. The form/modal code was reviewed; its real submission and native mobile keyboard behavior remain unaccepted.

### Validation

- `npm test`: **207/207 passed**.
- `npm run lint`: **0 errors**, 3 existing Fast Refresh warnings in `Guards.jsx` and `AuthContext.jsx`.
- `npm run build`: **passed**. Vite reports the existing main JS chunk exceeds 500 kB (513.97 kB); code splitting remains outside this UI task.
- `git diff --check`: passed.
- The current PR #55 (`feat/ui-reference-reconciliation`) was found to overlap several UI files. This branch remains based on the requested master SHA; the other PR’s changes are not included or treated as acceptance evidence.

### Verdict and next gate

`UI_UX_END_TO_END_FINALIZATION_BLOCKED_NO_REHEARSAL_RUNTIME`

The source/UI, guest route shell, responsive widths, public navigation, auth gate, local test suite, lint, and build are complete. The end-to-end verdict stays blocked because there is no real Supabase or Member API connection, authenticated role, public content fixture, private document, or working on-device keyboard context in this workspace. Owner review on a Vercel Preview connected to the rehearsal runtime is required before merge. No backend/security contract was changed, and Phase 6 was not opened.

### Handoff

- Starting SHA: `2095ebb98c572f10a5b04a08396e3e3569fb1271`.
- Branch: `codex/ui-ux-end-to-end-finalization`.
- Final commit SHA and PR URL are included in the task handoff.
