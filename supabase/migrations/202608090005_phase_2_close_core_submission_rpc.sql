-- Phase 2 · P2-06 — Close the direct core submission RPC bypass (forward-only).
--
-- Production submissions must enter through create_report_submission_with_files(), which
-- carries the required file-finalization contract. The three-argument function remains an
-- internal SECURITY DEFINER core called by that wrapper, but must not be callable by users.

revoke execute on function public.create_report_submission(uuid, text, text) from authenticated;
