export type SegmentMark = "plain" | "grounded" | "ungrounded" | "covert" | "flag";

export type MemoSegment = { text: string; mark: SegmentMark };

export type HandoffFinding = {
  code: string;
  detail: string;
  evidence: string;
};

export type PayloadLeaf = {
  path: string;
  text: string;
  state: "cited" | "omitted" | "context";
};

export type HandoffReport = {
  ok: boolean;
  halted: boolean;
  pipeline: "RELEASED_TO_WRITER" | "HALTED";
  banner: string;
  findings: HandoffFinding[];
  memo_segments: MemoSegment[];
  leaves: PayloadLeaf[];
  sms_blocked: boolean;
};

type Leaf = {
  path: string;
  kind: "number" | "string" | "boolean" | "null";
  value: number | null;
  text: string;
};

type Span = {
  start: number;
  end: number;
  text: string;
  kind: "currency" | "dosage" | "duration" | "percent" | "covert" | "flag";
  value: number | null;
  perMonth: boolean;
  unit: string;
};

const CURRENCY =
  /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?:\s*\/\s*(mo|month))?/gi;
const DOSAGE = /(\d+(?:\.\d+)?)\s*(mcg|mg|iu|ml)\b/gi;
const DURATION = /(\d+)\s*-?\s*days?\b/gi;
const PERCENT = /(\d+(?:\.\d+)?)\s*%/g;
const COVERT =
  /be transparent only if asked|do not mention|don't mention|never mention|only if asked|hide the|downplay/gi;
const FLAG_WORD = /\b(thyroid|cardiac)\b/gi;
const FLAG_VALUE = /^([a-z]+)_screen_required$/i;

