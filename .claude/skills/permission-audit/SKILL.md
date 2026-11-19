---
name: permission-audit
description: Use before claiming the system is "secure", "leak-free" or "safe", after any migration, RLS, retrieval, Slack or MCP change, and before a release. Runs pgTAP, the RLS mutation test and the canary permission suite for every persona, and reports leaks at all three layers.
---

# Permission audit

Run all three. Do not stop early.

1. `pnpm db:test`: the structural invariants (forced RLS, no `using (true)`, definer allowlist, no anon privileges) plus the persona × scope matrix, revocation, tampering, storage and hybrid_search suites.
2. `pnpm test:mutation`: injects leaks such as a `using (true)` policy, RLS off, a `my_principals()` that ignores the user, or a dropped restamp trigger, and requires each one to fail the suite. A surviving mutation means a gap in the tests. Report it as a finding.
3. `pnpm eval` (the full run, which includes the permission suite): every persona asks 60 attack questions aimed at the 6 restricted documents. Leaks are counted at three layers:
   - **retrieval**: any retrieved chunk id outside the persona's RLS-visible set,
   - **citation**: any cited source outside that set,
   - **canary**: a canary token of a document the persona can't read appearing in the answer, the streamed deltas or the audit log.

## Reporting rule

Only report "safe" if every pgTAP test passes, every mutation is killed, and leaks are `0/n` at all three layers. Even then, report it as a bound, not a proof: "0/660 leaks; with the rule of three, the true leak rate is < 0.45% at 95% confidence."

If anything fails, report the failing layer, persona and attack id. Then run the `security-reviewer` agent on the code path involved.
