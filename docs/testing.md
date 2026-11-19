# Testing

Extends the Tests rules in `AGENTS.md`.

- Inline mocks of this repository's own modules remain fine.
- Remove secrets and personal data from a recording before committing it.

## When a test fails

- Diagnose it against intended behaviour before editing code or tests.
  The fix may span production code, shared test utilities, fixtures and
  regression coverage.
- Do not weaken assertions, widen timeouts, add sleeps or add retries to
  hide a race. Use deterministic state setup and observable readiness
  conditions.
- When a failure exposes a coverage gap, add a regression test at the most
  useful boundary.
- Verify the focused failure first, then run the affected suite and the
  relevant integration tests. Use repeated or stress runs only to test a
  specific flakiness hypothesis or verify a stability fix.
