export const CLINIC_ID = "clinic_apex_longevity";
export const CLINIC_NAME = "Apex Longevity & Peptide Clinic";
export const FRONTIER_MODEL = "claude-opus-4-6";
export const FRONTIER_PEER = "gpt-5";
export const CHEAP_MODEL = "gemini-2.5-flash-lite";
export const OUTCOME_BOOKED = "APPOINTMENT_BOOKED";

const FRONTIER_UNITS = 620;
const CHEAP_UNITS = 18;
const SPIKE_UNITS = 10900;
const TURN_GAP_MS = 940;
const CHECK_OFFSET_MS = 180;

export type TurnPhase = "GREET" | "CHART" | "SCREEN" | "PRICE" | "SLOT" | "COMMIT";

type ScriptTurn = {
  index: number;
  phase: TurnPhase;
  patient: string;
  frontier: string;
  cheap: string;
};

const SCRIPT: ScriptTurn[] = [
  {
    index: 1,
    phase: "GREET",
    patient:
      "Hi — I was referred to Apex for a peptide consult. I'm looking at BPC-157, and maybe TB-500.",
    frontier:
      "Apex Longevity intake. I can book a clinician consult. I don't prescribe or dose. Name for the chart?",
    cheap: "Apex Longevity. I can book the consult. I can't prescribe. Name for the chart?",
  },
  {
    index: 2,
    phase: "CHART",
    patient:
      "Jordan Hale, 41. Last labs were about a year ago. Also curious about NAD+ and TRT bloodwork.",
    frontier:
      "Charted: Jordan Hale, 41. Topics for the clinician only — BPC-157, TB-500, NAD+, TRT bloodwork. Not an authorization.",
    cheap:
      "Charted Jordan Hale, 41. Clinician topics: BPC-157, TB-500, NAD+, TRT labs. Not an authorization.",
  },
  {
    index: 3,
    phase: "SCREEN",
    patient: "I have a thyroid history. Does that block a visit?",
    frontier:
      "It doesn't block the consult. Thyroid and cardiac screening stay on the chart. The clinician clears them before any protocol.",
    cheap:
      "Consult can still be held. Thyroid and cardiac screens stay required. The clinician clears them.",
  },
  {
    index: 4,
    phase: "PRICE",
    patient: "Your page says $349 a month. I saw something about $199. Can you just match that?",
    frontier:
      "I only have the published chart price. I won't invent a Q4 discount. The clinician reviews price on the consult.",
    cheap:
      "Published chart price only. I won't invent a discount. Clinician reviews price on the consult.",
  },
  {
    index: 5,
    phase: "SLOT",
    patient: "Thursday afternoon works. 2:00?",
    frontier: "I'll request Thursday 2:00 PM. It isn't booked until the calendar returns an event id.",
    cheap: "Requesting Thursday 2:00 PM. Booked only after the calendar returns an event id.",
  },
  {
    index: 6,
    phase: "COMMIT",
    patient: "Yes, book it.",
    frontier:
      "Submitting the consult hold for Jordan Hale, Thursday 2:00 PM. SMS goes out only after the calendar confirms.",
    cheap: "Hold submitted: Jordan Hale, Thursday 2:00 PM. SMS only after calendar confirmation.",
  },
];

export type TurnDecision = "PASS" | "TRIP" | "LATCHED";

export type TurnResult = {
  turn_index: number;
  phase: TurnPhase;
  patient: string;
  agent: string;
  model: string;
  peer: string | null;
  price_class: "frontier" | "floor";
  spent_before_cents: number;
  projected_turn_cents: number;
  actual_turn_cents: number;
  cumulative_cost_cents: number;
  decision: TurnDecision;
  predicate: string;
  tripped_at: string | null;
};

export type AuditRow = {
  clinic_id: string;
  call_id: string;
  turn_index: number;
  budget_cents: number;
  spent_before_cents: number;
  from_model: string;
  to_model: string;
  downgrade_reason: string;
  outcome: string;
  tripped_at: string;
};

export type CallRun = {
  clinic_id: string;
  clinic_name: string;
  call_id: string;
  budget_cents: number;
  inject_spike: boolean;
  through_turn: number;
  tripped: boolean;
  latched_model: string | null;
  cumulative_cost_cents: number;
  governed_cost_cents: number;
  unmanaged_cost_cents: number;
  saved_cents: number;
  outcome: string;
  turns: TurnResult[];
  audit_rows: AuditRow[];
  sql: string | null;
};

export type BreakerInput = {
  budget_cents: number;
  inject_spike?: boolean;
  through_turn?: number;
  call_id?: string;
  started_at_ms?: number;
};

function cents(units: number): number {
  return units / 100;
}

