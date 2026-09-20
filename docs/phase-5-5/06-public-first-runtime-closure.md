# Public-First Runtime Closure

## VERDICT

`PUBLIC_FIRST_RUNTIME_FINAL_ACCEPTANCE_PASS`

## STARTING STATE

- Master: `ab7242787965c7669caeeef6eb6e2d44b214b974` (PR #53).
- Rehearsal: `znexculhbdjiflkczpyu`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Before closure: Public-First migration absent; `ask-ai` v7 used `verify_jwt=true`; no
  `public-content-url` deployment. Vercel production was READY on `ab72427`.

## ROOT CAUSE

Vercel had PR #53 frontend code while rehearsal retained the old RLS/function runtime. Current
`sb_publishable_*` keys are application credentials, not user JWTs: gateway JWT verification would
reject guest calls before the handler. The merged guest fallback also treated any failed bearer as
guest, which would downgrade invalid user credentials.

## CHANGES

- Applied `202609180001_public_first_auth` and forward migrations
  `202609200001_public_first_quiz_read_hardening` / `202609200002_public_ai_quota_policy` to rehearsal.
- Deployed `ask-ai` v8 and `public-content-url` v1 with `verify_jwt=false`.
- Added in-handler application-key/valid-user separation; malformed, expired, and forged bearer
  tokens now fail closed with 401.
- Preserved Phase 4 quiz hardening: guest metadata/CTA only; no direct questions/options reads.

## AUTH MODEL

| Request | Valid user JWT | Path |
| --- | ---: | --- |
| guest | no | configured application key, fixed public retrieval/content lookup |
| authenticated | yes | Supabase Auth verification, existing scoped retrieval/persistence |
| malformed/expired/forged token | invalid | reject with 401 |

## PUBLIC DATA MATRIX

| Surface | Guest contract | Hosted evidence |
| --- | --- | --- |
| Document / Learning / Innovation | `PUBLISHED + PUBLIC` only | Browser list/detail fixture rendered; SQL anon allow confirms fixed predicate |
| Quiz | Metadata only; no direct questions/options | anon SELECT on both tables is false; dead question policy removed |
| AI | fixed public corpus, hourly hashed quota, no history | Browser returned public citation; public query excluded internal fixture; persistence counts were zero |
| Storage | private buckets; typed parent lookup; 60-second URL | buckets private; malformed/random IDs fail closed |

## RUNTIME EVIDENCE

- Browser: public Vercel deployment (`ab72427`) rendered guest home, document list/detail, topic,
  innovation, and Ask AI. Ask AI returned the synthetic public source with citation and no console
  errors.
- SQL with `role anon`: public fixture visible/retrievable = 1; internal fixture visible/retrievable =
  0; private storage object list = 0.
- Guest AI persistence: conversations/messages/citations for the test prompt = 0.
- All marked synthetic DB fixtures were deleted; final counts were zero.

## NEGATIVE SECURITY TESTS

- Forged `Authorization: Bearer forged.invalid.token`: `ask-ai` returned 401 `UNAUTHENTICATED`.
- Malformed content UUID: 400 `INVALID_CONTENT_ID`.
- Unknown content type: 400 `INVALID_CONTENT_TYPE`.
- Random UUID: 404 `CONTENT_NOT_FOUND`.
- Internal knowledge source: absent from public retrieval result.
- Anonymous quiz question/option reads and private bucket object list: denied.

## TEST RESULTS

- Root `npm test`: PASS, 204/204.
- `npm run lint`: 0 errors, 4 existing warnings.
- `npm run build`: PASS.
- Member API: blocked, no `MEMBER_DATABASE_URL` and local `exceljs` dependency absent; no code changed.
- pgTAP and Deno: blocked locally because Supabase CLI/Deno are unavailable.
- Browser: guest route/list/detail/AI PASS. Authenticated preview login, session persistence after reload,
  and organization-scoped document detail PASS. The download-button click did not surface a browser
  download event; the private signed-byte contract was verified separately below.
- Exact source SHA `633c5cf4142675b2b780f35e0372e6f6eff87602`: GitHub Actions CI run `35486717207`
  completed successfully; Vercel check succeeded for the matching preview deployment.

## SECURITY ADVISORS

Public-First introduced one intended anonymous executable `SECURITY DEFINER` function:
`search_public_knowledge`; it has fixed public predicates and pinned `search_path`. The quota
function is service-role-only. The explicit quota policy removes the new RLS-without-policy lint.
Existing advisor notices remain: 14 deny-by-default RLS tables, `vector`/`pgtap` extensions in
`public`, and historical executable helper notices. The Public-First anonymous function was
reviewed as intentional. Supabase Auth also reports leaked-password protection disabled; this is a
pre-existing Auth configuration finding outside the deployed Public-First code path and remains an
owner follow-up.

## DEPLOYMENT

- Rehearsal only; no production Supabase data mutation.
- Applied migrations: `202609180001_public_first_auth`,
  `202609200001_public_first_quiz_read_hardening`, `202609200002_public_ai_quota_policy`.
- Functions: `ask-ai` v7 → v8, `verify_jwt=true` → `false`; `public-content-url` v1,
  `verify_jwt=false`.

## FINAL ACCEPTANCE (2026-09-20)

- Branch: `codex/public-first-runtime-closure`; source under test and remote branch head before this
  documentation follow-up: `633c5cf4142675b2b780f35e0372e6f6eff87602`. Base is
  `master@ab7242787965c7669caeeef6eb6e2d44b214b974` (PR #53). PR #54 remains open and unmerged.
- Preview deployment `dpl_5gRUHaUsYpREPqFk3N8xZMLA8PyE` is `READY`, target `preview`, and built from
  the exact source SHA above. Its bundled frontend resolves to
  `znexculhbdjiflkczpyu.supabase.co`.
- Existing `.env` variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `SUPABASE_PUBLISHABLE_KEY`. The URL resolves to rehearsal project `znexculhbdjiflkczpyu` and the
  credentials provide the required Auth Admin and Storage fixture access. No credential values were
  recorded; `.env` was not changed.
- Synthetic rehearsal fixture: two active member users in separate organizations, one published
  `ORGANIZATION_ONLY` document, one 38-byte object in the private `documents-private` bucket, and one
  authenticated no-evidence AI conversation. No source evidence or canonical content was changed.
- Authenticated API: the owner can read the document and create a 60-second signed URL; fetching it
  returned HTTP 200, `text/plain`, and the exact 38-byte fixture content. The other organization and
  anonymous user cannot read or sign the object. `public-content-url` returned 404 for the private
  document. A forged bearer returned 401.
- Authenticated AI returned the exact no-evidence answer with zero citations and persisted only the
  expected conversation and two messages. Direct quota table/RPC access, quiz question/option reads,
  audit log/email queue reads, role escalation, and organization reassignment were denied.
- Authenticated browser: login on the exact-SHA preview succeeded, the session survived a reload,
  the private document detail rendered for the owner, and logout returned to the login page. The
  browser automation did not expose a native download event after the detail-page button click; the
  signed-byte download itself was independently verified through the authenticated Storage client.
- Cleanup verified zero remaining fixture documents, conversations, AI messages, profiles, roles,
  and private Storage objects. Both synthetic Auth users returned 404 after deletion.
- No production data was changed and PR #54 was not merged. No Phase 6 work was started.

## REMAINING LIMITATIONS

- The in-app browser did not expose a native download event for the `window.open` action. The
  signed-URL creation, authorization boundary, expiry setting, HTTP response, content type, and exact
  bytes were verified through the authenticated Storage client; rerunning a browser-native download
  event is needed only if that specific browser event is a mandatory acceptance criterion.

## FINAL SOURCE SHA

`633c5cf4142675b2b780f35e0372e6f6eff87602` — exact source SHA used by the preview and successful
CI run `35486717207`. This final report update changes documentation only; its pushed commit and
checks are tracked by PR #54.

## NEXT STEP

Keep PR #54 open for owner review. No merge, production change, or Phase 6 work is part of this
acceptance closure.
