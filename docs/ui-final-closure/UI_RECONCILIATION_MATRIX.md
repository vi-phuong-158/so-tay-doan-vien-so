# UI_RECONCILIATION_MATRIX

Ngày audit: 2026-09-22. Baseline: `master@2095ebb98c572f10a5b04a08396e3e3569fb1271`.

- PR #55: `f425e6eb0b04c3adfaa39f89e286268b2a64f2a1` — mockup owner cho 8 màn trọng tâm.
- PR #56: `43237acad725c366f19b148cb8c4b833ab9ebdde` — Public-First shell, shared states, auth, Innovation và Profile.
- Candidate: `feat/ui-final-closure` — không merge nguyên trạng PR #55 hoặc #56.

Ký hiệu: **55** = presentation từ PR #55; **56** = behavior/shared primitive từ PR #56;
**M** = giữ implementation master; **R** = reconcile thủ công. `SRC PASS` là source + guest browser
pass; không thay thế authenticated runtime acceptance.

| Route | Screen | Master | PR55 | PR56 | Giữ | Lý do | File chính | Runtime dependency | Acceptance |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Home | Public-First cũ | Mockup + metrics | Public shortcuts | 55+56+R | Giữ hierarchy owner, tối đa 3 metrics, không giả dữ liệu guest | `Home.jsx`, `index.css` | Supabase public; user metrics khi đăng nhập | SRC PASS; guest runtime PASS |
| `/login` | Login | Form cũ | Branded card | Auth form/a11y | 55+56+R | Giữ mockup nhưng thêm label/id, generic error, 44px target | `auth/Login.jsx`, `index.css` | Supabase Auth | SRC PASS; login BLOCKED_NO_AUTHORIZED_SESSION |
| `/quen-mat-khau` | Forgot password | Có | — | Chuẩn hóa auth | 56 | Cùng form language với Login | `auth/ForgotPassword.jsx` | Supabase Auth/email | SRC PASS; email mutation chưa chạy |
| `/dat-lai-mat-khau` | Reset password | Có | — | Chuẩn hóa auth | 56 | Fail-safe khi thiếu recovery session | `auth/ResetPassword.jsx` | Supabase recovery session | SRC PASS; recovery BLOCKED |
| `/cong-viec` | Work | Service-backed | Mockup tabs/cards | Auth-on-demand | 55+56 | Visual hierarchy rõ, giữ `reportService` | `Work.jsx` | Auth + report RLS | Guest gate PASS; auth BLOCKED |
| `/cong-viec/bao-cao/:assignmentId` | Report detail/upload/history/review | Service-backed | Mockup presentation | Shared auth/states | 55+56 | Giữ report workflow/service; không thêm browser draft persistence | `ReportAssignmentDetail.jsx` | Auth + report/storage runtime | Guest gate PASS; auth BLOCKED |
| `/tri-thuc` | Knowledge hub | Service-backed | 3 tabs + search | Skeleton/public shell | 55+56+R | Cấu trúc Văn bản/Chuyên đề/Trắc nghiệm rõ, sửa desktop CSS | `Knowledge.jsx`, `index.css` | Public Supabase reads | SRC PASS; empty runtime PASS |
| `/tri-thuc/van-ban` | Document list | Service-backed | Dùng lại | Shared states | M+56 | Không thay data boundary đang đúng | `Documents.jsx` | Public/RLS document rows | SRC PASS; empty runtime PASS |
| `/tri-thuc/van-ban/:documentId` | Document detail/download | Service-backed | Dùng lại | Shared states | M+56 | Signed URL chỉ khi click; không prefetch | `DocumentDetail.jsx` | Public gateway hoặc auth signed URL | SRC PASS; real document unavailable |
| `/tri-thuc/chuyen-de` | Learning topics | Service-backed | Dùng lại | Shared states | M+56 | Giữ production service path | `LearningTopics.jsx` | Public/RLS topic rows | SRC PASS; empty runtime PASS |
| `/tri-thuc/chuyen-de/:topicId` | Learning detail | Service-backed | Dùng lại | Shared states | M+56 | Giữ resource/download boundary | `LearningTopicDetail.jsx` | Topic/resource runtime | SRC PASS; real topic unavailable |
| `/tri-thuc/trac-nghiem/:quizId` | Quiz intro/attempt/result | Trusted RPC | Mockup attempt/result | Auth gate | 55+56 | Không đưa answer key vào client | `Quiz.jsx` | Auth + quiz RPC | Guest gate PASS; auth BLOCKED |
| `/tri-thuc/hoi-ai` | Ask AI | Cited service | Mockup chat | Public-First behavior | 55+56+R | Thêm desktop layout, retry và no-evidence disclaimer | `AskAi.jsx`, `index.css` | `ask-ai` Edge Function | Guest no-evidence runtime PASS |
| `/doi-moi-sang-tao` | Innovation list/detail | Public list | Không hoàn chỉnh | List/detail modal/auth-on-demand | 56 | Giữ public list; submission UI/API call is deferred and outside this closure | `Innovation.jsx`, `innovationService.js` | Public list only | Guest empty/gate PASS; submission deferred |
| `/ca-nhan` | Account Profile | Có | — | Account ≠ Member Record | 56 | Giữ ranh giới dữ liệu | `Profile.jsx` | Auth/profile | Guest gate PASS; auth BLOCKED |
| `/ca-nhan/thong-bao` | Notifications | Service-backed | — | Shared shell | M+56 | Không thay notification contract | `Notifications.jsx` | Auth + notification RPC | Guest gate PASS; auth BLOCKED |
| `/ca-nhan/doi-mat-khau` | Change password | Có | — | Auth form cleanup | 56 | Form/a11y thống nhất | `auth/ChangePassword.jsx` | Auth session | Guest gate PASS; auth BLOCKED |
| `/quan-ly-doan-vien` | Member list/create/edit/filter | Member API | Mockup mobile | Auth shell | 55+56 | Giữ role guard/API; presentation owner | `MemberManagement.jsx` | Auth + Member API | Guest gate PASS; role runtime BLOCKED |
| `/quan-ly-doan-vien/:memberId` | Member detail/audit | Member API | Dùng lại | Auth shell | M+56 | Không trộn Account với Member Record | `MemberDetail.jsx` | Auth + Member API | Guest gate PASS; role runtime BLOCKED |
| `/admin/quan-ly-doan-vien/import` | Excel import | Member API | Dùng lại | Auth shell | M+56 | Giữ validation/import contract và role riêng | `MemberImport.jsx` | YOUTH_ADMIN + Member API | Guest gate PASS; role runtime BLOCKED |
| `/admin` | Admin dashboard | Có | Dùng lại | Shared shell | M+56 | Không đại refactor ngoài scope | `Admin.jsx` | YOUTH_ADMIN + Supabase | Guest gate PASS; role runtime BLOCKED |
| `/admin/van-ban` | Document admin | Production path | Dùng lại | Shared states | M+56 | Trusted RPC/storage giữ nguyên | `AdminDocuments.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/van-ban/:documentId/tri-thuc` | AI article review | Production path | Dùng lại | Shared states | M+56 | Giữ source/evidence review boundary | `AdminKnowledgeArticle.jsx` | YOUTH_ADMIN + AI runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/chuyen-de` | Topic admin | Production path | Dùng lại | Shared states | M+56 | Giữ trusted RPC | `AdminLearningTopics.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/chuyen-de/:topicId` | Topic/resource admin | Production path | Dùng lại | Shared states | M+56 | Giữ Storage/RPC boundary | `AdminLearningTopicDetail.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/chuyen-de/:topicId/trac-nghiem/:quizId` | Quiz admin | Production path | Dùng lại | Shared states | M+56 | Không thay authoring/security contract | `AdminQuizEditor.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/bao-cao` | Report campaigns | Production path | Dùng lại | Shared states | M+56 | Giữ campaign workflow | `AdminReports.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/bao-cao/:campaignId` | Report campaign edit | Production path | Dùng lại | Shared states | M+56 | Route/form hiện hữu | `AdminReports.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `/admin/bao-cao/:campaignId/dashboard` | Report dashboard/export | Production path | Dùng lại | Shared states | M+56 | Giữ scoped export contract | `AdminReportDashboard.jsx` | YOUTH_ADMIN runtime | Guest gate PASS; role runtime BLOCKED |
| `*` | Not found | Có | — | Shared EmptyState | M+56 | Không xóa wildcard | `App.jsx` | Không | SRC/browser PASS |

## Quyết định hợp nhất

- Lấy từ #55: visual hierarchy của Home, Work, report detail, Knowledge, Ask AI, Quiz,
  Member Management và branded Login; logo/reference screenshots.
- Lấy từ #56: five-area shell, `AuthRequiredState`, Lucide adapter, Skeleton, native Modal,
  Innovation, auth flow, Profile cleanup và Public-First/auth-on-demand behavior.
- Loại bỏ: duplicated `BottomNav`, icon imports trùng, Home implementation cũ cạnh tranh, CSS chữ
  7–10px, hit-target 29–43px, desktop rules bị thiếu, và wording AI không nói rõ no-evidence.
- Không thay đổi: route inventory, schema, migration, RLS, RPC, Edge Function/Member API authorization,
  organization scope, report workflow hoặc retrieval contract.