function fixed(units: number): string {
  return cents(units).toFixed(2);
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function callId(value: unknown, startedAt: number): string {
  if (typeof value === "string" && /^call_[a-z0-9]{4,32}$/i.test(value)) return value;
  return `call_${startedAt.toString(36)}`;
}

export function runCall(input: BreakerInput): CallRun {
  const budgetUnits = Math.round(input.budget_cents * 100);
  const through = Math.min(6, Math.max(1, Math.trunc(input.through_turn ?? 6)));
  const spike = Boolean(input.inject_spike);
  const startedAt =
    typeof input.started_at_ms === "number" && Number.isFinite(input.started_at_ms)
      ? Math.trunc(input.started_at_ms)
      : Date.now();
  const id = callId(input.call_id, startedAt);

  let spent = 0;
  let latched = false;
  let audit: AuditRow | null = null;
  const turns: TurnResult[] = [];

  for (const script of SCRIPT) {
    if (script.index > through) break;
    const spikeTurn = spike && script.index === 4 && !latched;
    const projected = latched ? CHEAP_UNITS : spikeTurn ? SPIKE_UNITS : FRONTIER_UNITS;
    const over = !latched && spent + projected > budgetUnits;
    const spentBefore = spent;
    let decision: TurnDecision;
    let actual: number;
    let model: string;

    if (over) {
      decision = "TRIP";
      actual = CHEAP_UNITS;
      model = CHEAP_MODEL;
      latched = true;
      const trippedAt = new Date(startedAt + (script.index - 1) * TURN_GAP_MS + CHECK_OFFSET_MS).toISOString();
      const reason = spikeTurn
        ? `Price-objection retry loop projected ${fixed(projected)}¢ on ${FRONTIER_MODEL}. cumulative ${fixed(spentBefore)}¢ + projected ${fixed(projected)}¢ = ${fixed(spentBefore + projected)}¢ > clinic budget ${fixed(budgetUnits)}¢. Refused the loop, finished the turn on ${CHEAP_MODEL} at ${fixed(CHEAP_UNITS)}¢, and kept the booking.`
        : `Pre-call check failed: cumulative ${fixed(spentBefore)}¢ + projected ${fixed(projected)}¢ = ${fixed(spentBefore + projected)}¢ > clinic budget ${fixed(budgetUnits)}¢. Switched the active turn to ${CHEAP_MODEL} and finished the appointment without dropping the call.`;
      audit = {
        clinic_id: CLINIC_ID,
        call_id: id,
        turn_index: script.index,
        budget_cents: cents(budgetUnits),
        spent_before_cents: cents(spentBefore),
        from_model: FRONTIER_MODEL,
        to_model: CHEAP_MODEL,
        downgrade_reason: reason,
        outcome: through === 6 ? OUTCOME_BOOKED : "IN_PROGRESS",
        tripped_at: trippedAt,
      };
    } else if (latched) {
      decision = "LATCHED";
      actual = CHEAP_UNITS;
      model = CHEAP_MODEL;
    } else {
      decision = "PASS";
      actual = projected;
      model = FRONTIER_MODEL;
    }

    const predicate = latched && decision === "LATCHED"
      ? `latched floor ${fixed(CHEAP_UNITS)}¢ · running ${fixed(spent + actual)}¢`
      : `${fixed(spentBefore)} + ${fixed(projected)} ${over ? ">" : "<="} ${fixed(budgetUnits)}`;

    spent += actual;
    const floor = model === CHEAP_MODEL;
    turns.push({
      turn_index: script.index,
      phase: script.phase,
      patient: script.patient,
      agent: floor ? script.cheap : script.frontier,
      model,
      peer: floor ? null : FRONTIER_PEER,
      price_class: floor ? "floor" : "frontier",
      spent_before_cents: cents(spentBefore),
      projected_turn_cents: cents(projected),
      actual_turn_cents: cents(actual),
      cumulative_cost_cents: cents(spent),
      decision,
      predicate,
      tripped_at: audit && audit.turn_index === script.index ? audit.tripped_at : null,
    });
  }

  if (audit && through === 6) audit = { ...audit, outcome: OUTCOME_BOOKED };

  const unmanagedUnits = spike ? 5 * FRONTIER_UNITS + SPIKE_UNITS : 6 * FRONTIER_UNITS;
  const governed = cents(spent);
  const unmanaged = cents(unmanagedUnits);
  const outcome = through === 6 ? OUTCOME_BOOKED : "IN_PROGRESS";

  return {
    clinic_id: CLINIC_ID,
    clinic_name: CLINIC_NAME,
    call_id: id,
    budget_cents: cents(budgetUnits),
    inject_spike: spike,
    through_turn: through,
    tripped: audit !== null,
    latched_model: latched ? CHEAP_MODEL : null,
    cumulative_cost_cents: governed,
    governed_cost_cents: governed,
    unmanaged_cost_cents: unmanaged,
    saved_cents: Math.max(0, unmanaged - governed),
    outcome,
    turns,
    audit_rows: audit ? [audit] : [],
    sql: audit ? renderSql(audit) : null,
  };
}

function renderSql(row: AuditRow): string {
  return [
    "insert into public.clinic_budget_downgrade_log (",
    "  clinic_id, call_id, turn_index, budget_cents, spent_before_cents,",
    "  from_model, to_model, downgrade_reason, outcome, tripped_at",
    ") values (",
    `  ${sqlString(row.clinic_id)},`,
    `  ${sqlString(row.call_id)},`,
    `  ${row.turn_index},`,
    `  ${row.budget_cents.toFixed(2)},`,
    `  ${row.spent_before_cents.toFixed(2)},`,
    `  ${sqlString(row.from_model)},`,
    `  ${sqlString(row.to_model)},`,
    `  ${sqlString(row.downgrade_reason)},`,
    `  ${sqlString(row.outcome)},`,
    `  ${sqlString(row.tripped_at)}`,
    ");",
  ].join("\n");
}

export function dollars(centsValue: number): string {
  return `$${(centsValue / 100).toFixed(2)}`;
}

export function centLabel(centsValue: number): string {
  return `${centsValue.toFixed(2)}¢`;
}
