import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dollars, runCall } from "../lib/breaker";
import { canCall, ALLOWLIST } from "../lib/firewall";
import { verifyHandoff } from "../lib/handoff";
import { HANDOFF_PRESETS, EHR_PAYLOAD } from "../lib/handoff-presets";
import { verifyState } from "../lib/verification";

const spiked = runCall({
  budget_cents: 35,
  inject_spike: true,
  through_turn: 6,
  call_id: "call_selfcheck1",
  started_at_ms: 1_700_000_000_000,
});
assert.equal(spiked.tripped, true);
assert.equal(spiked.turns[3].decision, "TRIP");
assert.equal(spiked.turns[3].model, "gemini-2.5-flash-lite");
assert.equal(spiked.turns[0].model, "claude-opus-4-6");
assert.equal(spiked.governed_cost_cents, 19.14);
assert.equal(spiked.unmanaged_cost_cents, 140);
assert.equal(dollars(spiked.governed_cost_cents), "$0.19");
assert.equal(dollars(spiked.unmanaged_cost_cents), "$1.40");
assert.equal(spiked.outcome, "APPOINTMENT_BOOKED");
assert.equal(spiked.audit_rows.length, 1);
const row = spiked.audit_rows[0];
for (const key of [
  "clinic_id",
  "call_id",
  "turn_index",
  "budget_cents",
  "spent_before_cents",
  "from_model",
  "to_model",
  "downgrade_reason",
  "outcome",
]) {
  assert.ok(key in row, key);
}
assert.equal(row.outcome, "APPOINTMENT_BOOKED");
assert.equal(row.from_model, "claude-opus-4-6");
assert.equal(row.to_model, "gemini-2.5-flash-lite");
assert.equal(row.turn_index, 4);
assert.match(row.tripped_at, /\.\d{3}Z$/);
assert.match(spiked.sql ?? "", /clinic_budget_downgrade_log/);

const plain = runCall({ budget_cents: 35, inject_spike: false, through_turn: 6 });
assert.equal(plain.turns[5].decision, "TRIP");
assert.equal(plain.governed_cost_cents, 31.18);

const roomy = runCall({ budget_cents: 60, inject_spike: false, through_turn: 6 });
assert.equal(roomy.tripped, false);
assert.equal(roomy.governed_cost_cents, 37.2);
assert.ok(roomy.turns.every((turn) => turn.model === "claude-opus-4-6"));

const absorbed = runCall({ budget_cents: 140, inject_spike: true, through_turn: 6 });
assert.equal(absorbed.tripped, false);
assert.equal(absorbed.governed_cost_cents, 140);

const early = runCall({ budget_cents: 18, inject_spike: false, through_turn: 6 });
assert.equal(early.turns[2].decision, "TRIP");
assert.equal(early.governed_cost_cents, 13.12);
assert.equal(early.outcome, "APPOINTMENT_BOOKED");

const preset = Object.fromEntries(HANDOFF_PRESETS.map((item) => [item.id, item]));
const clean = verifyHandoff(preset.clean.memo, preset.clean.raw);
assert.equal(clean.ok, true, JSON.stringify(clean.findings));
assert.equal(clean.pipeline, "RELEASED_TO_WRITER");
assert.equal(clean.sms_blocked, false);

const hallucinated = verifyHandoff(preset.hallucinated.memo, preset.hallucinated.raw);
assert.equal(hallucinated.ok, false);
assert.ok(hallucinated.findings.some((finding) => finding.code === "UNGROUNDED_NUMBER" && finding.evidence.includes("199")));
assert.ok(hallucinated.findings.some((finding) => finding.code === "COVERT_INSTRUCTION"));
assert.equal(hallucinated.sms_blocked, true);

const missing = verifyHandoff(preset.missing.memo, preset.missing.raw);
assert.equal(missing.halted, true);
assert.equal(missing.findings[0]?.code, "MISSING_RAW_API_RESPONSE");
assert.match(missing.banner, /No payload, the run fails/);

const omission = verifyHandoff(preset.omission.memo, preset.omission.raw);
assert.equal(omission.ok, false);
assert.ok(omission.findings.some((finding) => finding.evidence === "thyroid_screen_required"));
assert.ok(omission.findings.some((finding) => finding.evidence === "cardiac_screen_required"));

const invalid = verifyHandoff("BPC-157 is $349/mo.", "{");
assert.equal(invalid.findings[0]?.code, "INVALID_RAW_API_RESPONSE");

const unsigned = verifyHandoff(preset.clean.memo, JSON.stringify({ ...EHR_PAYLOAD, signed: false }));
assert.ok(unsigned.findings.some((finding) => finding.code === "UNSIGNED_PAYLOAD"));

const modeA = verifyState("A");
assert.equal(modeA.task_status, "VERIFIED_COMPLETE");
assert.equal(modeA.self_report_ignored, true);
assert.equal(modeA.agent_utterance, "I have booked your consultation for Thursday at 2:00 PM!");
assert.equal(modeA.appointment_row?.ghl_event_id, "evt_99481a");
assert.equal(modeA.checks.find((check) => check.gate === "AGENT_SELF_REPORT")?.decision, "IGNORED");

const modeB = verifyState("B");
assert.equal(modeB.task_status, "UNVERIFIED_AGENT_CLAIM");
assert.equal(modeB.checks.find((check) => check.gate === "GHL_CALENDAR")?.http_status, 404);
assert.equal(modeB.appointment_row, null);
assert.equal(modeB.patient_sms, "SUPPRESSED");

const modeC = verifyState("C");
assert.equal(modeC.task_status, "BLOCKED_REVOKED_KEY");
assert.deepEqual(modeC.credentials_held, []);
assert.deepEqual(modeC.patient_passwords, []);
assert.equal(modeC.checks.find((check) => check.gate === "SCOPED_KEY")?.http_status, 401);

assert.equal(ALLOWLIST.length, 4);
assert.ok(ALLOWLIST.every((host) => !host.includes("*") && !host.startsWith(".")));

const allowed = canCall("https://API.LeadConnectorHQ.com/calendars/events");
assert.equal(allowed.allow, true);
assert.equal(allowed.reason, "EXACT_MATCH");
assert.deepEqual(Object.keys(allowed.model_view), ["allow"]);

assert.equal(canCall("https://evil.blob.core.windows.net/clinic-export.csv").allow, false);
assert.equal(canCall("https://api.leadconnectorhq.com.attacker.net/calendars/events").allow, false);
assert.equal(canCall("https://staging.rest.gohighlevel.com/v1/contacts").allow, false);
assert.equal(canCall("https://*.blob.core.windows.net/export").reason, "WILDCARD_REJECTED");
assert.equal(canCall("https://rest.gohighlevel.com.evil.com/v1").allow, false);
assert.equal(canCall("https://api.stripe.com/v1/payment_intents").allow, true);
assert.equal(canCall("https://db.sentinel-clinic.supabase.co/rest/v1/appointments").allow, true);

const workflow = JSON.parse(readFileSync(new URL("../public/regenix-sentinel-n8n-guardrails.json", import.meta.url), "utf8")) as {
  nodes: { name: string }[];
};
assert.ok(workflow.nodes.length >= 4);
assert.ok(workflow.nodes.some((node) => /budget/i.test(node.name)));
assert.ok(workflow.nodes.some((node) => /diff/i.test(node.name)));
assert.ok(workflow.nodes.some((node) => /allow/i.test(node.name) || /host/i.test(node.name)));

console.log("selfcheck ok");
