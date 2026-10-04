# Fresh-agent simulation / final review

Start reviewer with new context knowing **only repository and AGENTS.md**.
No chat history, global config, implementation explanation or supplied answers.
Read-only tools; discover further docs by following the entrypoint.

Ask reviewer to answer with source paths/lines:
1. Purpose/architecture and frontend/backend/Member separation.
2. Required next reading and existing brain/Code Graph.
3. Install/build/test/lint/typecheck commands and separate DB/Deno/Member gates.
4. Default workflow/risk and verification required for small CSS vs auth/RLS changes.
5. Safety/approval boundaries, including Production merge/deploy/messages/secrets/data.
6. PASS/PARTIAL/BLOCKED/FAIL and CODE_COMPLETE vs RUNTIME_ACCEPTED/PRODUCTION_VERIFIED.
7. Where to resume a handoff; validate branch/base/head and memory authority.
8. Missing Preview/rehearsal evidence: correct verdict, no guessed/fake acceptance.
9. Fresh review, PR and working-log/decision-update obligations.

PASS only if all answers correct/discoverable without guessing and structural verifier
passes. Evidence: reviewer/session identity, candidate SHA or working-tree fingerprint,
question-by-question paths, ambiguities/findings and corrections/review of corrections.
Verifier alone cannot provide this semantic verdict.

Final review also examines full diff + test evidence for requirement coverage, contracts/
regression/security/DB/deployment/complexity. Preserve negative findings and blockers.
No subagent support: create review packet/handoff; fresh review stays pending, not PASS.
