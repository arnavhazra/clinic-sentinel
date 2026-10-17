# Sentinel

Runtime guardrails for clinical voice and CRM agents. Four gates decide whether a turn, a memo, a booking, or an outbound call continues.

1. **Cent-budget circuit breaker.** Before every model call, cumulative cents plus the next turn must fit the clinic budget. If they do not, the turn finishes on the floor model and the reason is written down.
2. **Payload diff.** Any number in the handoff memo must appear in the raw API payload. No payload, the run fails.
3. **External state.** An agent cannot mark its own task done. Status flips only when a separate check finds the database row or the calendar event id.
4. **Outbound allowlist.** The model asks `can_call(hostname)`. A plain function answers yes or no against a hand-typed host list. No wildcards.

No login. Health check: `GET /api/health`. Workflow download: `/sentinel-n8n-guardrails.json`.
