# Public-First Runtime Closure

## VERDICT

`PUBLIC_FIRST_RUNTIME_ACCEPTANCE_BLOCKED_COMMIT_CONFIRMATION_AND_REHEARSAL_FIXTURE_CAPABILITY`

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
- Browser: guest route/list/detail/AI PASS; signed-byte download and authenticated persona remain unproven.
- CI: no exact final source SHA exists yet, so no CI evidence is claimed.

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

## FINAL ACCEPTANCE ATTEMPT (2026-09-20)

- Branch is `codex/public-first-runtime-closure`; starting `HEAD` and `origin/master` are both
  `ab7242787965c7669caeeef6eb6e2d44b214b974`.
- The reviewed Public-First source and documentation are staged only. The commit operation awaits
  direct owner confirmation, so no final SHA, push, PR, or exact-SHA CI result exists.
- Rehearsal Auth Admin and Storage fixture capabilities are unavailable through the connected
  management interface. Local credential files were checked by presence and target host only; their
  configured URL is not rehearsal, so none was used. No synthetic account, profile, role, document,
  Storage object, plaintext credential, or temporary secret was created.
- The browser authenticated-login step remains unrun because it requires a rehearsal-only
  disposable credential and action-time authorization to enter it in the hosted application.
- A signed-byte test cannot be substituted with Storage metadata: an object upload capability is
  required to produce real private bytes. The former `SIGNED_URL_FAILED` result therefore remains
  the correct fail-closed outcome for a metadata-only fixture.
- Security recheck: anonymous quota, quiz questions/options, audit logs, and email queue access are
  denied; private-bucket object visibility is zero under RLS; public retrieval execute is granted
  only to its fixed contract; forged bearer behavior remains 401 from the earlier live probe.

## REMAINING BLOCKERS

1. Direct owner confirmation is required before creating the staged commit and pushing it for
   exact-head CI.
2. Provide a rehearsal-only Auth Admin fixture capability or disposable active-user credential,
   then authorize its browser sign-in at action time.
3. Provide a safe rehearsal Storage upload capability for a marked private fixture containing real
   bytes.

## FINAL SHA

Working branch base: `ab7242787965c7669caeeef6eb6e2d44b214b974`; reviewed changes are staged and
uncommitted.

## NEXT STEP

Obtain direct commit authorization and the two rehearsal fixture capabilities, then rerun the
authenticated-browser and signed-download matrices. No Phase 6 work is required.
