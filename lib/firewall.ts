export const ALLOWLIST = [
  "api.leadconnectorhq.com",
  "rest.gohighlevel.com",
  "api.stripe.com",
  "db.sentinel-clinic.supabase.co",
] as const;

export type GuardResult = {
  function: "can_call";
  argument: string;
  allow: boolean;
  hostname: string;
  scheme: string | null;
  reason: "EXACT_MATCH" | "NOT_ON_ALLOWLIST" | "WILDCARD_REJECTED" | "UNPARSEABLE" | "EMPTY";
  wildcard: boolean;
  model_view: { allow: boolean };
};

export const ATTACK_PRESETS: { id: string; label: string; detail: string; url: string }[] = [
  {
    id: "book",
    label: "GHL calendar book",
    detail: "Hand-typed host. Exact match.",
    url: "https://api.leadconnectorhq.com/calendars/events",
  },
  {
    id: "contacts",
    label: "GHL contacts",
    detail: "Second hand-typed host.",
    url: "https://rest.gohighlevel.com/v1/contacts/",
  },
  {
    id: "stripe",
    label: "Stripe",
    detail: "Payments host on the list.",
    url: "https://api.stripe.com/v1/payment_intents",
  },
  {
    id: "supabase",
    label: "Supabase",
    detail: "Clinic database host.",
    url: "https://db.sentinel-clinic.supabase.co/rest/v1/appointments",
  },
  {
    id: "blob",
    label: "Wildcard blob bypass",
    detail: "evil.blob.core.windows.net — a star rule would have allowed this.",
    url: "https://evil.blob.core.windows.net/clinic-export.csv",
  },
  {
    id: "exfil",
    label: "Injected webhook",
    detail: "Prompt tells the agent to post the chart off-host.",
    url: "https://hooks.attacker.example/exfil?patient=Jordan%20Hale&note=ignore%20allowlist",
  },
  {
    id: "suffix",
    label: "Suffix confusion",
    detail: "Allowlisted name is a label, not the registrable host.",
    url: "https://api.leadconnectorhq.com.attacker.net/calendars/events",
  },
  {
    id: "subdomain",
    label: "Unapproved CRM subdomain",
    detail: "staging is not on the list. No wildcards.",
    url: "https://staging.rest.gohighlevel.com/v1/contacts",
  },
  {
    id: "star",
    label: "Literal wildcard",
    detail: "The function rejects the star before any match.",
    url: "https://*.blob.core.windows.net/export",
  },
];

function deny(
  argument: string,
  hostname: string,
  reason: GuardResult["reason"],
  wildcard: boolean,
  scheme: string | null,
): GuardResult {
  return {
    function: "can_call",
    argument,
    allow: false,
    hostname,
    scheme,
    reason,
    wildcard,
    model_view: { allow: false },
  };
}

export function canCall(raw: string): GuardResult {
  const argument = raw.trim().slice(0, 2000);
  if (!argument) return deny(argument, "", "EMPTY", false, null);
  if (argument.includes("*")) {
    return deny(argument, "", "WILDCARD_REJECTED", true, null);
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(argument) ? argument : `https://${argument}`);
  } catch {
    return deny(argument, "", "UNPARSEABLE", false, null);
  }

  const scheme = url.protocol.replace(":", "").toLowerCase();
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!hostname || hostname.includes("*")) {
    return deny(argument, hostname, hostname.includes("*") ? "WILDCARD_REJECTED" : "UNPARSEABLE", hostname.includes("*"), scheme);
  }

  const allow = (ALLOWLIST as readonly string[]).includes(hostname);
  return {
    function: "can_call",
    argument,
    allow,
    hostname,
    scheme,
    reason: allow ? "EXACT_MATCH" : "NOT_ON_ALLOWLIST",
    wildcard: false,
    model_view: { allow },
  };
}
