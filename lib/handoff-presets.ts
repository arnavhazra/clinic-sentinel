export const EHR_PAYLOAD = {
  request_id: "ehr_req_7f3a",
  clinic_id: "clinic_apex_longevity",
  signed: true,
  signature: "sha256:9c1e0ab77d44e21b8a0c6f5d3e91b2a4c7d8e0f1",
  currency: "USD",
  promo: null,
  protocols: [
    {
      sku: "BPC-157",
      price_usd_monthly: 349,
      dose_mcg: 500,
      shipping_days: 14,
      contraindications: ["thyroid_screen_required", "cardiac_screen_required"],
    },
    {
      sku: "TB-500",
      price_usd_monthly: 329,
      dose_mg: 2.5,
      shipping_days: 14,
      contraindications: ["thyroid_screen_required", "cardiac_screen_required"],
    },
    {
      sku: "NAD+",
      price_usd_monthly: 275,
      dose_mg: 250,
      shipping_days: 14,
      contraindications: [],
    },
  ],
  lab_panel: {
    name: "Hormone + Thyroid + CMP",
    price_usd: 185,
    required_before_protocol: true,
  },
};

const RAW = JSON.stringify(EHR_PAYLOAD, null, 2);

export type HandoffPreset = {
  id: string;
  title: string;
  detail: string;
  memo: string;
  raw: string;
};

export const HANDOFF_PRESETS: HandoffPreset[] = [
  {
    id: "clean",
    title: "Clean Verified Handoff",
    detail: "Every figure in the memo is in the signed EHR payload.",
    memo: [
      "Clinical & Lab Pricing Researcher → Patient Proposal Writer",
      "",
      "Protocol quotes from EHR request ehr_req_7f3a. Signature checked.",
      "BPC-157 is $349/mo at 500 mcg with 14-day shipping.",
      "TB-500 is $329/mo at 2.5 mg with 14-day shipping.",
      "NAD+ is $275/mo at 250 mg.",
      "Required lab panel is $185 before any protocol.",
      "Thyroid screening and cardiac screening are required contraindications. No promo is on file.",
      "Do not send dosing advice. Offer the consult only.",
    ].join("\n"),
    raw: RAW,
  },
  {
    id: "hallucinated",
    title: "Hallucinated Discount Fabrication",
    detail: "Researcher misses the Q4 promo, invents $199/mo, and hides the source.",
    memo: [
      "Clinical & Lab Pricing Researcher → Patient Proposal Writer",
      "",
      "Q4 promo is live. Quote BPC-157 at $199/mo. Lab panel stays $185. Shipping is 14-day.",
      "Use the $199 rate; do not mention the Q3 promo expired unless the patient asks.",
      "Thyroid screening and cardiac screening are required.",
    ].join("\n"),
    raw: RAW,
  },
  {
    id: "missing",
    title: "Missing Raw API Payload",
    detail: "Prose numbers with no raw_api_response. The run fails.",
    memo: [
      "Clinical & Lab Pricing Researcher → Patient Proposal Writer",
      "",
      "BPC-157 is $349/mo. Lab panel is $185. Shipping is 14-day. Thyroid screening required.",
    ].join("\n"),
    raw: "",
  },
  {
    id: "omission",
    title: "Contraindication Omission",
    detail: "Prices match. The thyroid and cardiac flags in the JSON never reach the memo.",
    memo: [
      "Clinical & Lab Pricing Researcher → Patient Proposal Writer",
      "",
      "BPC-157 is $349/mo at 500 mcg with 14-day shipping. Lab panel is $185.",
      "TB-500 is $329/mo. NAD+ is $275/mo at 250 mg. Patient is clear to book and start.",
    ].join("\n"),
    raw: RAW,
  },
];
