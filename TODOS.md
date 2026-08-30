# TODOS

## Deferred from plan-eng-review (2026-08-07)

### 0) Gate recap workflow behind sign-in
- What: Require authenticated users before allowing session creation/upload/pipeline start in the web UI.
- Why: Prevent anonymous/public submissions and tie usage to known accounts.
- Pros: Better abuse prevention, traceability, and eligibility controls.
- Cons: Requires auth UX, backend session validation, and account lifecycle handling.
- Context: Current app uses a shared contractor token for local beta and does not enforce end-user identity.
- Depends on / blocked by: Choosing auth provider and token/session verification strategy.

### 1) Upload abuse controls for direct uploads
- What: Add server-side MIME sniffing, malware scan, and quarantine flow for uploaded audio objects.
- Why: Signed upload URLs limit auth surface but do not fully prevent malformed/malicious payload abuse.
- Pros: Stronger security posture and fewer surprise incidents during broader rollout.
- Cons: Adds processing latency and infra complexity.
- Context: V1 already uses signed uploads and strict policy constraints; this extends safety beyond URL controls.
- Depends on / blocked by: Upload service contract, storage event hooks, and asynchronous job infrastructure.

### 2) Cost envelope and model fallback policy
- What: Define per-session cost caps (audio minutes, token ceilings) and model-tier fallback rules.
- Why: Pilot economics can fail even when quality and speed are acceptable.
- Pros: Predictable spend and safer scaling decisions.
- Cons: Requires instrumentation, policy checks, and operational runbooks.
- Context: Current plan defines performance SLOs but not explicit cost SLOs.
- Depends on / blocked by: Usage telemetry and provider billing instrumentation.

### 3) Phase-2 pilot sample expansion
- What: Add second pilot phase (20+ sessions) after initial 3-5 recap workflow validation.
- Why: Small pilots validate workflow fit but not reliability distribution.
- Pros: Higher confidence in go/no-go and better failure-rate visibility.
- Cons: Extends validation timeline before scale-up.
- Context: Current exit criteria are based on 3-5 sessions and can be statistically noisy.
- Depends on / blocked by: Completion of initial pilot and stable instrumentation baselines.