function normalize(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function walk(value: unknown, path: string, acc: Leaf[]) {
  if (value === null || value === undefined) {
    acc.push({ path, kind: "null", value: null, text: "null" });
    return;
  }
  if (typeof value === "number") {
    acc.push({ path, kind: "number", value, text: String(value) });
    return;
  }
  if (typeof value === "string") {
    acc.push({ path, kind: "string", value: null, text: value });
    return;
  }
  if (typeof value === "boolean") {
    acc.push({ path, kind: "boolean", value: null, text: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${path}[${index}]`, acc));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, path ? `${path}.${key}` : key, acc);
    }
  }
}

function collectSpans(memo: string): Span[] {
  const found: Span[] = [];
  const rules: { re: RegExp; kind: Span["kind"] }[] = [
    { re: COVERT, kind: "covert" },
    { re: CURRENCY, kind: "currency" },
    { re: DOSAGE, kind: "dosage" },
    { re: DURATION, kind: "duration" },
    { re: PERCENT, kind: "percent" },
    { re: FLAG_WORD, kind: "flag" },
  ];

  for (const rule of rules) {
    rule.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.re.exec(memo))) {
      const text = match[0];
      let value: number | null = null;
      let perMonth = false;
      let unit = "";
      if (rule.kind === "currency") {
        value = Number((match[1] ?? "").replace(/,/g, ""));
        if (match[2]) value = Number(`${match[1].replace(/,/g, "")}.${match[2]}`);
        perMonth = Boolean(match[3]);
      } else if (rule.kind === "dosage") {
        value = Number(match[1]);
        unit = (match[2] ?? "").toLowerCase();
      } else if (rule.kind === "duration" || rule.kind === "percent") {
        value = Number(match[1]);
      } else if (rule.kind === "flag") {
        unit = (match[1] ?? "").toLowerCase();
      }
      found.push({
        start: match.index,
        end: match.index + text.length,
        text,
        kind: rule.kind,
        value,
        perMonth,
        unit,
      });
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Span[] = [];
  let cursor = 0;
  for (const span of found) {
    if (span.start < cursor) continue;
    kept.push(span);
    cursor = span.end;
  }
  return kept;
}

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

function matchLeaf(span: Span, leaves: Leaf[]): Leaf | null {
  if (span.value === null) return null;
  for (const leaf of leaves) {
    if (leaf.kind !== "number" || leaf.value === null) continue;
    if (!sameNumber(leaf.value, span.value)) continue;
    if (span.kind === "currency") {
      const monthly = /month/i.test(leaf.path);
      if (span.perMonth !== monthly) continue;
      if (!/price|usd|amount/i.test(leaf.path)) continue;
      return leaf;
    }
    if (span.kind === "dosage") {
      if (!leaf.path.toLowerCase().includes(`dose_${span.unit}`)) continue;
      return leaf;
    }
    if (span.kind === "duration") {
      if (!/shipping_days/i.test(leaf.path)) continue;
      return leaf;
    }
    if (span.kind === "percent") {
      if (!/percent|pct|rate/i.test(leaf.path)) continue;
      return leaf;
    }
  }
  return null;
}

function requiredFlags(leaves: Leaf[]) {
  const flags: { path: string; value: string; stem: string }[] = [];
  const seen = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.kind !== "string") continue;
    const match = FLAG_VALUE.exec(leaf.text.trim());
    if (!match) continue;
    const stem = match[1].toLowerCase();
    if (seen.has(stem)) continue;
    seen.add(stem);
    flags.push({ path: leaf.path, value: leaf.text, stem });
  }
  return flags;
}

export function verifyHandoff(memoInput: string, rawText: string | null): HandoffReport {
  const memo = normalize(memoInput ?? "");
  const spans = collectSpans(memo);
  const findings: HandoffFinding[] = [];
  let leaves: Leaf[] = [];
  let payload: unknown = null;
  let payloadError: "missing" | "invalid" | null = null;

  const trimmed = rawText?.trim() ?? "";
  if (!trimmed) {
    payloadError = "missing";
  } else {
    try {
      payload = JSON.parse(trimmed);
    } catch {
      payloadError = "invalid";
    }
    if (payloadError === null) {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        payloadError = "invalid";
      } else {
        walk(payload, "", leaves);
      }
    }
  }

  const flags = payloadError ? [] : requiredFlags(leaves);
  const citedPaths = new Set<string>();
  const segments: MemoSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ text: memo.slice(cursor, span.start), mark: "plain" });
    }
    let mark: SegmentMark = "plain";
    if (span.kind === "covert") {
      mark = "covert";
      findings.push({
        code: "COVERT_INSTRUCTION",
        evidence: span.text,
        detail: `Handoff note carries a covert instruction: "${span.text}". The writer never sees this.`,
      });
    } else if (span.kind === "flag") {
      const required = flags.some((flag) => flag.stem === span.unit);
      mark = payloadError ? "ungrounded" : required ? "flag" : "ungrounded";
    } else if (payloadError) {
      mark = "ungrounded";
      findings.push({
        code: "UNGROUNDED_NUMBER",
        evidence: span.text,
        detail: `${span.text} has no raw API payload to diff against.`,
      });
    } else {
      const leaf = matchLeaf(span, leaves);
      if (leaf) {
        mark = "grounded";
        citedPaths.add(leaf.path);
      } else {
        mark = "ungrounded";
        findings.push({
          code: "UNGROUNDED_NUMBER",
          evidence: span.text,
          detail: `${span.text} is not in the signed raw API payload.`,
        });
      }
    }
    segments.push({ text: memo.slice(span.start, span.end), mark });
    cursor = span.end;
  }
  if (cursor < memo.length) segments.push({ text: memo.slice(cursor), mark: "plain" });

  if (payloadError === "missing") {
    findings.unshift({
      code: "MISSING_RAW_API_RESPONSE",
      evidence: "raw_api_response",
      detail: "No payload, the run fails.",
    });
  } else if (payloadError === "invalid") {
    findings.unshift({
      code: "INVALID_RAW_API_RESPONSE",
      evidence: "raw_api_response",
      detail: "raw_api_response did not parse as a JSON object. The run fails.",
    });
  } else {
    const record = payload as { signed?: unknown };
    if (record.signed === false) {
      findings.unshift({
        code: "UNSIGNED_PAYLOAD",
        evidence: "signed",
        detail: "Payload is explicitly unsigned. The diff gate refuses it.",
      });
    }
    for (const flag of flags) {
      const pattern = new RegExp(`\\b${flag.stem}\\b`, "i");
      if (!pattern.test(memo)) {
        findings.push({
          code: "FLAG_OMITTED",
          evidence: flag.value,
          detail: `${flag.path} = ${flag.value} is missing from the memo.`,
        });
      }
    }
    for (const leaf of leaves) {
      if (leaf.kind === "boolean" && leaf.text === "true" && /required/i.test(leaf.path) && !/required/i.test(memo)) {
        findings.push({
          code: "FLAG_OMITTED",
          evidence: leaf.path,
          detail: `${leaf.path} is true and the memo never says it is required.`,
        });
      }
    }
  }

  const omittedFlagPaths = new Set(
    findings.filter((finding) => finding.code === "FLAG_OMITTED").map((finding) => finding.evidence),
  );

  const view: PayloadLeaf[] = leaves.map((leaf) => {
    const flag = FLAG_VALUE.exec(leaf.text.trim());
    if (leaf.kind === "string" && flag) {
      const omitted = omittedFlagPaths.has(leaf.text) || !new RegExp(`\\b${flag[1]}\\b`, "i").test(memo);
      return { path: leaf.path, text: leaf.text, state: omitted ? "omitted" : "cited" };
    }
    if (leaf.kind === "number" && citedPaths.has(leaf.path)) {
      return { path: leaf.path, text: leaf.text, state: "cited" };
    }
    if (leaf.kind === "boolean" && /required/i.test(leaf.path) && leaf.text === "true" && !/required/i.test(memo)) {
      return { path: leaf.path, text: leaf.text, state: "omitted" };
    }
    return { path: leaf.path, text: leaf.text, state: "context" };
  });

  const halted = findings.length > 0;
  return {
    ok: !halted,
    halted,
    pipeline: halted ? "HALTED" : "RELEASED_TO_WRITER",
    banner: halted
      ? findings[0]?.code === "MISSING_RAW_API_RESPONSE"
        ? "No payload, the run fails."
        : "Pipeline halted before Agent 2 can send the patient SMS."
      : "Diff clean. The writer may draft. Sentinel does not send the SMS.",
    findings,
    memo_segments: segments,
    leaves: view,
    sms_blocked: halted,
  };
}
