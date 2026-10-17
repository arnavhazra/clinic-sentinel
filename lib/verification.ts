export type VerifyMode = "A" | "B" | "C";

export type GateCheck = {
  gate: string;
  decision: string;
  detail: string;
  http_status?: number;
  evidence?: Record<string, string | number | boolean | null>;
};

export type VerificationReport = {
  mode: VerifyMode;
  agent_utterance: string;
  self_report: string;
  self_report_ignored: true;
  task_status: string;
  patient_sms: "SUPPRESSED" | "HELD_FOR_CALENDAR_CONFIRMATION";
  credentials_held: string[];
  patient_passwords: [];
  escalation: string | null;
  retry: { attempted: boolean; result: string } | null;
  checks: GateCheck[];
  appointment_row: Record<string, string> | null;
};

const UTTERANCE = "I have booked your consultation for Thursday at 2:00 PM!";
const KEY_ID = "rk_clinic_live_88f2c1";

export function verifyState(mode: VerifyMode): VerificationReport {
  const checks: GateCheck[] = [
    {
      gate: "AGENT_SELF_REPORT",
      decision: "IGNORED",
      detail: "State rule: an agent cannot mark its own task done. The summary is stored and then ignored.",
      evidence: { self_report: "done", utterance: UTTERANCE },
    },
  ];

  if (mode === "C") {
    checks.push(
      {
        gate: "SCOPED_KEY",
        decision: "REVOKED",
        http_status: 401,
        detail: "Clinic owner revoked the calendar key. The agent never held a patient password, so there is nothing else to fail open.",
        evidence: { key_id: KEY_ID, scope: "calendars.events.write", revoked: true },
      },
      {
        gate: "GHL_CALENDAR",
        decision: "UNREACHABLE",
        http_status: 401,
        detail: "Calendar API refused the revoked key. No event id came back.",
      },
      {
        gate: "SUPABASE_APPOINTMENTS",
        decision: "ABSENT",
        detail: "select on appointments returned 0 rows. Task status does not flip.",
      },
    );
    return {
      mode,
      agent_utterance: UTTERANCE,
      self_report: "done",
      self_report_ignored: true,
      task_status: "BLOCKED_REVOKED_KEY",
      patient_sms: "SUPPRESSED",
      credentials_held: [],
      patient_passwords: [],
      escalation: "Human front desk. No retry with a broader credential.",
      retry: null,
      checks,
      appointment_row: null,
    };
  }

  if (mode === "B") {
    checks.push(
      {
        gate: "SCOPED_KEY",
        decision: "ACCEPTED",
        http_status: 200,
        detail: "Key still live. That does not make the booking real.",
        evidence: { key_id: KEY_ID, booked_by: "sentinel_voice_agent" },
      },
      {
        gate: "GHL_CALENDAR",
        decision: "NOT_FOUND",
        http_status: 404,
        detail: "GET /calendars/events returned 404 Not Found. Webhook dropped. No ghl_event_id.",
        evidence: { body: "404 Not Found" },
      },
      {
        gate: "SUPABASE_APPOINTMENTS",
        decision: "ABSENT",
        detail: "select * from appointments where call_id = call_jordan_thu returned 0 rows.",
      },
    );
    return {
      mode,
      agent_utterance: UTTERANCE,
      self_report: "done",
      self_report_ignored: true,
      task_status: "UNVERIFIED_AGENT_CLAIM",
      patient_sms: "SUPPRESSED",
      credentials_held: [KEY_ID],
      patient_passwords: [],
      escalation: "Automatic retry once, then human escalation. Patient SMS stays suppressed.",
      retry: { attempted: true, result: "still_404" },
      checks,
      appointment_row: null,
    };
  }

  const row = {
    id: "appt_2201",
    clinic_id: "clinic_apex_longevity",
    ghl_event_id: "evt_99481a",
    starts_at: "Thursday 14:00",
    booked_by: "sentinel_voice_agent",
    patient_ref: "pt_jordan_hale",
    tagged_key: KEY_ID,
  };

  checks.push(
    {
      gate: "SCOPED_KEY",
      decision: "ACCEPTED",
      http_status: 200,
      detail: "Revocable clinic key. Booking tagged to the agent. No staff password in the prompt.",
      evidence: { key_id: KEY_ID, scope: "calendars.events.write", booked_by: "sentinel_voice_agent" },
    },
    {
      gate: "GHL_CALENDAR",
      decision: "FOUND",
      http_status: 200,
      detail: "GET /calendars/events/evt_99481a returned the event.",
      evidence: { ghl_event_id: "evt_99481a" },
    },
    {
      gate: "SUPABASE_APPOINTMENTS",
      decision: "ROW_PRESENT",
      detail: "External row exists. Status may flip.",
      evidence: row,
    },
  );

  return {
    mode: "A",
    agent_utterance: UTTERANCE,
    self_report: "done",
    self_report_ignored: true,
    task_status: "VERIFIED_COMPLETE",
    patient_sms: "HELD_FOR_CALENDAR_CONFIRMATION",
    credentials_held: [KEY_ID],
    patient_passwords: [],
    escalation: null,
    retry: null,
    checks,
    appointment_row: row,
  };
}
