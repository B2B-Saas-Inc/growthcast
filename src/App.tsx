import {
  Fragment,
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Download,
  ImageDown,
  RotateCcw,
  TrendingUp,
  Upload,
} from "lucide-react";
import html2canvas from "html2canvas";
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import {
  forecast,
  type Assumptions,
  type ChannelAssumption,
  type ForecastMonth,
} from "./engine/forecast";
import {
  calculateChannelBreakdown,
  type ChannelBreakdownRow,
} from "./engine/channelBreakdown";
import {
  calculateBlendedCac,
  calculateMagicNumber,
  calculateNrr,
  cashFlowFor,
  defaultCashFlow,
  type CashFlowSettings,
} from "./engine/metrics";
import posthog, { isPostHogEnabled } from "./posthog";
import "./styles.css";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const money = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(n);
const moneyWhole = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(n);
const money2 = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
const number = (n: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
const whole = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
const one = (n: number) => Number(n.toFixed(1));
const addIsoMonths = (month: string, count: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + count, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const previousMonth = (month: string) => addIsoMonths(month, -1);
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const defaultBaselineMonth = currentMonth();
const defaultForecastStartMonth = addIsoMonths(defaultBaselineMonth, 1);
const monthOptions = Array.from({ length: 25 }, (_, i) =>
  addIsoMonths(defaultForecastStartMonth, i),
);
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const rateFromInput = (value: string) => clamp(Number(value) / 100, 0, 1);
const isIsoMonth = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12;
};
const readImportFile = async (file: File) => {
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("Import files must be 5 MB or smaller");
  return file.text();
};
const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  const safe =
    typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const csvFile = (headers: string[], rows: (string | number | null)[][]) =>
  [headers, ...rows]
    .map((row) =>
      row
        .map((value) => csvCell(value))
        .join(","),
    )
    .join("\n");
const assumptionCsv = (value: Record<string, unknown>) =>
  [
    ["field", "value"],
    ...Object.entries(value).map(([key, item]) => [key, JSON.stringify(item)]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
const parseAssumptionCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  if (rows[0]?.[0] !== "field" || rows[0]?.[1] !== "value")
    throw new Error("Unsupported assumptions CSV");
  if (quoted) throw new Error("Malformed assumptions CSV");
  if (rows.slice(1).some((entry) => entry.length !== 2 || !entry[0]))
    throw new Error("Malformed assumptions CSV");
  const keys = rows.slice(1).map(([key]) => key);
  if (new Set(keys).size !== keys.length)
    throw new Error("Assumptions CSV contains duplicate fields");
  return Object.fromEntries(
    rows.slice(1).map(([key, value]) => [key, JSON.parse(value)]),
  );
};
const defaults: Assumptions = {
  months: 12,
  monthlyTrafficGrowth: 0.03,
  signupRate: 0.137,
  purchaseRate: 0.008,
  voluntaryCustomerChurn: 0.045,
  delinquentCustomerChurn: 0.012,
  voluntaryRevenueChurn: 0.045,
  delinquentRevenueChurn: 0.012,
  expansionRate: 0.018,
  retractionRate: 0.006,
  newCustomerArpu: 38,
  grossMargin: 0.85,
  targetLtvCac: 3,
  daysToUpgrade: 3,
  monthlyIncrementalVisitors: 0,
  monthlySalesMarketingOverhead: 0,
  businessModel: "b2c",
  mqlRate: 0.05,
  sqlRate: 0.4,
  closeRate: 0.2,
  dealCycleDays: 60,
  acv: 12000,
};
const scenarios: Record<string, Partial<Assumptions>> = {
  Conservative: {
    monthlyTrafficGrowth: 0,
    signupRate: 0.11,
    purchaseRate: 0.005,
    mqlRate: 0.03,
    sqlRate: 0.3,
    closeRate: 0.15,
  },
  Baseline: {
    monthlyTrafficGrowth: 0.03,
    signupRate: 0.137,
    purchaseRate: 0.008,
    mqlRate: 0.05,
    sqlRate: 0.4,
    closeRate: 0.2,
  },
  Ambitious: {
    monthlyTrafficGrowth: 0.08,
    signupRate: 0.17,
    purchaseRate: 0.012,
    mqlRate: 0.08,
    sqlRate: 0.5,
    closeRate: 0.3,
  },
};
type ChannelModel = "manual" | "cpc" | "cpm";
type EditableChannel = ChannelAssumption & {
  model: ChannelModel;
  allocation: number;
  cpc: number;
  cpm: number;
  ctr: number;
  hidden: boolean;
  affiliateCommissionRate: number;
  affiliateCommissionMonths: number;
  mqlRate: number;
  sqlRate: number;
  closeRate: number;
  acv: number;
};
const makeChannel = (
  name: string,
  model: ChannelModel,
  allocation = 0,
): EditableChannel => ({
  name,
  model,
  allocation,
  cpc: 2,
  cpm: 20,
  ctr: 0.008,
  visitors: 0,
  goLiveMonth: 1,
  signupRate: 0.137,
  purchaseRate: 0.008,
  arpu: 38,
  mqlRate: 0.05,
  sqlRate: 0.4,
  closeRate: 0.2,
  acv: 12000,
  hidden: false,
  affiliateCommissionRate: 0,
  affiliateCommissionMonths: 0,
});
const initialChannels = () => [
  makeChannel("SEO / organic", "manual"),
  {
    ...makeChannel("Partners", "manual"),
    affiliateCommissionRate: 0.3,
    affiliateCommissionMonths: 12,
  },
  makeChannel("Branded Search", "cpc"),
  makeChannel("Non-Brand Search", "cpc"),
  makeChannel("Meta", "cpc", 0.25),
  makeChannel("Reddit", "cpc", 0.1),
  makeChannel("Pinterest", "cpc", 0.1),
  makeChannel("LinkedIn", "cpc", 0.1),
  makeChannel("TikTok", "cpc", 0.1),
  makeChannel("Snapchat", "cpc", 0.05),
  makeChannel("YouTube", "cpm", 0.15),
  makeChannel("Display", "cpm", 0.1),
  makeChannel("CTV (Vibe.co / Quantcast)", "cpm", 0.05),
  makeChannel("Enterprise / B2B", "manual"),
  makeChannel("Custom", "manual"),
];
type Baseline = {
  month: string;
  visitors: number;
  signups: number;
  mqls: number;
  sqls: number;
  newCustomers: number;
  customers: number;
  mrr: number;
  arpu: number;
  arr: number;
};
type ChannelDefaults = {
  signupRate: number;
  purchaseRate: number;
  arpu: number;
  mqlRate: number;
  sqlRate: number;
  closeRate: number;
  acv: number;
};
type SavedModel = {
  modelName: string;
  baseline: Baseline;
  forecastStartMonth: string;
  assumptions: Assumptions;
  channelDefaults: ChannelDefaults;
  scenario: string;
  budget: number;
  channels: EditableChannel[];
  monthlyBudgetGrowth: number;
  monthlyBudgetOverrides: Record<string, Record<string, number>>;
  monthlyChurnOverrides: Record<string, number>;
  cashFlowSettings: CashFlowSettings;
};
const storageKey = "growth-model-state-v1";
const loadSavedModel = (): Partial<SavedModel> => {
  try {
    return validateSavedModel(
      JSON.parse(localStorage.getItem(storageKey) || "{}"),
    );
  } catch {
    return {};
  }
};
const normalizeChannels = (channels?: EditableChannel[]) => {
  const defaults = initialChannels();
  if (!channels?.length) return defaults;
  const byName = new Map(channels.map((c) => [c.name, c]));
  const merged = defaults.map((base) => {
    const saved = byName.get(base.name);
    return saved
      ? {
          ...base,
          ...saved,
          mqlRate: saved.mqlRate ?? base.mqlRate,
          sqlRate: saved.sqlRate ?? base.sqlRate,
          closeRate: saved.closeRate ?? base.closeRate,
          acv: saved.acv ?? base.acv,
          affiliateCommissionRate:
            saved.affiliateCommissionRate ?? base.affiliateCommissionRate,
          affiliateCommissionMonths:
            saved.affiliateCommissionMonths ?? base.affiliateCommissionMonths,
        }
      : base;
  });
  const known = new Set(defaults.map((c) => c.name));
  return [
    ...merged,
    ...channels
      .filter((c) => !known.has(c.name))
      .map((c) => ({ ...makeChannel(c.name, c.model, c.allocation), ...c })),
  ];
};
const finiteNonnegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
function validateSavedModel(input: unknown): Partial<SavedModel> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Model state must be an object");
  const value = input as Partial<SavedModel>;
  if (value.budget !== undefined && !finiteNonnegative(value.budget))
    throw new Error("Invalid budget");
  if (
    value.monthlyBudgetGrowth !== undefined &&
    !finiteNonnegative(value.monthlyBudgetGrowth)
  )
    throw new Error("Invalid budget growth");
  if (
    value.modelName !== undefined &&
    (typeof value.modelName !== "string" || value.modelName.length > 120)
  )
    throw new Error("Invalid model name");
  if (
    value.scenario !== undefined &&
    (typeof value.scenario !== "string" || value.scenario.length > 120)
  )
    throw new Error("Invalid scenario");
  if (
    value.forecastStartMonth !== undefined &&
    !isIsoMonth(value.forecastStartMonth)
  )
    throw new Error("Invalid forecast month");
  const result: { [key: string]: unknown } = { ...value };
  if (value.baseline) {
    const mqls = value.baseline.mqls ?? 0,
      sqls = value.baseline.sqls ?? 0;
    if (
      !isIsoMonth(value.baseline.month) ||
      [
        value.baseline.visitors,
        value.baseline.signups,
        mqls,
        sqls,
        value.baseline.newCustomers,
        value.baseline.customers,
        value.baseline.mrr,
      ].some((v) => !finiteNonnegative(v))
    )
      throw new Error("Invalid baseline");
    if (
      value.assumptions?.businessModel === "b2b" &&
      (mqls > value.baseline.visitors ||
        sqls > mqls ||
        value.baseline.newCustomers > sqls)
    )
      throw new Error("Invalid B2B pipeline order");
    result.baseline = {
      ...value.baseline,
      mqls,
      sqls,
      arpu: value.baseline.customers
        ? value.baseline.mrr / value.baseline.customers
        : 0,
      arr: value.baseline.mrr * 12,
    };
  }
  if (value.assumptions) {
    const assumptions = { ...defaults, ...value.assumptions };
    const rates = [
      "signupRate",
      "purchaseRate",
      "mqlRate",
      "sqlRate",
      "closeRate",
      "voluntaryCustomerChurn",
      "delinquentCustomerChurn",
      "voluntaryRevenueChurn",
      "delinquentRevenueChurn",
      "expansionRate",
      "retractionRate",
      "grossMargin",
    ] as const;
    if (
      !["b2c", "b2b"].includes(assumptions.businessModel || "") ||
      !Number.isInteger(assumptions.months) ||
      assumptions.months < 1 ||
      assumptions.months > 60 ||
      rates.some(
        (key) =>
          !finiteNonnegative(assumptions[key]) || Number(assumptions[key]) > 1,
      ) ||
      !finiteNonnegative(assumptions.monthlyTrafficGrowth) ||
      !finiteNonnegative(assumptions.newCustomerArpu) ||
      !finiteNonnegative(assumptions.daysToUpgrade) ||
      !finiteNonnegative(assumptions.dealCycleDays) ||
      !finiteNonnegative(assumptions.acv) ||
      !finiteNonnegative(assumptions.monthlySalesMarketingOverhead) ||
      assumptions.voluntaryCustomerChurn +
          assumptions.delinquentCustomerChurn >
        1 ||
      assumptions.voluntaryRevenueChurn + assumptions.delinquentRevenueChurn >
        1 ||
      !Number.isFinite(assumptions.targetLtvCac) ||
      assumptions.targetLtvCac <= 0
    )
      throw new Error("Invalid assumptions");
    result.assumptions = assumptions;
  }
  if (value.channelDefaults) {
    const normalizedDefaults = {
      signupRate: value.channelDefaults.signupRate ?? 0.137,
      purchaseRate: value.channelDefaults.purchaseRate ?? 0.008,
      arpu: value.channelDefaults.arpu ?? 38,
      mqlRate: value.channelDefaults.mqlRate ?? 0.05,
      sqlRate: value.channelDefaults.sqlRate ?? 0.4,
      closeRate: value.channelDefaults.closeRate ?? 0.2,
      acv: value.channelDefaults.acv ?? 12000,
    };
    if (
      Object.values(normalizedDefaults).some((item) => !finiteNonnegative(item)) ||
      normalizedDefaults.signupRate > 1 ||
      normalizedDefaults.purchaseRate > 1 ||
      normalizedDefaults.mqlRate > 1 ||
      normalizedDefaults.sqlRate > 1 ||
      normalizedDefaults.closeRate > 1
    )
      throw new Error("Invalid channel defaults");
    result.channelDefaults = normalizedDefaults;
  }
  if (value.channels) {
    if (
      !Array.isArray(value.channels) ||
      new Set(value.channels.map((c) => c.name)).size !==
        value.channels.length ||
      value.channels.some(
        (c) =>
          typeof c.name !== "string" ||
          !c.name.trim() ||
          c.name.length > 120 ||
          !["manual", "cpc", "cpm"].includes(c.model) ||
          !Number.isInteger(c.goLiveMonth) ||
          c.goLiveMonth < 0 ||
          [
            c.visitors,
            c.signupRate,
            c.purchaseRate,
            c.arpu,
            c.mqlRate ?? 0.05,
            c.sqlRate ?? 0.4,
            c.closeRate ?? 0.2,
            c.acv ?? 12000,
            c.allocation,
            c.cpc,
            c.cpm,
            c.ctr,
            c.affiliateCommissionRate ?? 0,
            c.affiliateCommissionMonths ?? 0,
          ].some((v) => !finiteNonnegative(v)) ||
          c.signupRate > 1 ||
          c.purchaseRate > 1 ||
          (c.mqlRate ?? 0) > 1 ||
          (c.sqlRate ?? 0) > 1 ||
          (c.closeRate ?? 0) > 1 ||
          c.allocation > 1 ||
          c.ctr > 1,
      )
    )
      throw new Error("Invalid channels");
    result.channels = normalizeChannels(value.channels);
  }
  const validMap = (map: unknown, max = Infinity) => {
    if (!map || typeof map !== "object" || Array.isArray(map)) return false;
    return Object.values(map as Record<string, unknown>).every(
      (v) => finiteNonnegative(v) && Number(v) <= max,
    );
  };
  if (value.monthlyBudgetOverrides) {
    if (!Object.values(value.monthlyBudgetOverrides).every((v) => validMap(v)))
      throw new Error("Invalid budget overrides");
  }
  if (value.monthlyChurnOverrides && !validMap(value.monthlyChurnOverrides, 1))
    throw new Error("Invalid churn overrides");
  if (value.cashFlowSettings) {
    const cash = { ...defaultCashFlow, ...value.cashFlowSettings };
    const shares =
      cash.monthlyShare +
      cash.annualShare +
      (cash.oneTimeEnabled ? cash.oneTimeShare : 0);
    if (
      [
        cash.feeRate,
        cash.refundRate,
        cash.monthlyShare,
        cash.annualShare,
        cash.oneTimeShare,
      ].some((v) => !finiteNonnegative(v) || v > 1) ||
      typeof cash.oneTimeEnabled !== "boolean" ||
      Math.abs(shares - 1) > 0.001
    )
      throw new Error("Invalid cash-flow settings");
    result.cashFlowSettings = cash;
  }
  return result as Partial<SavedModel>;
}

type NumericKey = Exclude<keyof Assumptions, "businessModel">;
const fields: {
  key: NumericKey;
  label: string;
  step: number;
  kind: "pct" | "number" | "money";
  hint: string;
}[] = [
  {
    key: "months",
    label: "Forecast range",
    step: 1,
    kind: "number",
    hint: "Months ahead",
  },
  {
    key: "monthlyTrafficGrowth",
    label: "Traffic growth",
    step: 0.005,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "signupRate",
    label: "Visitor → signup",
    step: 0.005,
    kind: "pct",
    hint: "Observed baseline",
  },
  {
    key: "purchaseRate",
    label: "Signup → purchase",
    step: 0.01,
    kind: "pct",
    hint: "Paid conversion",
  },
  {
    key: "voluntaryCustomerChurn",
    label: "Voluntary logo churn",
    step: 0.005,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "delinquentCustomerChurn",
    label: "Delinquent logo churn",
    step: 0.0025,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "voluntaryRevenueChurn",
    label: "Voluntary revenue churn",
    step: 0.005,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "delinquentRevenueChurn",
    label: "Delinquent revenue churn",
    step: 0.0025,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "expansionRate",
    label: "Expansion rate",
    step: 0.0025,
    kind: "pct",
    hint: "Existing MRR",
  },
  {
    key: "retractionRate",
    label: "Downgrade rate",
    step: 0.0025,
    kind: "pct",
    hint: "Existing MRR",
  },
  {
    key: "newCustomerArpu",
    label: "New customer ARPU",
    step: 1,
    kind: "money",
    hint: "Monthly",
  },
  {
    key: "grossMargin",
    label: "Gross margin",
    step: 0.01,
    kind: "pct",
    hint: "Contribution LTV",
  },
  {
    key: "targetLtvCac",
    label: "Target LTV:CAC",
    step: 0.25,
    kind: "number",
    hint: "Efficiency target",
  },
  {
    key: "daysToUpgrade",
    label: "Days to upgrade",
    step: 0.1,
    kind: "number",
    hint: "Average signup → paid delay",
  },
  {
    key: "monthlySalesMarketingOverhead",
    label: "Sales & Marketing Overhead",
    step: 100,
    kind: "money",
    hint: "Monthly salaries, commissions, and tools",
  },
];
const b2bFields: typeof fields = [
  {
    key: "months",
    label: "Forecast range",
    step: 1,
    kind: "number",
    hint: "Months ahead",
  },
  {
    key: "monthlyTrafficGrowth",
    label: "Traffic growth",
    step: 0.005,
    kind: "pct",
    hint: "Monthly",
  },
  {
    key: "mqlRate",
    label: "Visitor → MQL",
    step: 0.005,
    kind: "pct",
    hint: "Marketing-qualified rate",
  },
  {
    key: "sqlRate",
    label: "MQL → SQL",
    step: 0.01,
    kind: "pct",
    hint: "Sales-qualified rate",
  },
  {
    key: "closeRate",
    label: "SQL → closed won",
    step: 0.01,
    kind: "pct",
    hint: "Win rate",
  },
  {
    key: "dealCycleDays",
    label: "Average deal cycle",
    step: 1,
    kind: "number",
    hint: "SQL → closed won days",
  },
  {
    key: "acv",
    label: "Average contract value",
    step: 100,
    kind: "money",
    hint: "Annual recurring value",
  },
  ...fields.filter(
    (field) =>
      ![
        "months",
        "monthlyTrafficGrowth",
        "signupRate",
        "purchaseRate",
        "daysToUpgrade",
        "newCustomerArpu",
      ].includes(field.key),
  ),
];
function Field({
  f,
  a,
  setA,
}: {
  f: (typeof fields)[number];
  a: Assumptions;
  setA: (a: Assumptions) => void;
}) {
  const rawValue = Number(a[f.key] ?? 0);
  const display = one(f.kind === "pct" ? rawValue * 100 : rawValue);
  return (
    <label className="field">
      <span>
        {f.label}
        <small>{f.hint}</small>
      </span>
      <div className="input">
        <input
          aria-label={f.label}
          type="number"
          min={f.key === "months" ? 1 : 0}
          max={f.key === "months" ? 60 : f.kind === "pct" ? 100 : undefined}
          step={f.kind === "pct" ? f.step * 100 : f.step}
          value={display}
          onChange={(e) => {
            const raw = +e.target.value;
            const rateMax =
              f.key === "voluntaryCustomerChurn"
                ? 1 - a.delinquentCustomerChurn
                : f.key === "delinquentCustomerChurn"
                  ? 1 - a.voluntaryCustomerChurn
                  : f.key === "voluntaryRevenueChurn"
                    ? 1 - a.delinquentRevenueChurn
                    : f.key === "delinquentRevenueChurn"
                      ? 1 - a.voluntaryRevenueChurn
                      : 1;
            setA({
              ...a,
              [f.key]:
                f.key === "months"
                  ? clamp(Math.round(raw), 1, 60)
                  : f.kind === "pct"
                    ? clamp(raw / 100, 0, rateMax)
                    : clamp(raw),
            });
          }}
        />
        <b>{f.kind === "pct" ? "%" : f.kind === "money" ? "$" : ""}</b>
      </div>
    </label>
  );
}
function ChannelRow({
  channel: c,
  modeled,
  index,
  budget,
  setChannels,
  channels,
  businessModel,
}: {
  channel: EditableChannel;
  modeled: EditableChannel;
  index: number;
  budget: number;
  setChannels: (c: EditableChannel[]) => void;
  channels: EditableChannel[];
  businessModel: "b2c" | "b2b";
}) {
  const update = (patch: Partial<EditableChannel>) =>
    setChannels(channels.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const setLiveMonth = (goLiveMonth: number) => {
    if (
      goLiveMonth !== 0 ||
      c.goLiveMonth === 0 ||
      c.model === "manual" ||
      c.allocation === 0
    ) {
      update({ goLiveMonth });
      return;
    }
    const recipients = channels
      .map((x, i) => ({ x, i }))
      .filter(
        ({ x, i }) => i !== index && x.model !== "manual" && x.goLiveMonth > 0,
      );
    const weight = recipients.reduce((sum, { x }) => sum + x.allocation, 0);
    setChannels(
      channels.map((x, i) => {
        if (i === index) return { ...x, goLiveMonth: 0, allocation: 0 };
        const recipient = recipients.find((r) => r.i === i);
        if (!recipient) return x;
        const share = weight ? x.allocation / weight : 1 / recipients.length;
        return { ...x, allocation: x.allocation + c.allocation * share };
      }),
    );
  };
  const spend = c.goLiveMonth === 0 ? 0 : budget * c.allocation;
  const impliedCpc = modeled.visitors ? spend / modeled.visitors : 0;
  return (
    <details className="channel">
      <summary>
        <strong>{c.name}</strong>
        <label>
          Live month
          <input
            aria-label={`${c.name} goLiveMonth`}
            type="number"
            min="0"
            max="60"
            step="1"
            value={c.goLiveMonth}
            onChange={(e) => setLiveMonth(clamp(Math.round(+e.target.value), 0, 60))}
          />
        </label>
        {c.model === "manual" ? (
          <label>
            Launch visitors
            <input
              aria-label={`${c.name} visitors`}
              type="number"
              min="0"
              step="100"
              value={one(c.visitors)}
              onChange={(e) => update({ visitors: clamp(+e.target.value) })}
            />
          </label>
        ) : (
          <>
            <label>
              Budget %
              <input
                aria-label={`${c.name} allocation`}
                type="number"
                min="0"
                max="100"
                step="1"
                value={one(c.allocation * 100)}
                onChange={(e) => update({ allocation: rateFromInput(e.target.value) })}
              />
              <small>{money(spend)}</small>
            </label>
            {c.model === "cpc" ? (
              <label>
                CPC
                <input
                  aria-label={`${c.name} cpc`}
                  type="number"
                  min="0"
                  step=".1"
                  value={one(c.cpc)}
                  onChange={(e) => update({ cpc: clamp(+e.target.value) })}
                />
              </label>
            ) : (
              <>
                <label>
                  CPM
                  <input
                    aria-label={`${c.name} cpm`}
                    type="number"
                    min="0"
                    step=".1"
                    value={one(c.cpm)}
                    onChange={(e) => update({ cpm: clamp(+e.target.value) })}
                  />
                </label>
                <label>
                  CTR %
                  <input
                    aria-label={`${c.name} ctr`}
                    type="number"
                    min="0"
                    step=".1"
                    value={one(c.ctr * 100)}
                    onChange={(e) => update({ ctr: rateFromInput(e.target.value) })}
                  />
                </label>
              </>
            )}
          </>
        )}
        <span className="traffic">
          <b>{number(modeled.visitors)}</b> visits
          <small>
            {c.model !== "manual" ? `${money(impliedCpc)} expected CPC` : ""}
          </small>
        </span>
      </summary>
      <div className="channelAdvanced">
        {businessModel === "b2b" ? (
          <>
            <label>
              Visitor → MQL %
              <input
                aria-label={`${c.name} mqlRate`}
                type="number"
                min="0"
                max="100"
                step=".1"
                value={one(c.mqlRate * 100)}
                onChange={(e) => update({ mqlRate: rateFromInput(e.target.value) })}
              />
            </label>
            <label>
              MQL → SQL %
              <input
                aria-label={`${c.name} sqlRate`}
                type="number"
                min="0"
                max="100"
                step=".1"
                value={one(c.sqlRate * 100)}
                onChange={(e) => update({ sqlRate: rateFromInput(e.target.value) })}
              />
            </label>
            <label>
              SQL → closed won %
              <input
                aria-label={`${c.name} closeRate`}
                type="number"
                min="0"
                max="100"
                step=".1"
                value={one(c.closeRate * 100)}
                onChange={(e) => update({ closeRate: rateFromInput(e.target.value) })}
              />
            </label>
            <label>
              ACV
              <input
                aria-label={`${c.name} acv`}
                type="number"
                min="0"
                step="100"
                value={one(c.acv)}
                onChange={(e) => update({ acv: clamp(+e.target.value) })}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Visitor → signup %
              <input
                aria-label={`${c.name} signupRate`}
                type="number"
                min="0"
                step=".1"
                value={one(c.signupRate * 100)}
                onChange={(e) => update({ signupRate: rateFromInput(e.target.value) })}
              />
            </label>
            <label>
              Signup → purchase %
              <input
                aria-label={`${c.name} purchaseRate`}
                type="number"
                min="0"
                step=".1"
                value={one(c.purchaseRate * 100)}
                onChange={(e) =>
                  update({ purchaseRate: rateFromInput(e.target.value) })
                }
              />
            </label>
            <label>
              New customer ARPU
              <input
                aria-label={`${c.name} arpu`}
                type="number"
                min="0"
                step=".1"
                value={one(c.arpu)}
                onChange={(e) => update({ arpu: clamp(+e.target.value) })}
              />
            </label>
          </>
        )}
        {c.name === "Partners" && (
          <>
            <label>
              Affiliate commission %
              <input
                aria-label="Partners affiliate commission rate"
                type="number"
                min="0"
                max="100"
                step=".1"
                value={one((c.affiliateCommissionRate || 0) * 100)}
                onChange={(e) =>
                  update({ affiliateCommissionRate: rateFromInput(e.target.value) })
                }
              />
            </label>
            <label>
              Commission months
              <input
                aria-label="Partners affiliate commission months"
                type="number"
                min="0"
                step="1"
                value={c.affiliateCommissionMonths || 0}
                onChange={(e) =>
                  update({
                    affiliateCommissionMonths: clamp(
                      Math.round(+e.target.value),
                      0,
                      120,
                    ),
                  })
                }
              />
            </label>
            <div className="affiliateSummary">
              <span>Maximum commission / customer</span>
              <b>
                {money(
                  (businessModel === "b2b" ? c.acv / 12 : c.arpu) *
                    (c.affiliateCommissionRate || 0) *
                    (c.affiliateCommissionMonths || 0),
                )}
              </b>
              <small>Before modeled revenue churn</small>
            </div>
          </>
        )}
        <button
          className="hideChannel"
          onClick={() => update({ hidden: !c.hidden })}
        >
          {c.hidden ? "Restore subchannel" : "Hide subchannel"}
        </button>
      </div>
    </details>
  );
}
type DeepTab = "budget" | "churn" | "mrr" | "growth" | "customers" | "cashflow";
type DragState = {
  kind: "budget" | "churn";
  month: string;
  channel?: string;
  startY: number;
  startValue: number;
};
type DotProps = {
  cx?: number;
  cy?: number;
  payload?: Record<string, number | string>;
};
async function renderChartCanvas(element: HTMLElement) {
  return toCanvas(element, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: true,
    skipFonts: false,
  });
}
async function exportElementImage(
  targetId: string,
  filename: string,
  title: string,
  description: string,
  square = false,
) {
  const element = document.getElementById(targetId);
  if (!element) return;
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 900));
  const width = square ? 1200 : 1230,
    height = square ? 1200 : 600;
  const stage = document.createElement("section");
  stage.className = `exportStage ${square ? "exportStageSquare" : ""}`;
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  const heading = document.createElement("header");
  heading.innerHTML = `<div><span>GROWTHCAST FORECAST</span><h2>${title}</h2><p>${description}</p></div>`;
  const body = document.createElement("div");
  body.className = "exportStageBody";
  if (square) {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    body.appendChild(clone);
  } else {
    const chartCanvas = await renderChartCanvas(element);
    const image = document.createElement("img");
    image.className = "exportChartImage";
    image.src = chartCanvas.toDataURL("image/png");
    body.appendChild(image);
  }
  stage.append(heading, body);
  document.body.appendChild(stage);
  try {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const canvas = await html2canvas(stage, {
      backgroundColor: "#f4f1e9",
      width,
      height,
      scale: 1,
      useCORS: true,
      logging: false,
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  } finally {
    stage.remove();
  }
}
function ImageExportButton({
  targetId,
  filename,
  title,
  description,
  square = false,
}: {
  targetId: string;
  filename: string;
  title: string;
  description: string;
  square?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="imageExport"
        aria-label={`Export ${filename} image`}
        title="Export image"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("");
          try {
            await exportElementImage(
              targetId,
              filename,
              title,
              description,
              square,
            );
            setStatus(`${filename} downloaded`);
            if (isPostHogEnabled) {
              posthog.capture("chart_image_exported", {
                export_scope: targetId.startsWith("deep-chart-")
                  ? "deep_dive"
                  : "forecast",
              });
            }
          } catch {
            setStatus(`Could not export ${filename}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ImageDown size={15} />
      </button>
      <span className="srOnly" aria-live="polite">
        {status}
      </span>
    </>
  );
}
const palette = [
  "#ff6b4a",
  "#7b61ff",
  "#2ab99f",
  "#f1b84b",
  "#5da8c5",
  "#ef7fa6",
  "#7f9b5b",
  "#d06b52",
  "#6e78ad",
];
function DeepDive({
  projection,
  channels,
  budget,
  setBudget,
  monthlyBudgetGrowth,
  setMonthlyBudgetGrowth,
  assumptions,
  baselineMrr,
  monthlyBudgetOverrides,
  setMonthlyBudgetOverrides,
  monthlyChurnOverrides,
  setMonthlyChurnOverrides,
  cashFlowSettings,
  setCashFlowSettings,
}: {
  projection: ForecastMonth[];
  channels: EditableChannel[];
  budget: number;
  setBudget: (n: number) => void;
  monthlyBudgetGrowth: number;
  setMonthlyBudgetGrowth: (n: number) => void;
  assumptions: Assumptions;
  baselineMrr: number;
  monthlyBudgetOverrides: Record<string, Record<string, number>>;
  setMonthlyBudgetOverrides: (
    v: Record<string, Record<string, number>>,
  ) => void;
  monthlyChurnOverrides: Record<string, number>;
  setMonthlyChurnOverrides: (v: Record<string, number>) => void;
  cashFlowSettings: CashFlowSettings;
  setCashFlowSettings: (v: CashFlowSettings) => void;
}) {
  const [tab, setTab] = useState<DeepTab>("budget");
  const [showLines, setShowLines] = useState<Record<DeepTab, boolean>>({
    budget: true,
    churn: true,
    mrr: true,
    growth: true,
    customers: true,
    cashflow: true,
  });
  const showLine = showLines[tab];
  const setShowLine = (value: boolean) =>
    setShowLines((current) => ({ ...current, [tab]: value }));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [applyFuture, setApplyFuture] = useState(false);
  const [budgetEditMonth, setBudgetEditMonth] = useState(
    projection[0]?.month || "",
  );
  const [budgetEditTotal, setBudgetEditTotal] = useState(budget);
  const [budgetEditChannel, setBudgetEditChannel] = useState("");
  const [budgetChannelSpend, setBudgetChannelSpend] = useState(0);
  const [churnEditMonth, setChurnEditMonth] = useState(
    projection[0]?.month || "",
  );
  const [churnEditRate, setChurnEditRate] = useState(
    one(
      (monthlyChurnOverrides[projection[0]?.month] ??
        assumptions.voluntaryRevenueChurn +
          assumptions.delinquentRevenueChurn) * 100,
    ),
  );
  const paid = useMemo(
    () => channels.filter((c) => c.model !== "manual" && c.goLiveMonth > 0),
    [channels],
  );
  const scheduledTotal = useCallback(
    (index: number) => budget * (1 + monthlyBudgetGrowth) ** index,
    [budget, monthlyBudgetGrowth],
  );
  const monthSpends = useCallback(
    (month: string, index: number) =>
      Object.fromEntries(
        paid.map((c) => [
          c.name,
          index + 1 < c.goLiveMonth
            ? 0
            : (monthlyBudgetOverrides[month]?.[c.name] ??
              scheduledTotal(index) * c.allocation),
        ]),
      ),
    [paid, monthlyBudgetOverrides, scheduledTotal],
  );
  const setBudgetTotal = (
    fromMonth: string,
    total: number,
    future: boolean,
  ) => {
    const start = projection.findIndex((p) => p.month === fromMonth);
    if (start < 0) return;
    const next = { ...monthlyBudgetOverrides };
    projection.forEach((p, index) => {
      if (index < start || (!future && index !== start)) return;
      const target =
        Math.max(0, total) *
        (future ? (1 + monthlyBudgetGrowth) ** (index - start) : 1);
      const current = monthSpends(p.month, index);
      const currentTotal = Object.values(current).reduce(
          (sum, v) => sum + Number(v),
          0,
        ),
        allocationTotal = paid.reduce((sum, c) => sum + c.allocation, 0);
      next[p.month] = Object.fromEntries(
        paid.map((c) => [
          c.name,
          Math.round(
            (target *
              (currentTotal
                ? Number(current[c.name]) / currentTotal
                : allocationTotal
                  ? c.allocation / allocationTotal
                  : 1 / Math.max(1, paid.length))) /
              100,
          ) * 100,
        ]),
      );
      const assigned = Object.values(next[p.month]).reduce(
        (sum, v) => sum + Number(v),
        0,
      );
      if (paid.length) next[p.month][paid.at(-1)!.name] += target - assigned;
    });
    setMonthlyBudgetOverrides(next);
  };
  const setChannelSpendValue = (
    fromMonth: string,
    channel: string,
    value: number,
    future: boolean,
  ) => {
    const start = projection.findIndex((p) => p.month === fromMonth);
    if (start < 0 || !channel) return;
    const startCurrent = monthSpends(fromMonth, start);
    const change = Math.max(0, value) - Number(startCurrent[channel] || 0);
    const next = { ...monthlyBudgetOverrides };
    projection.forEach((p, index) => {
      if (index < start || (!future && index !== start)) return;
      const current = monthSpends(p.month, index),
        targetTotal = Object.values(current).reduce(
          (sum, v) => sum + Number(v),
          0,
        ),
        channelValue = Math.max(
          0,
          Math.min(targetTotal, Number(current[channel] || 0) + change),
        ),
        others = paid.filter((c) => c.name !== channel),
        otherTotal = others.reduce(
          (sum, c) => sum + Number(current[c.name]),
          0,
        ),
        remaining = targetTotal - channelValue;
      const entries = others.map(
        (c) =>
          [
            c.name,
            Math.round(
              (remaining *
                (otherTotal
                  ? Number(current[c.name]) / otherTotal
                  : 1 / Math.max(1, others.length))) /
                100,
            ) * 100,
          ] as [string, number],
      );
      if (entries.length)
        entries.at(-1)![1] +=
          remaining - entries.reduce((sum, [, v]) => sum + v, 0);
      next[p.month] = {
        ...Object.fromEntries(entries),
        [channel]: channelValue,
      };
    });
    setMonthlyBudgetOverrides(next);
  };
  const setChurnRateValue = (
    fromMonth: string,
    ratePercent: number,
    future: boolean,
  ) => {
    const start = projection.findIndex((p) => p.month === fromMonth);
    if (start < 0) return;
    const value = Math.max(0, Math.min(50, ratePercent)) / 100,
      next = { ...monthlyChurnOverrides };
    projection.forEach((p, index) => {
      if (index === start || (future && index >= start)) next[p.month] = value;
    });
    setMonthlyChurnOverrides(next);
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const delta = e.clientY - drag.startY;
      const start = projection.findIndex((p) => p.month === drag.month);
      if (drag.kind === "budget" && drag.channel) {
        const selectedTotal = Object.values(
          monthSpends(drag.month, start),
        ).reduce((sum, v) => sum + Number(v), 0);
        const value =
          Math.round(
            Math.max(
              0,
              Math.min(
                selectedTotal,
                drag.startValue -
                  (delta * Math.max(selectedTotal, 1) * 1.25) / 300,
              ),
            ) / 100,
          ) * 100;
        const change = value - drag.startValue;
        const next = { ...monthlyBudgetOverrides };
        projection.forEach((p, index) => {
          if (index < start || (!applyFuture && index !== start)) return;
          const current = monthSpends(p.month, index);
          const targetTotal = Object.values(current).reduce(
            (sum, v) => sum + Number(v),
            0,
          );
          const channelValue = Math.max(
            0,
            Math.min(
              targetTotal,
              index === start ? value : Number(current[drag.channel!]) + change,
            ),
          );
          const others = paid.filter((c) => c.name !== drag.channel);
          const otherTotal = others.reduce(
            (sum, c) => sum + Number(current[c.name]),
            0,
          );
          const remaining = targetTotal - channelValue;
          const entries = others.map(
            (c) =>
              [
                c.name,
                Math.round(
                  (remaining *
                    (otherTotal
                      ? Number(current[c.name]) / otherTotal
                      : 1 / Math.max(1, others.length))) /
                    100,
                ) * 100,
              ] as [string, number],
          );
          if (entries.length)
            entries.at(-1)![1] +=
              remaining - entries.reduce((sum, [, v]) => sum + v, 0);
          next[p.month] = {
            ...Object.fromEntries(entries),
            [drag.channel!]: channelValue,
          };
        });
        setMonthlyBudgetOverrides(next);
      } else {
        const value =
          Math.round(
            Math.max(0, Math.min(50, drag.startValue - (delta * 20) / 300)) *
              10,
          ) / 1000;
        const next = { ...monthlyChurnOverrides };
        projection.forEach((p, index) => {
          if (index === start || (applyFuture && index >= start))
            next[p.month] = value;
        });
        setMonthlyChurnOverrides(next);
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [
    drag,
    budget,
    monthlyBudgetGrowth,
    monthlyBudgetOverrides,
    monthlyChurnOverrides,
    setMonthlyBudgetOverrides,
    setMonthlyChurnOverrides,
    channels,
    projection,
    applyFuture,
    monthSpends,
    paid,
  ]);
  const dot =
    (kind: "budget" | "churn", channel?: string) => (props: DotProps) => {
      const value = Number(props.payload?.[channel || "revenueChurnRate"] || 0);
      return (
        <circle
          cx={props.cx}
          cy={props.cy}
          r="8"
          fill="#fff"
          stroke="#27282a"
          strokeWidth="2"
          className="draggableDot"
          onPointerDown={(e) =>
            setDrag({
              kind,
              channel,
              month: String(props.payload?.month),
              startY: e.clientY,
              startValue: value,
            })
          }
          onMouseDown={(e) =>
            setDrag({
              kind,
              channel,
              month: String(props.payload?.month),
              startY: e.clientY,
              startValue: value,
            })
          }
        />
      );
    };
  const revTotal =
    assumptions.voluntaryRevenueChurn + assumptions.delinquentRevenueChurn;
  const logoTotal =
    assumptions.voluntaryCustomerChurn + assumptions.delinquentCustomerChurn;
  const budgetData = projection.map((p, i) => {
    const values = monthSpends(p.month, i);
    return {
      month: p.month,
      ...values,
      total: Object.values(values).reduce((sum, v) => sum + v, 0),
    };
  });
  const churnData = projection.map((p) => ({
    month: p.month,
    voluntaryMrr: revTotal
      ? (-p.churnMrr * assumptions.voluntaryRevenueChurn) / revTotal
      : 0,
    delinquentMrr: revTotal
      ? (-p.churnMrr * assumptions.delinquentRevenueChurn) / revTotal
      : 0,
    overrideMrr: revTotal ? 0 : -p.churnMrr,
    churnedCustomerArpu: p.churnedCustomerArpu ?? 0,
    churnedArpuRatio: (p.churnedArpuRatio ?? 0) * 100,
    revenueChurnRate: (monthlyChurnOverrides[p.month] ?? revTotal) * 100,
    voluntaryCustomers: logoTotal
      ? (p.churnedCustomers * assumptions.voluntaryCustomerChurn) / logoTotal
      : 0,
    delinquentCustomers: logoTotal
      ? (p.churnedCustomers * assumptions.delinquentCustomerChurn) / logoTotal
      : 0,
    customerChurnRate: logoTotal * 100,
  }));
  const mrrData = projection.map((p) => ({
    month: p.month,
    newMrr: p.newMrr,
    expansion: p.expansionMrr,
    downgrade: -p.retractionMrr,
    churn: -p.churnMrr,
    endingMrr: p.endingMrr,
    arr: p.arr,
  }));
  let prior = baselineMrr;
  const growthData = projection.map((p) => {
    const net = p.endingMrr - prior;
    const rate = prior ? (net / prior) * 100 : 0;
    prior = p.endingMrr;
    return {
      month: p.month,
      newMrr: p.newMrr,
      expansion: p.expansionMrr,
      downgrade: -p.retractionMrr,
      churn: -p.churnMrr,
      netNewMrr: net,
      growthRate: rate,
      endingMrr: p.endingMrr,
    };
  });
  const customerData = projection.map((p) => ({
    month: p.month,
    newCustomers: p.newCustomers,
    voluntaryChurn: logoTotal
      ? (-p.churnedCustomers * assumptions.voluntaryCustomerChurn) / logoTotal
      : 0,
    delinquentChurn: logoTotal
      ? (-p.churnedCustomers * assumptions.delinquentCustomerChurn) / logoTotal
      : 0,
    totalCustomers: p.customers,
  }));
  const cashflowData = projection.map((p) => ({
    month: p.month,
    ...cashFlowFor(p, cashFlowSettings),
  }));
  const cashFlowSplit =
    cashFlowSettings.monthlyShare +
    cashFlowSettings.annualShare +
    (cashFlowSettings.oneTimeEnabled ? cashFlowSettings.oneTimeShare : 0);
  const lowerZeroDomain = (values: number[]) => {
    const positive = Math.max(1, ...values.filter((v) => v > 0)),
      negative = Math.max(0, ...values.filter((v) => v < 0).map(Math.abs));
    const span = Math.max(positive / 0.8, negative / 0.2) * 1.08;
    return [-span * 0.2, span * 0.8] as [number, number];
  };
  const churnMoneyDomain = lowerZeroDomain(
      churnData.map((d) => d.voluntaryMrr + d.delinquentMrr + d.overrideMrr),
    ),
    churnRateDomain = lowerZeroDomain(churnData.map((d) => d.revenueChurnRate));
  const mrrMovementDomain = lowerZeroDomain(
      mrrData.flatMap((d) => [d.newMrr + d.expansion, d.downgrade + d.churn]),
    ),
    mrrTotalDomain = lowerZeroDomain(mrrData.map((d) => d.endingMrr));
  const growthMoneyDomain = lowerZeroDomain(
      growthData.flatMap((d) => [
        d.newMrr + d.expansion,
        d.downgrade + d.churn,
      ]),
    ),
    growthRateDomain = lowerZeroDomain(growthData.map((d) => d.growthRate));
  const customerTotalDomain = lowerZeroDomain(
      customerData.map((d) => d.totalCustomers),
    ),
    customerMovementDomain = lowerZeroDomain(
      customerData.flatMap((d) => [
        d.newCustomers,
        d.voluntaryChurn + d.delinquentChurn,
      ]),
    );
  const cashDomain = lowerZeroDomain(
    cashflowData.flatMap((d) => [
      d.monthlySubscriptions + d.yearlySubscriptions + d.oneTimePayments,
      d.fees + d.refunds,
    ]),
  );
  const tabs: [DeepTab, string][] = [
    ["budget", "Budget breakdown"],
    ["churn", "Churn overview"],
    ["mrr", "MRR overview"],
    ["growth", "Growth rate"],
    ["customers", "Customers overview"],
    ["cashflow", "Cash flow"],
  ];
  const exportMeta: Record<DeepTab, [string, string]> = {
    budget: [
      "Budget breakdown by subchannel",
      "Monthly allocated spend from each enabled paid subchannel’s go-live month onward.",
    ],
    churn: [
      "Churn overview",
      "Revenue and customer churn split into voluntary and delinquent movement.",
    ],
    mrr: [
      "MRR overview",
      "Ending MRR decomposed into new, expansion, downgrade, and churn movements.",
    ],
    growth: [
      "Growth rate",
      "Net-new MRR and monthly growth rate against the opening MRR balance.",
    ],
    customers: [
      "Customers overview",
      "New customers and voluntary/delinquent churn against the ending customer balance.",
    ],
    cashflow: [
      "Cash flow breakdown",
      "Projected subscription collections, one-time payments, fees, refunds, and net cash.",
    ],
  };
  const table = (
    data: Record<string, number | string>[],
    columns: { key: string; label: string; format?: (v: number) => string }[],
  ) => (
    <div className="deepTable">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={String(row.month || i)}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.format ? c.format(Number(row[c.key])) : String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="deepCard">
      <div className="deepTabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <ImageExportButton
          targetId={`deep-chart-${tab}`}
          filename={`${tab}-chart.png`}
          title={exportMeta[tab][0]}
          description={exportMeta[tab][1]}
        />
      </div>
      {tab === "budget" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Acquisition planning</span>
              <h2>Budget breakdown by subchannel</h2>
              <p>
                Monthly allocated spend from each enabled paid subchannel’s
                go-live month onward.
              </p>
            </div>
            <div className="deepActions budgetActions">
              <label className="deepEditable">
                Starting monthly budget{" "}
                <span>
                  $
                  <input
                    aria-label="Deep Dive monthly budget"
                    type="number"
                    min="0"
                    step="1000"
                    value={budget}
                    onChange={(e) => {
                      setBudget(clamp(+e.target.value));
                      setBudgetEditTotal(clamp(+e.target.value));
                      setMonthlyBudgetOverrides({});
                    }}
                  />
                </span>
              </label>
              <label className="futureToggle">
                <input
                  aria-label="Apply budget edits to future months"
                  type="checkbox"
                  checked={applyFuture}
                  onChange={(e) => setApplyFuture(e.target.checked)}
                />{" "}
                Apply chart edits to future months
              </label>
              <button type="button" onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide lines" : "Show lines"}
              </button>
              <button
                type="button"
                onClick={() => setMonthlyBudgetOverrides({})}
              >
                <RotateCcw size={12} /> Reset chart
              </button>
            </div>
          </div>
          <details className="budgetAdvanced">
            <summary>Advanced budget controls</summary>
            <div className="budgetPlanner">
              <label>
                Monthly budget increase %
                <input
                  aria-label="Monthly budget increase"
                  type="number"
                  min="0"
                  step="0.1"
                  value={one(monthlyBudgetGrowth * 100)}
                  onChange={(e) => {
                    setMonthlyBudgetGrowth(rateFromInput(e.target.value));
                    setMonthlyBudgetOverrides({});
                  }}
                />
              </label>
              <label>
                Change month
                <select
                  aria-label="Budget change month"
                  value={budgetEditMonth}
                  onChange={(e) => {
                    setBudgetEditMonth(e.target.value);
                    const index = projection.findIndex(
                      (p) => p.month === e.target.value,
                    );
                    setBudgetEditTotal(
                      Object.values(monthSpends(e.target.value, index)).reduce(
                        (sum, v) => sum + Number(v),
                        0,
                      ),
                    );
                  }}
                >
                  {projection.map((p) => (
                    <option key={p.month} value={p.month}>
                      {p.month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                New total budget
                <input
                  aria-label="Budget change total"
                  type="number"
                  min="0"
                  step="100"
                  value={budgetEditTotal}
                  onChange={(e) => setBudgetEditTotal(clamp(+e.target.value))}
                />
              </label>
              <button
                onClick={() =>
                  setBudgetTotal(budgetEditMonth, budgetEditTotal, false)
                }
              >
                Apply to month
              </button>
              <button
                className="primary"
                onClick={() =>
                  setBudgetTotal(budgetEditMonth, budgetEditTotal, true)
                }
              >
                Apply from month onward
              </button>
              <label>
                Subchannel
                <select
                  aria-label="Budget edit subchannel"
                  value={budgetEditChannel}
                  onChange={(e) => {
                    setBudgetEditChannel(e.target.value);
                    const index = projection.findIndex(
                      (p) => p.month === budgetEditMonth,
                    );
                    setBudgetChannelSpend(
                      Number(
                        monthSpends(budgetEditMonth, index)[e.target.value] ||
                          0,
                      ),
                    );
                  }}
                >
                  <option value="">Choose a channel</option>
                  {paid.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subchannel spend
                <input
                  aria-label="Budget edit subchannel spend"
                  type="number"
                  min="0"
                  step="100"
                  value={budgetChannelSpend}
                  onChange={(e) => setBudgetChannelSpend(clamp(+e.target.value))}
                />
              </label>
              <button
                disabled={!budgetEditChannel}
                onClick={() =>
                  setChannelSpendValue(
                    budgetEditMonth,
                    budgetEditChannel,
                    budgetChannelSpend,
                    applyFuture,
                  )
                }
              >
                Apply channel {applyFuture ? "forward" : "to month"}
              </button>
            </div>
          </details>
          <div id="deep-chart-budget" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={budgetData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => money(v)} />
                <Tooltip cursor={false} formatter={(v) => money2(Number(v))} />
                <Legend />
                {showLine &&
                  paid.map((c, i) => (
                    <Line
                      key={c.name}
                      type="monotone"
                      dataKey={c.name}
                      stroke={palette[i % palette.length]}
                      strokeWidth={2}
                      activeDot={false}
                      dot={dot("budget", c.name)}
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {table(
            budgetData,
            [
              { key: "month", label: "Month" },
              ...paid.map((c) => ({
                key: c.name,
                label: c.name,
                format: money,
              })),
              { key: "total", label: "Total", format: money },
            ].map((c) => (c.key === "total" ? c : c)),
          )}
        </>
      )}
      {tab === "churn" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Retention</span>
              <h2>Churn overview</h2>
              <p>
                Revenue and customer churn split into voluntary and delinquent
                movement.
              </p>
            </div>
            <div className="deepActions">
              <strong>{pct(revTotal)} revenue churn</strong>
              <label className="futureToggle">
                <input
                  aria-label="Apply churn edits to future months"
                  type="checkbox"
                  checked={applyFuture}
                  onChange={(e) => setApplyFuture(e.target.checked)}
                />{" "}
                Apply chart edits to future months
              </label>
              <button onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide line" : "Show line"}
              </button>
              <button onClick={() => setMonthlyChurnOverrides({})}>
                <RotateCcw size={12} /> Reset chart
              </button>
            </div>
          </div>
          <div className="churnPlanner">
            <label>
              Change month
              <select
                aria-label="Churn change month"
                value={churnEditMonth}
                onChange={(e) => {
                  setChurnEditMonth(e.target.value);
                  setChurnEditRate(
                    one(
                      (monthlyChurnOverrides[e.target.value] ?? revTotal) * 100,
                    ),
                  );
                }}
              >
                {projection.map((p) => (
                  <option key={p.month} value={p.month}>
                    {p.month}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Revenue churn %
              <input
                aria-label="Churn change rate"
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={churnEditRate}
                onChange={(e) => setChurnEditRate(clamp(+e.target.value, 0, 100))}
              />
            </label>
            <button
              onClick={() =>
                setChurnRateValue(churnEditMonth, churnEditRate, applyFuture)
              }
            >
              Apply churn {applyFuture ? "forward" : "to month"}
            </button>
          </div>
          <div id="deep-chart-churn" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={churnData} margin={{ left: 10, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  yAxisId="money"
                  domain={churnMoneyDomain}
                  ticks={[churnMoneyDomain[0], 0, churnMoneyDomain[1]]}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  yAxisId="rate"
                  domain={churnRateDomain}
                  ticks={[churnRateDomain[0], 0, churnRateDomain[1]]}
                  orientation="right"
                  tickFormatter={(v) => `${number(v)}%`}
                />
                <Tooltip
                  cursor={false}
                  formatter={(v, name) =>
                    String(name).includes("%")
                      ? `${Number(v).toFixed(2)}%`
                      : money2(Number(v))
                  }
                />
                <Legend />
                <Bar
                  yAxisId="money"
                  dataKey="voluntaryMrr"
                  stackId="a"
                  fill="#ed7779"
                  name="Voluntary MRR"
                />
                <Bar
                  yAxisId="money"
                  dataKey="delinquentMrr"
                  stackId="a"
                  fill="#f3aa82"
                  name="Delinquent MRR"
                />
                <Bar
                  yAxisId="money"
                  dataKey="overrideMrr"
                  stackId="a"
                  fill="#b66b83"
                  name="Override MRR"
                />
                {showLine && (
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="revenueChurnRate"
                    stroke="#27282a"
                    strokeWidth={3}
                    name="Revenue churn %"
                    activeDot={false}
                    dot={dot("churn")}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {table(churnData, [
            { key: "month", label: "Month" },
            { key: "voluntaryMrr", label: "Voluntary MRR", format: money },
            { key: "delinquentMrr", label: "Delinquent MRR", format: money },
            { key: "overrideMrr", label: "Override MRR", format: money },
            {
              key: "revenueChurnRate",
              label: "Revenue churn",
              format: (v) => `${number(v)}%`,
            },
            {
              key: "voluntaryCustomers",
              label: "Voluntary customers",
              format: whole,
            },
            {
              key: "delinquentCustomers",
              label: "Delinquent customers",
              format: whole,
            },
            {
              key: "customerChurnRate",
              label: "Customer churn",
              format: (v) => `${number(v)}%`,
            },
            {
              key: "churnedCustomerArpu",
              label: "Churned customer ARPU",
              format: money,
            },
            {
              key: "churnedArpuRatio",
              label: "Churned vs opening ARPU",
              format: (v) => `${number(v)}%`,
            },
          ])}
        </>
      )}
      {tab === "mrr" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Recurring revenue</span>
              <h2>MRR overview</h2>
              <p>
                Ending MRR decomposed into new, expansion, downgrade, and churn
                movements.
              </p>
            </div>
            <div className="deepActions">
              <strong>{money(projection.at(-1)?.endingMrr || 0)}</strong>
              <button onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide line" : "Show line"}
              </button>
            </div>
          </div>
          <div id="deep-chart-mrr" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={mrrData}
                stackOffset="sign"
                margin={{ left: 10, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  yAxisId="movement"
                  domain={mrrMovementDomain}
                  ticks={[mrrMovementDomain[0], 0, mrrMovementDomain[1]]}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  yAxisId="total"
                  domain={mrrTotalDomain}
                  ticks={[mrrTotalDomain[0], 0, mrrTotalDomain[1]]}
                  orientation="right"
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip cursor={false} formatter={(v) => money2(Number(v))} />
                <Legend />
                <Bar
                  yAxisId="movement"
                  dataKey="newMrr"
                  stackId="movement"
                  fill="#62c7b0"
                  name="New"
                />
                <Bar
                  yAxisId="movement"
                  dataKey="expansion"
                  stackId="movement"
                  fill="#8ad8cc"
                  name="Expansion"
                />
                <Bar
                  yAxisId="movement"
                  dataKey="downgrade"
                  stackId="movement"
                  fill="#f2ad89"
                  name="Downgrade"
                />
                <Bar
                  yAxisId="movement"
                  dataKey="churn"
                  stackId="movement"
                  fill="#e8797a"
                  name="Churn"
                />
                {showLine && (
                  <Line
                    yAxisId="total"
                    type="monotone"
                    dataKey="endingMrr"
                    stroke="#27282a"
                    strokeWidth={3}
                    name="Ending MRR"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {table(mrrData, [
            { key: "month", label: "Month" },
            { key: "newMrr", label: "New", format: money },
            { key: "expansion", label: "Expansion", format: money },
            { key: "downgrade", label: "Downgrade", format: money },
            { key: "churn", label: "Churn", format: money },
            { key: "endingMrr", label: "MRR", format: money },
            { key: "arr", label: "ARR", format: money },
          ])}
        </>
      )}
      {tab === "growth" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Momentum</span>
              <h2>Growth rate</h2>
              <p>
                Net-new MRR and monthly growth rate against the opening MRR
                balance.
              </p>
            </div>
            <div className="deepActions">
              <strong>{number(growthData.at(-1)?.growthRate || 0)}%</strong>
              <button onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide line" : "Show line"}
              </button>
            </div>
          </div>
          <div id="deep-chart-growth" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={growthData}
                stackOffset="sign"
                margin={{ left: 10, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  yAxisId="money"
                  domain={growthMoneyDomain}
                  ticks={[growthMoneyDomain[0], 0, growthMoneyDomain[1]]}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  yAxisId="rate"
                  domain={growthRateDomain}
                  ticks={[growthRateDomain[0], 0, growthRateDomain[1]]}
                  orientation="right"
                  tickFormatter={(v) => `${number(v)}%`}
                />
                <Tooltip
                  cursor={false}
                  formatter={(v, name) =>
                    String(name).includes("%")
                      ? `${Number(v).toFixed(2)}%`
                      : money2(Number(v))
                  }
                />
                <Legend />
                <Bar
                  yAxisId="money"
                  dataKey="newMrr"
                  stackId="movement"
                  fill="#62c7b0"
                  name="New MRR"
                />
                <Bar
                  yAxisId="money"
                  dataKey="expansion"
                  stackId="movement"
                  fill="#9bdccf"
                  name="Expansion"
                />
                <Bar
                  yAxisId="money"
                  dataKey="downgrade"
                  stackId="movement"
                  fill="#f0b294"
                  name="Downgrade"
                />
                <Bar
                  yAxisId="money"
                  dataKey="churn"
                  stackId="movement"
                  fill="#e98787"
                  name="Churn"
                />
                {showLine && (
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="growthRate"
                    stroke="#27282a"
                    strokeWidth={3}
                    name="Growth %"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {table(growthData, [
            { key: "month", label: "Month" },
            { key: "newMrr", label: "New", format: money },
            { key: "expansion", label: "Expansion", format: money },
            { key: "downgrade", label: "Downgrade", format: money },
            { key: "churn", label: "Churn", format: money },
            { key: "netNewMrr", label: "Net new MRR", format: money },
            {
              key: "growthRate",
              label: "Growth",
              format: (v) => `${number(v)}%`,
            },
            { key: "endingMrr", label: "MRR", format: money },
          ])}
        </>
      )}
      {tab === "customers" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Customer base</span>
              <h2>Customers overview</h2>
              <p>
                New customers and voluntary/delinquent churn against the ending
                customer balance.
              </p>
            </div>
            <div className="deepActions">
              <strong>{whole(projection.at(-1)?.customers || 0)}</strong>
              <button onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide line" : "Show line"}
              </button>
            </div>
          </div>
          <div id="deep-chart-customers" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={customerData}
                stackOffset="sign"
                margin={{ left: 10, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  yAxisId="total"
                  domain={customerTotalDomain}
                  ticks={[customerTotalDomain[0], 0, customerTotalDomain[1]]}
                  tickFormatter={whole}
                />
                <YAxis
                  yAxisId="movement"
                  domain={customerMovementDomain}
                  ticks={[
                    customerMovementDomain[0],
                    0,
                    customerMovementDomain[1],
                  ]}
                  orientation="right"
                  tickFormatter={whole}
                />
                <Tooltip cursor={false} formatter={(v) => whole(Number(v))} />
                <Legend />
                <Bar
                  yAxisId="movement"
                  dataKey="newCustomers"
                  stackId="movement"
                  fill="#65cbb5"
                  name="New customers"
                />
                <Bar
                  yAxisId="movement"
                  dataKey="voluntaryChurn"
                  stackId="movement"
                  fill="#e77c7c"
                  name="Voluntary churn"
                />
                <Bar
                  yAxisId="movement"
                  dataKey="delinquentChurn"
                  stackId="movement"
                  fill="#f2a584"
                  name="Delinquent churn"
                />
                {showLine && (
                  <Line
                    yAxisId="total"
                    type="monotone"
                    dataKey="totalCustomers"
                    stroke="#27282a"
                    strokeWidth={3}
                    name="Customers"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {table(customerData, [
            { key: "month", label: "Month" },
            { key: "newCustomers", label: "New customers", format: whole },
            { key: "voluntaryChurn", label: "Voluntary churn", format: whole },
            {
              key: "delinquentChurn",
              label: "Delinquent churn",
              format: whole,
            },
            { key: "totalCustomers", label: "Customers", format: whole },
          ])}
        </>
      )}
      {tab === "cashflow" && (
        <>
          <div className="deepTitle">
            <div>
              <span>Cash planning</span>
              <h2>Cash flow breakdown</h2>
              <p>
                Projected subscription collections, one-time payments, fees,
                refunds, and net cash.
              </p>
            </div>
            <div className="deepActions">
              <strong>
                {money(cashflowData.at(-1)?.netCash || 0)} net cash
              </strong>
              <button onClick={() => setShowLine(!showLine)}>
                {showLine ? "Hide net line" : "Show net line"}
              </button>
            </div>
          </div>
          <div className="cashInputs">
            <label>
              Fees %
              <input
                aria-label="Cash flow fees"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={one(cashFlowSettings.feeRate * 100)}
                onChange={(e) =>
                  setCashFlowSettings({
                    ...cashFlowSettings,
                    feeRate: rateFromInput(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Refunds %
              <input
                aria-label="Cash flow refunds"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={one(cashFlowSettings.refundRate * 100)}
                onChange={(e) =>
                  setCashFlowSettings({
                    ...cashFlowSettings,
                    refundRate: rateFromInput(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Monthly plans %
              <input
                aria-label="Monthly plan split"
                type="number"
                min="0"
                max="100"
                step="1"
                value={one(cashFlowSettings.monthlyShare * 100)}
                onChange={(e) =>
                  (() => {
                    const monthlyShare = Math.max(
                      0,
                      Math.min(1, +e.target.value / 100),
                    );
                    return setCashFlowSettings({
                      ...cashFlowSettings,
                      monthlyShare,
                      annualShare: Math.max(
                        0,
                        1 -
                          monthlyShare -
                          (cashFlowSettings.oneTimeEnabled
                            ? cashFlowSettings.oneTimeShare
                            : 0),
                      ),
                    });
                  })()
                }
              />
            </label>
            <label>
              Annual plans %
              <input
                aria-label="Annual plan split"
                type="number"
                min="0"
                max="100"
                step="1"
                value={one(cashFlowSettings.annualShare * 100)}
                onChange={(e) =>
                  (() => {
                    const annualShare = Math.max(
                      0,
                      Math.min(1, +e.target.value / 100),
                    );
                    return setCashFlowSettings({
                      ...cashFlowSettings,
                      annualShare,
                      monthlyShare: Math.max(
                        0,
                        1 -
                          annualShare -
                          (cashFlowSettings.oneTimeEnabled
                            ? cashFlowSettings.oneTimeShare
                            : 0),
                      ),
                    });
                  })()
                }
              />
            </label>
            <label className="oneTimeToggle">
              <input
                aria-label="Include one-time payments"
                type="checkbox"
                checked={cashFlowSettings.oneTimeEnabled}
                onChange={(e) =>
                  setCashFlowSettings({
                    ...cashFlowSettings,
                    oneTimeEnabled: e.target.checked,
                    oneTimeShare: e.target.checked
                      ? cashFlowSettings.oneTimeShare
                      : 0,
                    annualShare: e.target.checked
                      ? cashFlowSettings.annualShare
                      : Math.max(0, 1 - cashFlowSettings.monthlyShare),
                  })
                }
              />{" "}
              Include one-time payments
            </label>
            {cashFlowSettings.oneTimeEnabled && (
              <label>
                One-time payments %
                <input
                  aria-label="One-time payment split"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={one(cashFlowSettings.oneTimeShare * 100)}
                  onChange={(e) =>
                    (() => {
                      const oneTimeShare = Math.max(
                        0,
                        Math.min(1, +e.target.value / 100),
                      );
                      return setCashFlowSettings({
                        ...cashFlowSettings,
                        oneTimeShare,
                        annualShare: Math.max(
                          0,
                          1 - cashFlowSettings.monthlyShare - oneTimeShare,
                        ),
                      });
                    })()
                  }
                />
              </label>
            )}
            <strong
              className={
                Math.abs(cashFlowSplit - 1) > 0.001
                  ? "splitWarning"
                  : "splitValid"
              }
            >
              Plan split: {number(cashFlowSplit * 100)}%
            </strong>
          </div>
          <div className="cashSummary">
            <article>
              <small>MONTHLY SUBSCRIPTIONS</small>
              <strong>
                {money(cashflowData.at(-1)?.monthlySubscriptions || 0)}
              </strong>
            </article>
            <article>
              <small>YEARLY SUBSCRIPTIONS</small>
              <strong>
                {money(cashflowData.at(-1)?.yearlySubscriptions || 0)}
              </strong>
            </article>
            <article>
              <small>ONE-TIME</small>
              <strong>
                {money(cashflowData.at(-1)?.oneTimePayments || 0)}
              </strong>
            </article>
            <article>
              <small>FEES</small>
              <strong>{money(cashflowData.at(-1)?.fees || 0)}</strong>
            </article>
            <article>
              <small>REFUNDS</small>
              <strong>{money(cashflowData.at(-1)?.refunds || 0)}</strong>
            </article>
            <article>
              <small>NET CASH</small>
              <strong>{money(cashflowData.at(-1)?.netCash || 0)}</strong>
            </article>
          </div>
          <div id="deep-chart-cashflow" className="deepChart">
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart
                data={cashflowData}
                stackOffset="sign"
                margin={{ left: 10, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  domain={cashDomain}
                  ticks={[cashDomain[0], 0, cashDomain[1]]}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip cursor={false} formatter={(v) => money2(Number(v))} />
                <Legend />
                <Bar
                  dataKey="monthlySubscriptions"
                  stackId="cash"
                  fill="#2ab99f"
                  name="Monthly subscriptions"
                />
                <Bar
                  dataKey="yearlySubscriptions"
                  stackId="cash"
                  fill="#7bd7c3"
                  name="Yearly subscriptions"
                />
                <Bar
                  dataKey="oneTimePayments"
                  stackId="cash"
                  fill="#257f70"
                  name="One-time payments"
                />
                <Bar dataKey="fees" stackId="cash" fill="#f1b84b" name="Fees" />
                <Bar
                  dataKey="refunds"
                  stackId="cash"
                  fill="#e8797a"
                  name="Refunds"
                />
                {showLine && (
                  <Line
                    type="monotone"
                    dataKey="netCash"
                    stroke="#27282a"
                    strokeWidth={3}
                    name="Net cash"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {table(cashflowData, [
            { key: "month", label: "Month" },
            {
              key: "monthlySubscriptions",
              label: "Monthly subscriptions",
              format: money,
            },
            {
              key: "yearlySubscriptions",
              label: "Yearly subscriptions",
              format: money,
            },
            {
              key: "oneTimePayments",
              label: "One-time payments",
              format: money,
            },
            { key: "fees", label: "Fees", format: money },
            { key: "refunds", label: "Refunds", format: money },
            { key: "netCash", label: "Net cash", format: money },
          ])}
        </>
      )}
    </section>
  );
}

type PageView =
  | "home"
  | "why"
  | "how"
  | "baseline"
  | "forecast"
  | "deepdive"
  | "channels"
  | "methodology"
  | "terms"
  | "privacy"
  | "about"
  | "philosophy"
  | "careers"
  | "partners";

const pageMetadata: Record<PageView, { title: string; description: string; path: string }> = {
  home: { title: "GrowthCast | GTM Engineering for Growth", description: "One growth plan across marketing, product, sales, and data.", path: "/" },
  why: { title: "Why GrowthCast | One Plan for Revenue", description: "Why growth requires one operating plan across the whole customer path.", path: "/why-growthcast" },
  how: { title: "How We Work | GrowthCast",  description: "See how GrowthCast finds the revenue constraint, builds the model, and works beside your team.", path: "/how-it-works" },
  terms: { title: "Terms of Use | GrowthCast", description: "Terms for using GrowthCast and the Forecast tool.", path: "/terms" },
  privacy: { title: "Privacy Policy | GrowthCast", description: "How GrowthCast collects, uses, and protects information.", path: "/privacy" },
  about: { title: "About GrowthCast | Operator-Led Growth", description: "Meet the operator behind GrowthCast and review the experience that shaped the work.", path: "/company/about" },
  philosophy: { title: "GrowthCast Philosophy | AAARRR and Future Demand", description: "How GrowthCast connects the full customer journey with current and future demand.", path: "/company/philosophy" },
  careers: { title: "Careers | GrowthCast", description: "Future opportunities to work with GrowthCast.", path: "/company/careers" },
  partners: { title: "Partners | GrowthCast", description: "The technology partners GrowthCast uses to build modern growth systems.", path: "/company/partners" },
  baseline: { title: "GrowthCast Forecast | Build Your Growth Model", description: "Model traffic, conversion, customers, revenue, churn, and channel spend.", path: "/resources/tools/forecast" },
  forecast: { title: "Growth Forecast | GrowthCast", description: "Review your modeled growth forecast.", path: "/resources/tools/forecast" },
  deepdive: { title: "Growth Forecast Deep Dive | GrowthCast", description: "Explore the drivers behind your growth forecast.", path: "/resources/tools/forecast" },
  channels: { title: "Growth Channel Plan | GrowthCast", description: "Model channel timing, spend, traffic, conversion, and customer value.", path: "/resources/tools/forecast" },
  methodology: { title: "Forecast Methodology | GrowthCast", description: "Review the assumptions and calculations behind the GrowthCast Forecast.", path: "/resources/tools/forecast" },
};

const pageFromPath = (path: string): PageView => {
  if (path.startsWith("/resources/tools/forecast")) return "baseline";
  if (path.startsWith("/why-growthcast")) return "why";
  if (path.startsWith("/how-it-works")) return "how";
  if (path.startsWith("/terms")) return "terms";
  if (path.startsWith("/privacy")) return "privacy";
  if (path.startsWith("/company/about")) return "about";
  if (path.startsWith("/company/philosophy")) return "philosophy";
  if (path.startsWith("/company/careers")) return "careers";
  if (path.startsWith("/company/partners")) return "partners";
  return "home";
};

function AgencyHome({
  onForecast,
  onContact,
}: {
  onForecast: () => void;
  onContact: () => void;
}) {
  return (
    <article className="homeCard agencyHome">
      <section className="agencyHero conversionHero">
        <div className="agencyHeroCopy">
          <span className="sectionLabel">GTM Engineering for Growth</span>
          <h1>You gave the board a growth target. Here&apos;s how you&apos;re going to crush it.</h1>
          <p>
            GrowthCast executes at the nexus of marketing, product, sales, and
            data to identify, prioritize, and build the Golden Path.
          </p>
          <div className="agencyActions">
            <button className="agencyPrimary" type="button" onClick={onContact}>
              Let's Talk Growth
            </button>
            <button type="button" onClick={onForecast}>Build a forecast</button>
          </div>
          <p className="heroReassurance">A direct conversation with the person who will lead the work. No sales team.</p>
        </div>
      </section>

      <section className="heroMetrics" aria-label="GrowthCast experience">
        <article><strong>$20M+</strong><span>annual recurring revenue built</span></article>
        <article><strong>1,000,000+</strong><span>users acquired</span></article>
        <article><strong>$50M+</strong><span>raised by teams</span></article>
      </section>

      <section className="investorProof" aria-label="Investor-backed company experience">
        <span>Trusted by teams backed by</span>
        <div>
          {['NEA', 'Lightspeed', 'Decibel', 'OMERS Ventures', 'Caffeinated Capital'].map((name) => (
            <strong key={name}>{name}</strong>
          ))}
        </div>
      </section>

      <section className="agencyProblem homePain">
        <div className="sectionIntro">
          <span className="sectionLabel">You are doing the work, but</span>
          <h2>Growth gets harder as the company adds more moving parts.</h2>
        </div>
        <div className="problemBody">
          <p className="problemLead">
            As the pace of work accelerates, if your GTM motion doesn&apos;t facilitate scale, it inhibits execution.
          </p>
          <div className="problemGrid">
            <article><b>01</b><h3>No shared model</h3><p>Marketing, product, and revenue plan from different assumptions. Leaders cannot see what must be true for the target to hold.</p></article>
            <article><b>02</b><h3>Activity hides the constraint</h3><p>Teams ship campaigns, features, reports, and automations. The point limiting growth stays unfixed.</p></article>
            <article><b>03</b><h3>Data does not guide action</h3><p>Dashboards explain what happened. They do not tell the team what to fund, stop, or change next.</p></article>
            <article><b>04</b><h3>More spend scales waste</h3><p>New channels and tools add cost before conversion, retention, handoffs, and ownership are ready.</p></article>
          </div>
        </div>
      </section>

      <section className="leadStory">
        <div className="leadStoryCopy">
          <span className="sectionLabel">What happens when growth has one owner</span>
          <h2>A newsletter platform grew from launch to more than $20M in ARR.</h2>
          <p>
            As the first growth employee, GrowthCast&apos;s founder helped build the
            path from product launch to repeatable acquisition and revenue. The work joined
            positioning, demand, conversion, lifecycle, data, and product around
            the same growth goal.
          </p>
        </div>
        <div className="leadStoryStats">
          <article><strong>$20M+</strong><span>annual recurring revenue built</span></article>
          <article><strong>1,000,000+</strong><span>users acquired</span></article>
          <article><strong>$50M+</strong><span>raised by teams</span></article>
        </div>
      </section>

      <section className="transformationSection">
        <div className="sectionIntro">
          <span className="sectionLabel">What changes</span>
          <h2>Stop managing disconnected growth work.</h2>
        </div>
        <div className="transformationGrid">
          <article className="beforeState">
            <span>What growth looks like now</span>
            <ul>
              <li>Each function works from a different plan</li>
              <li>Budget follows channels instead of constraints</li>
              <li>Reports arrive after decisions are made</li>
              <li>Short-term demand crowds out future demand</li>
              <li>Senior leaders fill gaps through manual work</li>
            </ul>
          </article>
          <article className="afterState">
            <span>What GrowthCast builds</span>
            <ul>
              <li>One model links demand, product use, revenue, and retention</li>
              <li>Investment follows the point limiting growth</li>
              <li>Measures support the next decision</li>
              <li>Current and future demand share one plan</li>
              <li>Clear systems, owners, and operating rhythms</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="agencyResults supportingResults">
        <div className="sectionIntro">
          <span className="sectionLabel">Real results from the work</span>
          <h2>Built inside B2B software, AI tools, and consumer products.</h2>
        </div>
        <div className="resultGrid">
          <article><strong>200+</strong><h3>Enterprise clients</h3><p>A new private-equity motion helped an AI research platform close more than 200 enterprise clients in six months.</p></article>
          <article><strong>450%</strong><h3>More signups</h3><p>An integrated growth plan increased signups at a creative platform by 450% within two weeks.</p></article>
          <article><strong>$20M+</strong><h3>Annual recurring revenue</h3><p>Growth leadership helped a software company grow from launch to more than $20 million in ARR.</p></article>
        </div>
      </section>

      <section className="agencyFit">
        <div className="fitColumn fitYes">
          <span className="sectionLabel">You are a fit if</span>
          <h2>The product works. The growth system needs to catch up.</h2>
          <ul>
            <li>You have product-market fit and real customer traction.</li>
            <li>You face pressure to turn traction into repeatable revenue.</li>
            <li>There&apos;s no one orchestrating marketing, product, sales, and data.</li>
            <li>You want the experience of a senior operator who can advise, lead, and/or build without the overhead of a full-time hire.</li>
          </ul>
        </div>
        <div className="fitColumn fitNo">
          <span className="sectionLabel">Probably not a fit if</span>
          <h2>You still need to prove the core demand.</h2>
          <ul>
            <li>You are still choosing the customer or problem.</li>
            <li>You want isolated tactics instead of a shared growth plan.</li>
            <li>You cannot give the work access, support, or an owner.</li>
            <li>You need a low-cost execution vendor, not an embedded operator.</li>
          </ul>
        </div>
      </section>

      <section className="agencyClose conversionClose">
        <span className="sectionLabel">Find the constraint</span>
        <h2>Ready to engineer your go-to-market system?</h2>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}

function AgencyWhy({ onContact }: { onContact: () => void }) {
  return (
    <article className="homeCard agencyHome agencySubpage">
      <section className="subpageHero">
        <span className="sectionLabel">Why GrowthCast</span>
        <h1>The trendy “hack” you heard on that podcast is not a growth plan.</h1>
        <p>GrowthCast brings the judgment, experience, and discipline to execute sustainable, scalable strategies.</p>
        <div className="agencyActions">
          <button className="agencyPrimary" type="button" onClick={onContact}>Let's Talk Growth</button>
        </div>
      </section>
      <section className="agencyMethod whyArguments">
        <div className="sectionIntro">
          <span className="sectionLabel">What most companies get wrong</span>
          <h2>Growth is a company system, not a marketing channel.</h2>
          <p>GrowthCast works across the full path from demand to retention. That changes how the company sets priorities, uses data, and decides where to invest.</p>
        </div>
        <ol className="methodSteps">
          <li><b>01</b><div><h3>A revenue target is not a growth plan.</h3><p>A target says where the company wants to go. It does not show how many buyers, users, customers, and retained dollars the business needs each month. We turn the target into a model every team can use.</p></div></li>
          <li><b>02</b><div><h3>The biggest problem may not sit in marketing.</h3><p>More demand cannot fix weak activation, a broken sales handoff, poor retention, or pricing that limits revenue. We find the point that holds back the whole system before we add work or spend.</p></div></li>
          <li><b>03</b><div><h3>Dashboards do not make decisions.</h3><p>Teams often have more data than they can use. We define the few measures that reveal what changed, why it changed, and what the company should do next.</p></div></li>
          <li><b>04</b><div><h3>AI should remove work, not add another tool.</h3><p>We use automation when it shortens a process, improves a decision, or lets the team serve more customers. If it does none of those things, it does not belong in the plan.</p></div></li>
        </ol>
      </section>
      <section className="agencyClose">
        <span className="sectionLabel">One plan for revenue</span>
        <h2>Find what is holding growth back.</h2>
        <p>Start with the target, the customer path, and the facts already inside the business.</p>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}

function CompanyPage({ type }: { type: "about" | "philosophy" | "careers" | "partners" }) {
  if (type === "about") {
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero">
          <span className="sectionLabel">About GrowthCast</span>
          <h1>Builders without boundaries.</h1>
          <p>GrowthCast&apos;s DNA is rooted in strategy and execution, brand and data, product and revenue.</p>
        </section>
        <section className="companyNarrative">
          <div><h2>Curious enough to ask why. Practical enough to build the answer.</h2></div>
          <div>
            <p>The experience behind GrowthCast spans early-stage consumer products, D2C brands, B2B software, and enterprise AI. It also includes two agency stints at firms that were later acquired.</p>
            <p>Across those settings, the work has moved between positioning, product marketing, paid media, lifecycle, analytics, revenue operations, sales, customer success, software, and team building. The common thread is a willingness to cross boundaries and take responsibility for the result.</p>
            <p>GrowthCast brings that mindset to every engagement. Start with first principles. Stay close to customers. Use data without hiding behind it. Work beside the team. Leave behind a system that keeps working.</p>
            <a href="https://www.linkedin.com/in/edwardjwhiteiii" target="_blank" rel="noreferrer">Connect with our founder</a>
          </div>
        </section>
        <section className="aboutJourney">
          <div><h2>Experience across markets, stages, and business models.</h2></div>
          <div className="aboutJourneyGrid">
            <article><b>Agency foundation</b><p>Built cross-industry experience at two agencies that were later acquired, working across strategy, media, analytics, customer journeys, and organizational change.</p></article>
            <article><b>Early stage</b><p>Repeated first-team experience building brands, acquisition systems, customer journeys, and operating processes from zero.</p></article>
            <article><b>Scale</b><p>Helped a software company grow from launch to more than $30 million in revenue, 20,000 customers, and 500,000 users.</p></article>
            <article><b>AI-Native</b><p>Builds growth systems for AI companies and uses AI across research, decision-making, automation, product experiences, and go-to-market execution.</p></article>
          </div>
        </section>
      </article>
    );
  }
  if (type === "philosophy") {
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero">
          <span className="sectionLabel">Philosophy</span>
          <h1>Marketing is about people.</h1>
          <p>Whether a company sells to businesses, consumers, or both, growth depends on influencing people. We keep that principle at the center of every decision.</p>
        </section>
        <section className="peopleFramework">
          <span className="sectionLabel">Business to People</span>
          <h2>The label changes. The person making the decision does not.</h2>
          <p>B2B, B2C, and D2C describe how a company sells. They do not change who chooses, uses, recommends, or pays for the product. Every market is made of people with goals, habits, doubts, and competing demands on their attention.</p>
          <p>GrowthCast starts there. We ask what people need to believe, feel, and do before we decide what to build, say, measure, or fund.</p>
        </section>
        <section className="futureDemandFramework">
          <span className="sectionLabel">Future Demand</span>
          <h2>Understand how people decide before trying to persuade them.</h2>
          <p>Most potential buyers are not ready to buy today. They notice problems, learn categories, remember brands, and build preferences long before they enter a sales process.</p>
          <p>Future Demand builds memory before the need becomes urgent. Current Demand helps people act when they are ready. A sound growth plan must do both.</p>
        </section>
        <section className="frameworkSection">
          <div className="sectionIntro"><span className="sectionLabel">AAARRR</span><h2>Turn that understanding into a system.</h2><p>AAARRR applies what we know about people and decisions across the full customer journey.</p></div>
          <ol className="frameworkGrid">
            {[
              ["Awareness", "Make the right people aware of the problem and the company that can solve it."],
              ["Acquisition", "Turn attention into a visit, signup, lead, or other meaningful first step."],
              ["Activation", "Help people reach the first moment when the product proves its value."],
              ["Revenue", "Turn proven value into paid customer relationships and healthy unit economics."],
              ["Retention", "Keep delivering enough value for customers to stay and grow."],
              ["Referral", "Give successful customers a reason and a way to bring others with them."],
            ].map(([name, description], index) => <li key={name}><b>{String(index + 1).padStart(2, "0")}</b><h3>{name}</h3><p>{description}</p></li>)}
          </ol>
        </section>
      </article>
    );
  }

  if (type === "partners") {
    const partnerGroups = [
      ["Affiliate", [["Dub.co", "https://dub.co"]]],
      ["Analytics", [["PostHog", "https://posthog.com"], ["BlueAlpha", "https://bluealpha.ai"], ["Ahrefs", "https://ahrefs.com"]]],
      ["CRM", [["Attio", "https://attio.com"]]],
      ["Marketing Automation", [["Customer.io", "https://customer.io"]]],
      ["CMS", [["Sanity", "https://sanity.io"], ["Prismic", "https://prismic.io"]]],
      ["Content", [["beehiiv", "https://beehiiv.com"]]],
      ["AI", [["OpenRouter", "https://openrouter.ai"], ["ElevenLabs", "https://elevenlabs.io"], ["Clay", "https://clay.com"]]],
      ["Infra", [["Trigger.dev", "https://trigger.dev"], ["Hookdeck", "https://hookdeck.com"]]],
    ] as const;
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero"><span className="sectionLabel">Partners</span><h1>Tools chosen for the system they support.</h1><p>GrowthCast works with focused technology partners across data, content, customer relationships, automation, and AI.</p></section>
        <section className="partnersShowcase" aria-labelledby="partners-heading">
          <h2 id="partners-heading">The GrowthCast partner network.</h2>
          <div className="partnerGrid">
            {partnerGroups.map(([category, partners]) => (
              <article key={category}>
                <h3>{category}</h3>
                <ul>{partners.map(([partner, url]) => <li key={partner}><a href={url} target="_blank" rel="noreferrer">{partner}</a></li>)}</ul>
              </article>
            ))}
          </div>
        </section>
      </article>
    );
  }
  return (
    <article className="homeCard agencyHome agencySubpage companyPage">
      <section className="subpageHero"><span className="sectionLabel">Careers</span><h1>Build growth systems that teams can keep using.</h1><p>GrowthCast is not hiring right now. Future opportunities will appear here.</p></section>
    </article>
  );
}

function LegalPage({ type }: { type: "terms" | "privacy" }) {
  const isPrivacy = type === "privacy";
  return (
    <article className="homeCard agencyHome legalPage">
      <section className="subpageHero">
        <span className="sectionLabel">GrowthCast</span>
        <h1>{isPrivacy ? "Privacy Policy" : "Terms of Use"}</h1>
        <p>Last updated September 1, 2026.</p>
      </section>
      <section className="legalBody">
        {isPrivacy ? (
          <>
            <h2>Information we collect</h2>
            <p>When you submit a contact or Growth Plan form, we collect the information you provide. This can include your name, company, business email, title, baseline, and forecast assumptions.</p>
            <p>We also use PostHog to understand how people use this site. PostHog can collect device, browser, page, and interaction data.</p>
            <h2>How we use information</h2>
            <p>We use this information to respond to requests, provide GrowthCast services, improve the site, and understand product use. We do not sell personal information.</p>
            <h2>Local model data</h2>
            <p>The Forecast tool stores model progress in your browser. GrowthCast does not receive that model data unless you submit a Growth Plan request.</p>
            <h2>Service providers</h2>
            <p>We use service providers, including PostHog and our website host, to operate and measure the site. They process information on our behalf.</p>
            <h2>Your choices</h2>
            <p>You can clear locally stored Forecast data through your browser. To ask about, correct, or delete information you submitted, contact GrowthCast.</p>
          </>
        ) : (
          <>
            <h2>Using this site</h2>
            <p>You may use the GrowthCast site and Forecast tool for lawful business purposes. Do not misuse the site, interfere with its operation, or attempt to access systems or data without permission.</p>
            <h2>Forecasts are estimates</h2>
            <p>The Forecast tool produces estimates from the assumptions you provide. Its output is not financial, legal, tax, or investment advice. You are responsible for decisions based on the output.</p>
            <h2>Ownership</h2>
            <p>GrowthCast owns the site, its design, and its original content. You retain ownership of information and assumptions you enter.</p>
            <h2>No warranty</h2>
            <p>The site is provided as available. GrowthCast does not promise that it will always be available, error-free, or suitable for a specific purpose.</p>
            <h2>Limitation of liability</h2>
            <p>To the extent allowed by law, GrowthCast is not liable for indirect, incidental, or consequential loss arising from use of the site or Forecast tool.</p>
            <h2>Changes</h2>
            <p>We may update these terms. Continued use of the site after an update means you accept the revised terms.</p>
          </>
        )}
      </section>
    </article>
  );
}

function AgencyHow({ onContact }: { onContact: () => void }) {
  return (
    <article className="homeCard agencyHome agencySubpage">
      <section className="subpageHero">
        <span className="sectionLabel">How We Work</span>
        <h1>Build the foundation to reach your loftiest goals.</h1>
        <p>We use a proven, adaptable playbook grounded in first principles.</p>
        <div className="agencyActions">
          <button className="agencyPrimary" type="button" onClick={onContact}>Let's Talk Growth</button>
        </div>
      </section>
      <section className="agencyMethod">
        <div className="sectionIntro">
          <span className="sectionLabel">The first 90 days</span>
          <h2>From uncertainty to clear conviction.</h2>
        </div>
        <ol className="methodSteps">
          <li><b>Weeks 1–2</b><div><h3>Find what holds back revenue</h3><p>Review the revenue target, customer journey, conversion, retention, channels, data, tools, and team. Leave with a clear diagnosis and an agreed order of work.</p></div></li>
          <li><b>Weeks 3–4</b><div><h3>Build the growth model</h3><p>Connect demand, product use, customers, revenue, and retention. Set the measures, owners, and monthly assumptions behind the plan.</p></div></li>
          <li><b>Days 31–60</b><div><h3>Fix the first constraint</h3><p>Work with the team to change the process, message, product path, data, or channel that limits growth. Ship the work and measure the result.</p></div></li>
          <li><b>Days 61–90</b><div><h3>Make the system repeatable</h3><p>Keep what works. Remove what does not. Put the reviews, dashboards, automations, and ownership in place so the team can keep improving.</p></div></li>
        </ol>
      </section>
      <section className="deliverySection">
        <div className="sectionIntro">
          <span className="sectionLabel">What we take on</span>
          <h2>Senior growth leadership without another layer to manage.</h2>
        </div>
        <div className="deliveryGrid">
          <article><b>Diagnosis</b><p>We bring the facts together and identify the first problem worth solving.</p></article>
          <article><b>Priorities</b><p>We turn the revenue target into a clear order of work across teams.</p></article>
          <article><b>Execution</b><p>We work inside the tools and processes needed to make the change real.</p></article>
          <article><b>Operating rhythm</b><p>We give leaders a regular way to review results and choose what happens next.</p></article>
        </div>
      </section>
      <section className="agencyClose">
        <span className="sectionLabel">Start with the facts</span>
        <h2>See what the next 90 days should change.</h2>
        <p>No pitch deck. No handoff to a junior team.</p>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}

export default function App() {
  const [saved] = useState(loadSavedModel);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [modelName, setModelName] = useState(saved.modelName || "GrowthCast");
  const [downloadFormat, setDownloadFormat] = useState<"json" | "csv">("json");
  const [forecastFormat, setForecastFormat] = useState<"csv" | "pdf">("pdf");
  const [forecastStartMonth, setForecastStartMonth] = useState(
    saved.forecastStartMonth && monthOptions.includes(saved.forecastStartMonth)
      ? saved.forecastStartMonth
      : defaultForecastStartMonth,
  );
  const [pageView, setPageView] = useState<PageView>(() =>
    pageFromPath(window.location.pathname),
  );
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  useEffect(() => {
    const metadata = pageMetadata[pageView];
    const canonicalUrl = `https://growthcast.app${metadata.path}`;
    document.title = metadata.title;
    const setMeta = (selector: string, attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = content;
    };
    setMeta('meta[name="description"]', "name", "description", metadata.description);
    setMeta('meta[property="og:title"]', "property", "og:title", metadata.title);
    setMeta('meta[property="og:description"]', "property", "og:description", metadata.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", metadata.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", metadata.description);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const structuredData = document.getElementById("structured-data");
    if (structuredData) {
      structuredData.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": ["baseline", "forecast", "deepdive", "channels", "methodology"].includes(pageView) ? "SoftwareApplication" : "WebPage",
        name: metadata.title,
        description: metadata.description,
        url: canonicalUrl,
        isPartOf: { "@type": "WebSite", name: "GrowthCast", url: "https://growthcast.app/" },
        ...(pageView === "baseline" ? { applicationCategory: "BusinessApplication", operatingSystem: "Web" } : {}),
      });
    }
  }, [pageView]);
  const [channelTab, setChannelTab] = useState<ChannelModel | "general">(
    "general",
  );
  const [showHidden, setShowHidden] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline>(
    saved.baseline || {
      month: defaultBaselineMonth,
      visitors: 0,
      signups: 0,
      mqls: 0,
      sqls: 0,
      newCustomers: 0,
      customers: 0,
      mrr: 0,
      arpu: 0,
      arr: 0,
    },
  );
  const baselineInput = useRef<HTMLInputElement>(null);
  const [a, setA] = useState<Assumptions>(saved.assumptions || defaults);
  const [channelDefaults, setChannelDefaults] = useState<ChannelDefaults>(
    saved.channelDefaults || {
      signupRate: 0.137,
      purchaseRate: 0.008,
      arpu: 38,
      mqlRate: 0.05,
      sqlRate: 0.4,
      closeRate: 0.2,
      acv: 12000,
    },
  );
  const [scenario, setScenario] = useState(saved.scenario || "Baseline");
  const [budget, setBudget] = useState(saved.budget ?? 0);
  const [monthlyBudgetGrowth, setMonthlyBudgetGrowth] = useState(
    saved.monthlyBudgetGrowth ?? 0,
  );
  const [monthlyBudgetOverrides, setMonthlyBudgetOverrides] = useState<
    Record<string, Record<string, number>>
  >(saved.monthlyBudgetOverrides || {});
  const [monthlyChurnOverrides, setMonthlyChurnOverrides] = useState<
    Record<string, number>
  >(saved.monthlyChurnOverrides || {});
  const [cashFlowSettings, setCashFlowSettings] = useState<CashFlowSettings>({
    ...defaultCashFlow,
    ...saved.cashFlowSettings,
  });
  const [channels, setChannels] = useState(() =>
    normalizeChannels(saved.channels),
  );
  const [showGrowthPlan, setShowGrowthPlan] = useState(false);
  const [growthPlanClosing, setGrowthPlanClosing] = useState(false);
  const [growthPlanSubmitted, setGrowthPlanSubmitted] = useState(() => {
    try {
      return localStorage.getItem("growth-plan-requested-v1") === "true";
    } catch {
      return false;
    }
  });
  const [growthPlanStatus, setGrowthPlanStatus] = useState("");
  const [growthPlanHeight, setGrowthPlanHeight] = useState(0);
  const growthPlanPrompt = useRef<HTMLElement>(null);
  const priorAssumptions = useRef(JSON.stringify(a));
  const priorChannelSettings = useRef(
    JSON.stringify({ channels, channelDefaults }),
  );
  const growthPlanTimer = useRef<number | undefined>(undefined);
  const growthPlanCloseTimer = useRef<number | undefined>(undefined);
  const dismissGrowthPlan = useCallback(() => {
    if (!showGrowthPlan || growthPlanClosing) return;
    setGrowthPlanClosing(true);
    window.clearTimeout(growthPlanCloseTimer.current);
    growthPlanCloseTimer.current = window.setTimeout(() => {
      setShowGrowthPlan(false);
      setGrowthPlanClosing(false);
    }, 360);
  }, [growthPlanClosing, showGrowthPlan]);
  useEffect(() => {
    const nextAssumptions = JSON.stringify(a);
    const nextChannelSettings = JSON.stringify({ channels, channelDefaults });
    const forecastChanged =
      pageView === "forecast" && nextAssumptions !== priorAssumptions.current;
    const channelsChanged =
      pageView === "channels" &&
      nextChannelSettings !== priorChannelSettings.current;
    priorAssumptions.current = nextAssumptions;
    priorChannelSettings.current = nextChannelSettings;
    if ((forecastChanged || channelsChanged) && !growthPlanSubmitted) {
      window.clearTimeout(growthPlanTimer.current);
      growthPlanTimer.current = window.setTimeout(() => {
        setGrowthPlanClosing(false);
        setShowGrowthPlan(true);
      }, 15_000);
    }
  }, [a, channels, channelDefaults, growthPlanSubmitted, pageView]);
  useEffect(
    () => () => {
      window.clearTimeout(growthPlanTimer.current);
      window.clearTimeout(growthPlanCloseTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!showGrowthPlan || !growthPlanSubmitted) return;
    window.addEventListener("scroll", dismissGrowthPlan, { passive: true });
    return () => window.removeEventListener("scroll", dismissGrowthPlan);
  }, [dismissGrowthPlan, growthPlanSubmitted, showGrowthPlan]);
  useEffect(() => {
    if (!showGrowthPlan || !growthPlanPrompt.current) {
      setGrowthPlanHeight(0);
      return;
    }
    const prompt = growthPlanPrompt.current;
    const updateHeight = () => setGrowthPlanHeight(prompt.offsetHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(prompt);
    return () => observer.disconnect();
  }, [showGrowthPlan]);
  useEffect(() => {
    document.title =
      pageView === "home"
        ? "GrowthCast | GTM Engineering for Growth"
        : pageView === "why"
          ? "Why GrowthCast | GTM Engineering for Growth"
          : pageView === "how"
            ? "How We Work | GrowthCast"
            : `${modelName || "GrowthCast"} Forecast`;
  }, [modelName, pageView]);
  useEffect(() => {
    const handleHistory = () =>
      setPageView(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handleHistory);
    return () => window.removeEventListener("popstate", handleHistory);
  }, []);
  useEffect(() => {
    try {
      const value: SavedModel = {
        modelName,
        baseline,
        forecastStartMonth,
        assumptions: a,
        channelDefaults,
        scenario,
        budget,
        monthlyBudgetGrowth,
        channels,
        monthlyBudgetOverrides,
        monthlyChurnOverrides,
        cashFlowSettings,
      };
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* Persistence may be unavailable in private browsing. */
    }
  }, [
    modelName,
    baseline,
    forecastStartMonth,
    a,
    channelDefaults,
    scenario,
    budget,
    monthlyBudgetGrowth,
    channels,
    monthlyBudgetOverrides,
    monthlyChurnOverrides,
    cashFlowSettings,
  ]);
  const modeledChannels = channels.map((c) => {
    const spend = c.goLiveMonth === 0 ? 0 : budget * c.allocation;
    const visitors =
      c.goLiveMonth === 0
        ? 0
        : c.model === "cpc"
          ? c.cpc
            ? spend / c.cpc
            : 0
          : c.model === "cpm"
            ? c.cpm
              ? (spend / c.cpm) * 1000 * c.ctr
              : 0
            : c.visitors;
    return { ...c, visitors };
  });
  const channelVisitors = modeledChannels.reduce(
    (sum, c) => sum + c.visitors,
    0,
  );
  const allocation = channels.reduce(
    (sum, c) => sum + (c.goLiveMonth === 0 ? 0 : c.allocation),
    0,
  );
  const forecastMonths = Array.from({ length: a.months }, (_, i) =>
    addIsoMonths(forecastStartMonth, i),
  );
  const scheduledBudget = (index: number) =>
    budget * (1 + monthlyBudgetGrowth) ** index;
  const effectiveSpend = (month: string, index: number, c: EditableChannel) =>
    c.goLiveMonth === 0 || index + 1 < c.goLiveMonth
      ? 0
      : (monthlyBudgetOverrides[month]?.[c.name] ??
        scheduledBudget(index) * c.allocation);
  const monthlyVisitorAdjustments = Object.fromEntries(
    channels
      .filter((c) => c.model !== "manual")
      .map((c) => {
        let priorVisitors = 0;
        return [
          c.name,
          forecastMonths.map((month, index) => {
            const spend = effectiveSpend(month, index, c);
            const desiredVisitors =
              c.model === "cpc"
                ? c.cpc
                  ? spend / c.cpc
                  : 0
                : c.cpm
                  ? (spend / c.cpm) * 1000 * c.ctr
                  : 0;
            const adjustment =
              desiredVisitors - priorVisitors * (1 + a.monthlyTrafficGrowth);
            priorVisitors = desiredVisitors;
            return adjustment;
          }),
        ];
      }),
  );
  const monthlyChannelVisitors = Object.fromEntries(
    forecastMonths.map((month, index) => [
      month,
      Object.fromEntries(
        Object.entries(monthlyVisitorAdjustments).map(([name, values]) => [
          name,
          values[index],
        ]),
      ),
    ]),
  );
  const projection = forecast(
    {
      month: previousMonth(forecastStartMonth),
      visitors: baseline.visitors,
      customers: baseline.customers,
      mrr: baseline.mrr,
    },
    a,
    modeledChannels,
    {
      channelVisitors: monthlyChannelVisitors,
      revenueChurn: monthlyChurnOverrides,
    },
  );
  const channelBreakdown = calculateChannelBreakdown(
    {
      month: previousMonth(forecastStartMonth),
      visitors: baseline.visitors,
      customers: baseline.customers,
      mrr: baseline.mrr,
    },
    a,
    modeledChannels,
    {
      channelVisitors: monthlyChannelVisitors,
      revenueChurn: monthlyChurnOverrides,
    },
  );
  const breakdownByMonth = new Map(
    channelBreakdown.map((month) => [month.month, month]),
  );
  const end = projection.at(-1)!;
  const businessModel = a.businessModel || "b2c";
  const activeFields = businessModel === "b2b" ? b2bFields : fields;
  const primaryFieldCount = businessModel === "b2b" ? 7 : 4;
  const updateB2bBaseline = (
    key: "visitors" | "mqls" | "sqls" | "newCustomers",
    rawValue: number,
  ) => {
    const entered = { ...baseline, [key]: clamp(rawValue) };
    const next = {
      ...entered,
      mqls: Math.min(entered.mqls, entered.visitors),
      sqls: Math.min(entered.sqls, entered.mqls, entered.visitors),
      newCustomers: Math.min(
        entered.newCustomers,
        entered.sqls,
        entered.mqls,
        entered.visitors,
      ),
    };
    setBaseline(next);
    setScenario("Custom");
    setA((current) => ({
      ...current,
      mqlRate: next.visitors
        ? clamp(next.mqls / next.visitors, 0, 1)
        : current.mqlRate,
      sqlRate: next.mqls
        ? clamp(next.sqls / next.mqls, 0, 1)
        : current.sqlRate,
      closeRate: next.sqls
        ? clamp(next.newCustomers / next.sqls, 0, 1)
        : current.closeRate,
    }));
  };
  const paidLaunch = modeledChannels
    .filter(
      (c) =>
        c.model !== "manual" &&
        c.goLiveMonth > 0 &&
        c.goLiveMonth <= projection.length,
    )
    .reduce(
      (t, c) => {
        const index = c.goLiveMonth - 1,
          spend = effectiveSpend(projection[index].month, index, c);
        const visitors =
          c.model === "cpc"
            ? c.cpc
              ? spend / c.cpc
              : 0
            : c.cpm
              ? (spend / c.cpm) * 1000 * c.ctr
              : 0;
        const customers =
          businessModel === "b2b"
            ? visitors * c.mqlRate * c.sqlRate * c.closeRate
            : visitors * c.signupRate * c.purchaseRate;
        return { spend: t.spend + spend, customers: t.customers + customers };
      },
      { spend: 0, customers: 0 },
    );
  const partner = modeledChannels.find(
    (c) => c.name === "Partners" && c.goLiveMonth > 0,
  );
  const partnerCustomers = partner
    ? businessModel === "b2b"
      ? partner.visitors * partner.mqlRate * partner.sqlRate * partner.closeRate
      : partner.visitors * partner.signupRate * partner.purchaseRate
    : 0;
  const monthlyRevenueRetention = Math.max(
    0,
    1 - a.voluntaryRevenueChurn - a.delinquentRevenueChurn,
  );
  const commissionFactor = partner
    ? Array.from(
        {
          length: Math.max(
            0,
            Math.round(partner.affiliateCommissionMonths || 0),
          ),
        },
        (_, i) => monthlyRevenueRetention ** i,
      ).reduce((sum, v) => sum + v, 0)
    : 0;
  const partnerCommissionCost =
    partnerCustomers *
    (businessModel === "b2b" ? (partner?.acv || 0) / 12 : partner?.arpu || 0) *
    (partner?.affiliateCommissionRate || 0) *
    commissionFactor;
  const acquiredCustomers = paidLaunch.customers + partnerCustomers;
  const blendedCac = calculateBlendedCac(
    paidLaunch.spend,
    a.monthlySalesMarketingOverhead,
    partnerCommissionCost,
    acquiredCustomers,
  );
  const predictedLtv = end.ltv === null ? null : end.ltv * a.grossMargin;
  const payback =
    end.acquisitionArpu && a.grossMargin
      ? blendedCac / (end.acquisitionArpu * a.grossMargin)
      : 0;
  const expectedLtvCac =
    blendedCac && predictedLtv !== null ? predictedLtv / blendedCac : null;
  const endingRevenueChurn =
    monthlyChurnOverrides[end.month] ??
    a.voluntaryRevenueChurn + a.delinquentRevenueChurn;
  const netRevenueRetention = calculateNrr(
    a.expansionRate,
    a.retractionRate,
    endingRevenueChurn,
  );
  const monthlyPaidSpend = projection.map((row, index) =>
    channels
      .filter((c) => c.model !== "manual")
      .reduce((sum, c) => sum + effectiveSpend(row.month, index, c), 0),
  );
  const magicNumber = calculateMagicNumber(
    projection,
    monthlyPaidSpend,
    a.monthlySalesMarketingOverhead,
  );
  const trend = projection.map((m) => ({
    month: m.month,
    mrr: m.endingMrr,
    arr: m.arr,
    customers: m.customers,
    type: "Forecast",
  }));
  const pipeline = projection.map((m) => ({
    month: m.month,
    mqls: m.mqls,
    sqls: m.sqls,
    closedWon: m.newCustomers,
  }));
  const bridge = projection.map((m) => ({
    month: m.month,
    New: m.newMrr,
    Expansion: m.expansionMrr,
    Downgrade: -m.retractionMrr,
    Churn: -m.churnMrr,
  }));
  const download = (name: string, body: BlobPart, type: string) => {
    const u = URL.createObjectURL(new Blob([body], { type }));
    const x = document.createElement("a");
    x.href = u;
    x.download = name;
    x.click();
    setTimeout(() => URL.revokeObjectURL(u), 0);
  };
  const slug = () =>
    (modelName || "growthcast")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const exportCsv = async () => {
    const commonKeys: (keyof ForecastMonth)[] = [
      "month",
      "visitors",
      ...(businessModel === "b2b"
        ? (["mqls", "sqls"] as (keyof ForecastMonth)[])
        : (["signups"] as (keyof ForecastMonth)[])),
      "newCustomers",
      "churnedCustomers",
      "customers",
      "newMrr",
      "expansionMrr",
      "retractionMrr",
      "churnMrr",
      "endingMrr",
      "arr",
      "arpu",
      "acquisitionArpu",
      "ltv",
      "maxCac",
      businessModel === "b2b" ? "maxCostPerMql" : "maxCostPerSignup",
      "churnedCustomerArpu",
      "churnedArpuRatio",
    ];
    const keys = commonKeys;
    const paid = channels.filter(
      (c) => c.model !== "manual" && c.goLiveMonth > 0,
    );
    const revenueChurn = a.voluntaryRevenueChurn + a.delinquentRevenueChurn,
      customerChurn = a.voluntaryCustomerChurn + a.delinquentCustomerChurn;
    const cashRows = projection.map((row) =>
      cashFlowFor(row, cashFlowSettings),
    );
    const files: Record<string, string> = {};
    files["forecast.csv"] = csvFile(
      [
        ...keys,
        "monthlyBudget",
        "revenueChurnRate",
        "monthlySubscriptions",
        "yearlySubscriptions",
        "oneTimePayments",
        "fees",
        "refunds",
        "netCash",
      ],
      projection.map((row, index) => [
        ...keys.map((key) => row[key]),
        monthlyPaidSpend[index],
        monthlyChurnOverrides[row.month] ?? revenueChurn,
        ...Object.values(cashRows[index]),
      ]),
    );
    files["budget-breakdown.csv"] = csvFile(
      ["month", ...paid.map((c) => c.name), "total"],
      projection.map((row, index) => {
        const spends = paid.map((c) => effectiveSpend(row.month, index, c));
        return [
          row.month,
          ...spends,
          spends.reduce((sum, value) => sum + value, 0),
        ];
      }),
    );
    files["churn-overview.csv"] = csvFile(
      [
        "month",
        "voluntaryMrr",
        "delinquentMrr",
        "overrideMrr",
        "revenueChurnRate",
        "voluntaryCustomers",
        "delinquentCustomers",
        "customerChurnRate",
        "churnedCustomerArpu",
        "churnedArpuRatio",
      ],
      projection.map((row) => [
        row.month,
        revenueChurn
          ? (-row.churnMrr * a.voluntaryRevenueChurn) / revenueChurn
          : 0,
        revenueChurn
          ? (-row.churnMrr * a.delinquentRevenueChurn) / revenueChurn
          : 0,
        revenueChurn ? 0 : -row.churnMrr,
        (monthlyChurnOverrides[row.month] ?? revenueChurn) * 100,
        customerChurn
          ? (row.churnedCustomers * a.voluntaryCustomerChurn) / customerChurn
          : 0,
        customerChurn
          ? (row.churnedCustomers * a.delinquentCustomerChurn) / customerChurn
          : 0,
        customerChurn * 100,
        row.churnedCustomerArpu,
        row.churnedArpuRatio,
      ]),
    );
    files["mrr-overview.csv"] = csvFile(
      [
        "month",
        "newMrr",
        "expansion",
        "downgrade",
        "churn",
        "endingMrr",
        "arr",
      ],
      projection.map((row) => [
        row.month,
        row.newMrr,
        row.expansionMrr,
        -row.retractionMrr,
        -row.churnMrr,
        row.endingMrr,
        row.arr,
      ]),
    );
    let priorMrr = baseline.mrr;
    files["growth-rate.csv"] = csvFile(
      [
        "month",
        "newMrr",
        "expansion",
        "downgrade",
        "churn",
        "netNewMrr",
        "growthRate",
        "endingMrr",
      ],
      projection.map((row) => {
        const netNewMrr = row.endingMrr - priorMrr,
          growthRate = priorMrr ? (netNewMrr / priorMrr) * 100 : 0;
        priorMrr = row.endingMrr;
        return [
          row.month,
          row.newMrr,
          row.expansionMrr,
          -row.retractionMrr,
          -row.churnMrr,
          netNewMrr,
          growthRate,
          row.endingMrr,
        ];
      }),
    );
    files["customers-overview.csv"] = csvFile(
      [
        "month",
        "newCustomers",
        "voluntaryChurn",
        "delinquentChurn",
        "totalCustomers",
      ],
      projection.map((row) => [
        row.month,
        row.newCustomers,
        customerChurn
          ? (-row.churnedCustomers * a.voluntaryCustomerChurn) / customerChurn
          : 0,
        customerChurn
          ? (-row.churnedCustomers * a.delinquentCustomerChurn) / customerChurn
          : 0,
        row.customers,
      ]),
    );
    files["cash-flow.csv"] = csvFile(
      [
        "month",
        "monthlySubscriptions",
        "yearlySubscriptions",
        "oneTimePayments",
        "fees",
        "refunds",
        "netCash",
      ],
      projection.map((row, index) => [
        row.month,
        ...Object.values(cashRows[index]),
      ]),
    );
    const zip = new JSZip();
    Object.entries(files).forEach(([name, body]) => zip.file(name, body));
    download(
      `${slug()}-forecast-csv.zip`,
      await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
      "application/zip",
    );
  };
  const exportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const left = 42;
    let y = 48;
    const line = (label: string, value: string, x: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(110);
      doc.text(label.toUpperCase(), x, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.setTextColor(35);
      doc.text(value, x, y + 21);
    };
    doc.setFillColor(244, 241, 233);
    doc.rect(0, 0, 612, 792, "F");
    doc.setTextColor(35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(25);
    doc.text(`${modelName || "GrowthCast"} — Growth Forecast`, left, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      `Forecast from ${forecastStartMonth} · ${a.months} months · Generated ${new Date().toLocaleDateString()}`,
      left,
      y + 18,
    );
    y = 95;
    line("Ending MRR", money(end.endingMrr), left);
    line("Ending ARR", money(end.arr), 180);
    line("Customers", whole(end.customers), 318);
    line(
      "Expected LTV:CAC",
      expectedLtvCac === null ? "—" : `${number(expectedLtvCac)}:1`,
      456,
    );
    y = 150;
    line("Payback", `${number(payback)} months`, left);
    line("Predicted LTV", money(predictedLtv), 180);
    line("Blended CAC", money(blendedCac), 318);
    line("Max CAC", money(end.maxCac), 456);
    y = 205;
    line("Net revenue retention", pct(netRevenueRetention), left);
    line(
      "SaaS Magic Number",
      magicNumber === null ? "—" : number(magicNumber),
      240,
    );
    line("Churned customer ARPU", money(end.churnedCustomerArpu), 420);
    y = 255;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(35);
    doc.text("Core assumptions", left, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const acquisitionAssumptions =
      businessModel === "b2b"
        ? [
            `Visitor → MQL ${pct(a.mqlRate ?? 0)}`,
            `MQL → SQL ${pct(a.sqlRate ?? 0)}`,
            `SQL → closed won ${pct(a.closeRate ?? 0)}`,
            `Deal cycle ${number(a.dealCycleDays ?? 0)} days`,
            `ACV ${money(a.acv ?? 0)}`,
          ]
        : [
            `Visitor → signup ${pct(a.signupRate)}`,
            `Signup → purchase ${pct(a.purchaseRate)}`,
            `Days to upgrade ${number(a.daysToUpgrade)}`,
          ];
    const assumptions = [
      `Business model ${businessModel.toUpperCase()}`,
      `Traffic growth ${pct(a.monthlyTrafficGrowth)}`,
      ...acquisitionAssumptions,
      `Revenue churn ${pct(a.voluntaryRevenueChurn + a.delinquentRevenueChurn)}`,
      `Logo churn ${pct(a.voluntaryCustomerChurn + a.delinquentCustomerChurn)}`,
      `Gross margin ${pct(a.grossMargin)}`,
      `Budget growth ${pct(monthlyBudgetGrowth)}`,
      `S&M overhead ${money(a.monthlySalesMarketingOverhead)} / month`,
      `Cash fees ${pct(cashFlowSettings.feeRate)}`,
      `Cash refunds ${pct(cashFlowSettings.refundRate)}`,
      `Plan split ${pct(cashFlowSettings.monthlyShare)} monthly / ${pct(cashFlowSettings.annualShare)} annual${cashFlowSettings.oneTimeEnabled ? ` / ${pct(cashFlowSettings.oneTimeShare)} one-time` : ""}`,
    ];
    doc.text(assumptions.join("     "), left, y, { maxWidth: 525 });
    y += 35;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Monthly forecast", left, y);
    y += 15;
    const cols: [string, number][] =
      businessModel === "b2b"
        ? [
            ["Month", 42],
            ["Visitors", 105],
            ["MQLs", 165],
            ["SQLs", 220],
            ["Closed", 270],
            ["Customers", 325],
            ["MRR", 400],
            ["ARR", 480],
          ]
        : [
            ["Month", 42],
            ["Visitors", 105],
            ["Signups", 165],
            ["New cust.", 220],
            ["Customers", 282],
            ["MRR", 350],
            ["ARR", 425],
            ["ARPU", 505],
          ];
    doc.setFillColor(39, 40, 42);
    doc.rect(left, y - 10, 525, 20, "F");
    doc.setTextColor(255);
    doc.setFontSize(7);
    for (const [label, x] of cols) doc.text(label, x, y + 2);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35);
    for (const row of projection) {
      if (y > 742) {
        doc.addPage();
        doc.setFillColor(244, 241, 233);
        doc.rect(0, 0, 612, 792, "F");
        y = 48;
      }
      const vals =
        businessModel === "b2b"
          ? [
              row.month,
              whole(row.visitors),
              whole(row.mqls),
              whole(row.sqls),
              whole(row.newCustomers),
              whole(row.customers),
              money(row.endingMrr),
              money(row.arr),
            ]
          : [
              row.month,
              whole(row.visitors),
              whole(row.signups),
              whole(row.newCustomers),
              whole(row.customers),
              money(row.endingMrr),
              money(row.arr),
              money(row.arpu),
            ];
      vals.forEach((value, i) => doc.text(value, cols[i][1], y));
      doc.setDrawColor(215);
      doc.line(left, y + 5, 567, y + 5);
      y += 18;
    }
    type PdfSeries = {
      label: string;
      color: [number, number, number];
      values: number[];
      kind: "line" | "bar";
      axis?: "left" | "right";
    };
    const chartPage = (
      title: string,
      subtitle: string,
      labels: string[],
      series: PdfSeries[],
    ) => {
      doc.addPage();
      doc.setFillColor(244, 241, 233);
      doc.rect(0, 0, 612, 792, "F");
      doc.setTextColor(35);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(title, left, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(subtitle, left, 69);
      const x0 = 58,
        y0 = 120,
        w = 500,
        h = 420;
      const axisValues = (axis: "left" | "right") =>
        series
          .filter((s) => (s.axis || "left") === axis)
          .flatMap((s) => s.values);
      const domain = (values: number[]) => {
        const min = Math.min(0, ...values),
          max = Math.max(0, ...values);
        return { min, max: max === min ? min + 1 : max };
      };
      const leftDomain = domain(axisValues("left")),
        rightDomain = domain(axisValues("right"));
      const sy = (v: number, d: { min: number; max: number }) =>
        y0 + h - ((v - d.min) / (d.max - d.min)) * h;
      doc.setDrawColor(180);
      doc.line(x0, y0, x0, y0 + h);
      doc.line(x0, y0 + h, x0 + w, y0 + h);
      doc.setFontSize(6);
      doc.setTextColor(110);
      labels.forEach((label, i) => {
        const x = x0 + ((i + 0.5) * w) / labels.length;
        doc.text(label.slice(5), x - 6, y0 + h + 13);
      });
      series.forEach((s, si) => {
        const d = (s.axis || "left") === "right" ? rightDomain : leftDomain;
        doc.setDrawColor(...s.color);
        doc.setFillColor(...s.color);
        if (s.kind === "line") {
          s.values.forEach((v, i) => {
            const x = x0 + ((i + 0.5) * w) / labels.length,
              yv = sy(v, d);
            if (i) {
              const px = x0 + ((i - 0.5) * w) / labels.length,
                py = sy(s.values[i - 1], d);
              doc.line(px, py, x, yv);
            }
            doc.circle(x, yv, 2, "F");
          });
        } else {
          s.values.forEach((v, i) => {
            const slot = w / labels.length,
              bw = Math.max(
                3,
                slot / (series.filter((x) => x.kind === "bar").length + 2),
              );
            const x = x0 + i * slot + slot * 0.2 + si * bw,
              yz = sy(0, d),
              yv = sy(v, d);
            doc.rect(
              x,
              Math.min(yz, yv),
              bw * 0.8,
              Math.max(1, Math.abs(yz - yv)),
              "F",
            );
          });
        }
      });
      let ly = 580;
      doc.setFontSize(7);
      series.forEach((s) => {
        doc.setFillColor(...s.color);
        doc.rect(left, ly - 6, 8, 4, "F");
        doc.setTextColor(60);
        doc.text(
          `${s.label}${s.axis === "right" ? " (right axis)" : ""}`,
          left + 12,
          ly,
        );
        ly += 13;
      });
    };
    const deepPage = (
      title: string,
      subtitle: string,
      headers: string[],
      rows: string[][],
    ) => {
      doc.addPage();
      doc.setFillColor(244, 241, 233);
      doc.rect(0, 0, 612, 792, "F");
      doc.setTextColor(35);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(title, left, 52);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(subtitle, left, 69);
      const width = 525 / headers.length;
      let py = 100;
      doc.setFillColor(39, 40, 42);
      doc.rect(left, py - 13, 525, 22, "F");
      doc.setTextColor(255);
      doc.setFontSize(Math.max(5, Math.min(7, 48 / headers.length)));
      headers.forEach((h, i) => doc.text(h, left + i * width + 3, py));
      py += 20;
      doc.setTextColor(35);
      doc.setFontSize(Math.max(5, Math.min(7, 52 / headers.length)));
      rows.forEach((row) => {
        row.forEach((v, i) =>
          doc.text(String(v), left + i * width + 3, py, {
            maxWidth: width - 5,
          }),
        );
        doc.setDrawColor(215);
        doc.line(left, py + 5, 567, py + 5);
        py += 22;
      });
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(110);
      doc.text(
        "Values include saved month-specific model overrides.",
        left,
        770,
      );
    };
    const paidPdf = channels.filter(
      (c) => c.model !== "manual" && c.goLiveMonth > 0,
    );
    const pdfLabels = projection.map((p) => p.month);
    const budgetChartSeries: PdfSeries[] = paidPdf.map((c, i) => ({
      label: c.name,
      color: [
        [255, 107, 74],
        [123, 97, 255],
        [42, 185, 159],
        [241, 184, 75],
        [93, 168, 197],
        [239, 127, 166],
      ][i % 6] as [number, number, number],
      kind: "line",
      values: projection.map(
        (p, monthIndex) =>
          monthlyBudgetOverrides[p.month]?.[c.name] ??
          (monthIndex + 1 >= c.goLiveMonth
            ? budget * (1 + monthlyBudgetGrowth) ** monthIndex * c.allocation
            : 0),
      ),
    }));
    const revChartTotal = a.voluntaryRevenueChurn + a.delinquentRevenueChurn;
    const logoChartTotal = a.voluntaryCustomerChurn + a.delinquentCustomerChurn;
    let chartPrior = baseline.mrr;
    const growthChart = projection.map((p) => {
      const rate = chartPrior
        ? ((p.endingMrr - chartPrior) / chartPrior) * 100
        : 0;
      chartPrior = p.endingMrr;
      return rate;
    });
    chartPage(
      "MRR and ARR trajectory",
      "Realized recurring revenue",
      pdfLabels,
      [
        {
          label: "Ending MRR",
          color: [255, 107, 74],
          kind: "line",
          values: projection.map((p) => p.endingMrr),
        },
        {
          label: "Ending ARR",
          color: [123, 97, 255],
          kind: "line",
          axis: "right",
          values: projection.map((p) => p.arr),
        },
      ],
    );
    if (businessModel === "b2b")
      chartPage(
        "Pipeline over time",
        "Monthly MQL, SQL, and closed-won volume",
        pdfLabels,
        [
          {
            label: "MQLs",
            color: [123, 97, 255],
            kind: "line",
            values: projection.map((p) => p.mqls),
          },
          {
            label: "SQLs",
            color: [42, 185, 159],
            kind: "line",
            values: projection.map((p) => p.sqls),
          },
          {
            label: "Closed won",
            color: [255, 107, 74],
            kind: "line",
            axis: "right",
            values: projection.map((p) => p.newCustomers),
          },
        ],
      );
    chartPage(
      "Revenue bridge",
      "Positive and negative monthly MRR movement",
      pdfLabels,
      [
        {
          label: "New",
          color: [255, 107, 74],
          kind: "bar",
          values: projection.map((p) => p.newMrr),
        },
        {
          label: "Expansion",
          color: [123, 97, 255],
          kind: "bar",
          values: projection.map((p) => p.expansionMrr),
        },
        {
          label: "Downgrade",
          color: [241, 184, 75],
          kind: "bar",
          values: projection.map((p) => -p.retractionMrr),
        },
        {
          label: "Churn",
          color: [39, 40, 42],
          kind: "bar",
          values: projection.map((p) => -p.churnMrr),
        },
      ],
    );
    chartPage(
      businessModel === "b2b" ? "Account growth" : "Customer growth",
      businessModel === "b2b"
        ? "Active accounts and closed-won customers"
        : "Customers, signups, and new customers",
      pdfLabels,
      businessModel === "b2b"
        ? [
            {
              label: "Customers",
              color: [39, 40, 42],
              kind: "line",
              values: projection.map((p) => p.customers),
            },
            {
              label: "Closed won",
              color: [255, 107, 74],
              kind: "line",
              axis: "right",
              values: projection.map((p) => p.newCustomers),
            },
          ]
        : [
            {
              label: "Customers",
              color: [39, 40, 42],
              kind: "line",
              values: projection.map((p) => p.customers),
            },
            {
              label: "Signups",
              color: [123, 97, 255],
              kind: "line",
              values: projection.map((p) => p.signups),
            },
            {
              label: "New customers",
              color: [255, 107, 74],
              kind: "line",
              axis: "right",
              values: projection.map((p) => p.newCustomers),
            },
          ],
    );
    chartPage(
      "Deep Dive — Budget breakdown",
      "Monthly paid spend by subchannel",
      pdfLabels,
      budgetChartSeries,
    );
    chartPage(
      "Deep Dive — Churn overview",
      "Revenue losses and churn rate",
      pdfLabels,
      [
        {
          label: "Voluntary MRR",
          color: [237, 119, 121],
          kind: "bar",
          values: projection.map((p) =>
            revChartTotal
              ? (-p.churnMrr * a.voluntaryRevenueChurn) / revChartTotal
              : 0,
          ),
        },
        {
          label: "Delinquent MRR",
          color: [243, 170, 130],
          kind: "bar",
          values: projection.map((p) =>
            revChartTotal
              ? (-p.churnMrr * a.delinquentRevenueChurn) / revChartTotal
              : 0,
          ),
        },
        {
          label: "Override MRR",
          color: [182, 107, 131],
          kind: "bar",
          values: projection.map((p) => (revChartTotal ? 0 : -p.churnMrr)),
        },
        {
          label: "Revenue churn %",
          color: [39, 40, 42],
          kind: "line",
          axis: "right",
          values: projection.map(
            (p) => (monthlyChurnOverrides[p.month] ?? revChartTotal) * 100,
          ),
        },
      ],
    );
    chartPage(
      "Deep Dive — MRR overview",
      "MRR movement and ending balance",
      pdfLabels,
      [
        {
          label: "New",
          color: [98, 199, 176],
          kind: "bar",
          values: projection.map((p) => p.newMrr),
        },
        {
          label: "Expansion",
          color: [138, 216, 204],
          kind: "bar",
          values: projection.map((p) => p.expansionMrr),
        },
        {
          label: "Downgrade",
          color: [242, 173, 137],
          kind: "bar",
          values: projection.map((p) => -p.retractionMrr),
        },
        {
          label: "Churn",
          color: [232, 121, 122],
          kind: "bar",
          values: projection.map((p) => -p.churnMrr),
        },
        {
          label: "Ending MRR",
          color: [39, 40, 42],
          kind: "line",
          axis: "right",
          values: projection.map((p) => p.endingMrr),
        },
      ],
    );
    chartPage(
      "Deep Dive — Growth rate",
      "MRR movement and monthly growth",
      pdfLabels,
      [
        {
          label: "New MRR",
          color: [98, 199, 176],
          kind: "bar",
          values: projection.map((p) => p.newMrr),
        },
        {
          label: "Expansion",
          color: [155, 220, 207],
          kind: "bar",
          values: projection.map((p) => p.expansionMrr),
        },
        {
          label: "Downgrade",
          color: [240, 178, 148],
          kind: "bar",
          values: projection.map((p) => -p.retractionMrr),
        },
        {
          label: "Churn",
          color: [233, 135, 135],
          kind: "bar",
          values: projection.map((p) => -p.churnMrr),
        },
        {
          label: "Growth %",
          color: [39, 40, 42],
          kind: "line",
          axis: "right",
          values: growthChart,
        },
      ],
    );
    chartPage(
      "Deep Dive — Customers overview",
      "Customer additions, losses, and ending balance",
      pdfLabels,
      [
        {
          label: "New customers",
          color: [101, 203, 181],
          kind: "bar",
          axis: "right",
          values: projection.map((p) => p.newCustomers),
        },
        {
          label: "Voluntary churn",
          color: [231, 124, 124],
          kind: "bar",
          axis: "right",
          values: projection.map((p) =>
            logoChartTotal
              ? (-p.churnedCustomers * a.voluntaryCustomerChurn) /
                logoChartTotal
              : 0,
          ),
        },
        {
          label: "Delinquent churn",
          color: [242, 165, 132],
          kind: "bar",
          axis: "right",
          values: projection.map((p) =>
            logoChartTotal
              ? (-p.churnedCustomers * a.delinquentCustomerChurn) /
                logoChartTotal
              : 0,
          ),
        },
        {
          label: "Customers",
          color: [39, 40, 42],
          kind: "line",
          values: projection.map((p) => p.customers),
        },
      ],
    );
    chartPage(
      "Deep Dive — Cash flow",
      "Subscription collections, fees, refunds, and net cash",
      pdfLabels,
      [
        {
          label: "Monthly subscriptions",
          color: [42, 185, 159],
          kind: "bar",
          values: projection.map(
            (p) => cashFlowFor(p, cashFlowSettings).monthlySubscriptions,
          ),
        },
        {
          label: "Yearly subscriptions",
          color: [123, 215, 195],
          kind: "bar",
          values: projection.map(
            (p) => cashFlowFor(p, cashFlowSettings).yearlySubscriptions,
          ),
        },
        {
          label: "One-time payments",
          color: [37, 127, 112],
          kind: "bar",
          values: projection.map(
            (p) => cashFlowFor(p, cashFlowSettings).oneTimePayments,
          ),
        },
        {
          label: "Fees",
          color: [241, 184, 75],
          kind: "bar",
          values: projection.map((p) => cashFlowFor(p, cashFlowSettings).fees),
        },
        {
          label: "Refunds",
          color: [232, 121, 122],
          kind: "bar",
          values: projection.map(
            (p) => cashFlowFor(p, cashFlowSettings).refunds,
          ),
        },
        {
          label: "Net cash",
          color: [39, 40, 42],
          kind: "line",
          values: projection.map(
            (p) => cashFlowFor(p, cashFlowSettings).netCash,
          ),
        },
      ],
    );
    deepPage(
      "Deep Dive — Budget breakdown",
      "Monthly paid spend by subchannel",
      ["Month", ...paidPdf.map((c) => c.name), "Total"],
      projection.map((p, i) => {
        const values = paidPdf.map(
          (c) =>
            monthlyBudgetOverrides[p.month]?.[c.name] ??
            (i + 1 >= c.goLiveMonth
              ? budget * (1 + monthlyBudgetGrowth) ** i * c.allocation
              : 0),
        );
        return [
          p.month,
          ...values.map(money),
          money(values.reduce((s, v) => s + v, 0)),
        ];
      }),
    );
    const revTotalPdf = a.voluntaryRevenueChurn + a.delinquentRevenueChurn;
    deepPage(
      "Deep Dive — Churn overview",
      "Negative values represent MRR lost",
      [
        "Month",
        "Voluntary",
        "Delinquent",
        "Override",
        "Revenue churn",
        "Churned ARPU",
        "vs opening",
      ],
      projection.map((p) => [
        p.month,
        money(
          revTotalPdf
            ? (-p.churnMrr * a.voluntaryRevenueChurn) / revTotalPdf
            : 0,
        ),
        money(
          revTotalPdf
            ? (-p.churnMrr * a.delinquentRevenueChurn) / revTotalPdf
            : 0,
        ),
        money(revTotalPdf ? 0 : -p.churnMrr),
        pct(monthlyChurnOverrides[p.month] ?? revTotalPdf),
        money(p.churnedCustomerArpu),
        p.churnedArpuRatio === null ? "—" : pct(p.churnedArpuRatio),
      ]),
    );
    deepPage(
      "Deep Dive — MRR overview",
      "Monthly recurring revenue bridge",
      ["Month", "New", "Expansion", "Downgrade", "Churn", "MRR", "ARR"],
      projection.map((p) => [
        p.month,
        money(p.newMrr),
        money(p.expansionMrr),
        money(-p.retractionMrr),
        money(-p.churnMrr),
        money(p.endingMrr),
        money(p.arr),
      ]),
    );
    let pdfPrior = baseline.mrr;
    deepPage(
      "Deep Dive — Growth rate",
      "Net-new MRR and month-over-month growth",
      ["Month", "New", "Expansion", "Downgrade", "Churn", "Net new", "Growth"],
      projection.map((p) => {
        const net = p.endingMrr - pdfPrior;
        const rate = pdfPrior ? net / pdfPrior : 0;
        pdfPrior = p.endingMrr;
        return [
          p.month,
          money(p.newMrr),
          money(p.expansionMrr),
          money(-p.retractionMrr),
          money(-p.churnMrr),
          money(net),
          pct(rate),
        ];
      }),
    );
    const logoTotalPdf = a.voluntaryCustomerChurn + a.delinquentCustomerChurn;
    deepPage(
      "Deep Dive — Customers overview",
      "Customer additions and losses",
      ["Month", "New", "Voluntary churn", "Delinquent churn", "Customers"],
      projection.map((p) => [
        p.month,
        whole(p.newCustomers),
        whole(
          logoTotalPdf
            ? (-p.churnedCustomers * a.voluntaryCustomerChurn) / logoTotalPdf
            : 0,
        ),
        whole(
          logoTotalPdf
            ? (-p.churnedCustomers * a.delinquentCustomerChurn) / logoTotalPdf
            : 0,
        ),
        whole(p.customers),
      ]),
    );
    deepPage(
      "Deep Dive — Cash flow",
      "Subscription collections, fees, refunds, and net cash",
      [
        "Month",
        "Monthly subs",
        "Yearly subs",
        "One-time",
        "Fees",
        "Refunds",
        "Net cash",
      ],
      projection.map((p) => {
        const cash = cashFlowFor(p, cashFlowSettings);
        return [
          p.month,
          money(cash.monthlySubscriptions),
          money(cash.yearlySubscriptions),
          money(cash.oneTimePayments),
          money(cash.fees),
          money(cash.refunds),
          money(cash.netCash),
        ];
      }),
    );
    doc.save(`${slug()}-forecast.pdf`);
  };
  const exportForecast = async () => {
    if (forecastFormat === "pdf") exportPdf();
    else await exportCsv();
    if (isPostHogEnabled) {
      posthog.capture("forecast_exported", { format: forecastFormat });
    }
  };
  const exportBaseline = () => {
    download(
      `${slug()}-baseline.csv`,
      assumptionCsv({
        businessModel,
        ...baseline,
        budget,
        monthlyBudgetGrowth,
      }),
      "text/csv",
    );
    if (isPostHogEnabled) {
      posthog.capture("baseline_exported", { business_model: businessModel });
    }
  };
  const importBaseline = async (file?: File) => {
    if (!file) return;
    try {
      const value = parseAssumptionCsv(
        (await readImportFile(file)).replace(/^\uFEFF/, ""),
      ) as Record<string, unknown>;
      const importedBusinessModel =
        value.businessModel === "b2b" ? "b2b" : "b2c";
      const customers = Number(value.customers);
      const importedArr = Number(value.arr);
      const mrr = Number.isFinite(Number(value.mrr))
        ? Number(value.mrr)
        : importedArr / 12;
      const next: Baseline = {
        month: String(value.month || ""),
        visitors: Number(value.visitors),
        signups: Number(value.signups ?? 0),
        mqls: Number(value.mqls ?? 0),
        sqls: Number(value.sqls ?? 0),
        newCustomers: Number(value.newCustomers),
        customers,
        mrr,
        arpu: customers ? mrr / customers : 0,
        arr: mrr * 12,
      };
      if (
        !isIsoMonth(next.month) ||
        Object.entries(next).some(
          ([key, v]) =>
            key !== "month" && (!Number.isFinite(v) || Number(v) < 0),
        )
      )
        throw new Error("Invalid baseline CSV");
      if (
        importedBusinessModel === "b2b" &&
        (next.mqls > next.visitors ||
          next.sqls > next.mqls ||
          next.newCustomers > next.sqls)
      )
        throw new Error("B2B pipeline stages must decrease through the funnel");
      const importedBudget = value.budget === undefined ? 0 : Number(value.budget);
      const importedBudgetGrowth =
        value.monthlyBudgetGrowth === undefined
          ? 0
          : Number(value.monthlyBudgetGrowth);
      if (
        !finiteNonnegative(importedBudget) ||
        !finiteNonnegative(importedBudgetGrowth)
      )
        throw new Error("Baseline CSV contains an invalid budget");
      setBaseline(next);
      setA((current) => ({
        ...current,
        businessModel: importedBusinessModel,
        ...(importedBusinessModel === "b2b"
          ? {
              mqlRate: next.visitors
                ? clamp(next.mqls / next.visitors, 0, 1)
                : current.mqlRate,
              sqlRate: next.mqls
                ? clamp(next.sqls / next.mqls, 0, 1)
                : current.sqlRate,
              closeRate: next.sqls
                ? clamp(next.newCustomers / next.sqls, 0, 1)
                : current.closeRate,
            }
          : {}),
      }));
      setBudget(importedBudget);
      setMonthlyBudgetGrowth(importedBudgetGrowth);
      setMonthlyBudgetOverrides({});
      setScenario("Imported baseline");
      setImportMessage("");
      setPageView("forecast");
      if (isPostHogEnabled) {
        posthog.capture("baseline_imported", {
          business_model: importedBusinessModel,
        });
      }
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : "Could not load baseline CSV",
      );
    } finally {
      if (baselineInput.current) baselineInput.current.value = "";
    }
  };
  const exportAssumptions = () => {
    const slug = (modelName || "growthcast")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const value = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      modelName,
      baseline,
      forecastStartMonth,
      scenario,
      budget,
      monthlyBudgetGrowth,
      assumptions: a,
      channelDefaults,
      channels,
      monthlyBudgetOverrides,
      monthlyChurnOverrides,
      cashFlowSettings,
    };
    download(
      `${slug}-assumptions.${downloadFormat}`,
      downloadFormat === "json"
        ? JSON.stringify(value, null, 2)
        : assumptionCsv(value),
      downloadFormat === "json" ? "application/json" : "text/csv",
    );
    if (isPostHogEnabled) {
      posthog.capture("assumptions_exported", { format: downloadFormat });
    }
  };
  const importAssumptions = async (file?: File) => {
    if (!file) return;
    try {
      const text = await readImportFile(file);
      const isCsv =
        file.name.toLowerCase().endsWith(".csv") ||
        file.type.includes("csv") ||
        file.type === "application/vnd.ms-excel" ||
        text
          .replace(/^\uFEFF/, "")
          .trimStart()
          .startsWith('"field","value"');
      const raw = (
        isCsv
          ? parseAssumptionCsv(text.replace(/^\uFEFF/, ""))
          : JSON.parse(text.replace(/^\uFEFF/, ""))
      ) as {
        schemaVersion?: number;
        exportedAt?: string;
        modelName?: string;
        baseline?: typeof baseline;
        forecastStartMonth?: string;
        scenario?: string;
        budget?: number;
        monthlyBudgetGrowth?: number;
        assumptions?: Assumptions;
        channelDefaults?: ChannelDefaults;
        channels?: EditableChannel[];
        monthlyBudgetOverrides?: Record<string, Record<string, number>>;
        monthlyChurnOverrides?: Record<string, number>;
        cashFlowSettings?: CashFlowSettings;
      };
      if (![1, 2, 3].includes(raw.schemaVersion || 0))
        throw new Error("Unsupported or incomplete assumption file");
      if (
        !raw.baseline ||
        !raw.forecastStartMonth ||
        !raw.assumptions ||
        !Array.isArray(raw.channels) ||
        typeof raw.budget !== "number"
      )
        throw new Error("Unsupported or incomplete assumption file");
      const isLegacy = raw.schemaVersion === 1 || raw.schemaVersion === 2;
      const requiredV3 = [
        "exportedAt",
        "modelName",
        "baseline",
        "forecastStartMonth",
        "scenario",
        "budget",
        "monthlyBudgetGrowth",
        "assumptions",
        "channelDefaults",
        "channels",
        "monthlyBudgetOverrides",
        "monthlyChurnOverrides",
        "cashFlowSettings",
      ];
      if (
        !isLegacy &&
        requiredV3.some(
          (key) => !Object.prototype.hasOwnProperty.call(raw, key),
        )
      )
        throw new Error("Version 3 assumption file is incomplete");
      if (
        !isLegacy &&
        (typeof raw.exportedAt !== "string" ||
          !Number.isFinite(Date.parse(raw.exportedAt)) ||
          new Date(raw.exportedAt).toISOString() !== raw.exportedAt)
      )
        throw new Error("Version 3 export timestamp is invalid");
      const legacyChannelDefaults: ChannelDefaults = {
        signupRate: raw.channels[0]?.signupRate ?? 0.137,
        purchaseRate: raw.channels[0]?.purchaseRate ?? 0.008,
        arpu: raw.channels[0]?.arpu ?? 38,
        mqlRate: raw.channels[0]?.mqlRate ?? 0.05,
        sqlRate: raw.channels[0]?.sqlRate ?? 0.4,
        closeRate: raw.channels[0]?.closeRate ?? 0.2,
        acv: raw.channels[0]?.acv ?? 12000,
      };
      const canonical = {
        ...raw,
        ...(isLegacy
          ? {
              modelName: raw.modelName ?? "GrowthCast",
              scenario: raw.scenario ?? "Imported",
              monthlyBudgetGrowth: raw.monthlyBudgetGrowth ?? 0,
              channelDefaults: raw.channelDefaults ?? legacyChannelDefaults,
              monthlyBudgetOverrides: raw.monthlyBudgetOverrides ?? {},
              monthlyChurnOverrides: raw.monthlyChurnOverrides ?? {},
              cashFlowSettings: raw.cashFlowSettings ?? defaultCashFlow,
            }
          : {}),
        assumptions: {
          ...raw.assumptions,
          ...(isLegacy ? { businessModel: "b2c" as const } : {}),
        },
      };
      const value = validateSavedModel(canonical) as typeof raw;
      if (
        !value.baseline ||
        !value.forecastStartMonth ||
        typeof value.modelName !== "string" ||
        typeof value.scenario !== "string" ||
        typeof value.monthlyBudgetGrowth !== "number" ||
        !value.assumptions ||
        !value.channelDefaults ||
        !Array.isArray(value.channels) ||
        !value.monthlyBudgetOverrides ||
        !value.monthlyChurnOverrides ||
        !value.cashFlowSettings ||
        typeof value.budget !== "number"
      )
        throw new Error("Unsupported or incomplete assumption file");
      const nums = [
        ...Object.values(value.assumptions).filter(
          (item): item is number => typeof item === "number",
        ),
        ...Object.values(value.channelDefaults || {}),
        ...Object.values(value.cashFlowSettings || {}).filter(
          (v) => typeof v === "number",
        ),
        value.budget,
        ...value.channels.flatMap((c) => [
          c.visitors,
          c.goLiveMonth,
          c.signupRate,
          c.purchaseRate,
          c.arpu,
          c.mqlRate,
          c.sqlRate,
          c.closeRate,
          c.acv,
          c.allocation,
          c.cpc,
          c.cpm,
          c.ctr,
          c.affiliateCommissionRate ?? 0,
          c.affiliateCommissionMonths ?? 0,
        ]),
      ];
      if (
        nums.some(
          (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0,
        ) ||
        value.channels.some((c) => !["manual", "cpc", "cpm"].includes(c.model))
      )
        throw new Error("Assumption file contains invalid values");
      setA(value.assumptions);
      setBaseline(value.baseline);
      setBudget(value.budget);
      setMonthlyBudgetGrowth(
        Number.isFinite(value.monthlyBudgetGrowth)
          ? value.monthlyBudgetGrowth || 0
          : 0,
      );
      setMonthlyBudgetOverrides(value.monthlyBudgetOverrides || {});
      setMonthlyChurnOverrides(value.monthlyChurnOverrides || {});
      setCashFlowSettings({ ...defaultCashFlow, ...value.cashFlowSettings });
      setChannels(normalizeChannels(value.channels));
      setChannelDefaults(value.channelDefaults);
      setForecastStartMonth(
        value.forecastStartMonth &&
          monthOptions.includes(value.forecastStartMonth)
          ? value.forecastStartMonth
          : defaultForecastStartMonth,
      );
      setModelName(
        typeof value.modelName === "string" && value.modelName.trim()
          ? value.modelName.trim()
          : "GrowthCast",
      );
      setScenario(value.scenario || "Imported");
      setImportMessage(`Loaded ${file.name}`);
      if (isPostHogEnabled) {
        posthog.capture("assumptions_imported", {
          format: isCsv ? "csv" : "json",
        });
      }
    } catch (error) {
      setImportMessage(
        error instanceof Error
          ? error.message
          : "Could not load assumption file",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const closeSiteMenus = (except?: HTMLDetailsElement) => {
    document.querySelectorAll<HTMLDetailsElement>(".siteNav details[open]").forEach((menu) => {
      if (menu !== except) menu.removeAttribute("open");
    });
  };
  const openAgencyHome = () => {
    window.history.pushState({}, "", "/");
    setPageView("home");
    setImportMessage("");
    window.scrollTo({ top: 0 });
  };
  const openAgencyPage = (target: "why" | "how") => {
    const path = target === "why" ? "/why-growthcast" : "/how-it-works";
    window.history.pushState({}, "", path);
    setPageView(target);
    setImportMessage("");
    window.scrollTo({ top: 0 });
  };
  const openCompanyPage = (target: "about" | "philosophy" | "careers" | "partners") => {
    closeSiteMenus();
    window.history.pushState({}, "", `/company/${target}`);
    setPageView(target);
    setImportMessage("");
    window.scrollTo({ top: 0 });
  };
  const openLegalPage = (target: "terms" | "privacy") => {
    window.history.pushState({}, "", `/${target}`);
    setPageView(target);
    setImportMessage("");
    window.scrollTo({ top: 0 });
  };
  const openForecastTool = () => {
    closeSiteMenus();
    window.history.pushState({}, "", "/resources/tools/forecast");
    setPageView("baseline");
    setImportMessage("");
    window.scrollTo({ top: 0 });
  };
  const openModelPage = (target: "forecast" | "deepdive" | "channels") => {
    if (!window.location.pathname.startsWith("/resources/tools/forecast")) {
      window.history.pushState({}, "", "/resources/tools/forecast");
    }
    setPageView(target);
    setImportMessage("");
  };
  const requestGrowthConversation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") || "").trim();
    const lastName = String(data.get("lastName") || "").trim();
    const company = String(data.get("company") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    const title = String(data.get("title") || "").trim();
    if (!firstName || !lastName || !company || !email || !title) return;
    if (isPostHogEnabled) {
      const contact = { email, first_name: firstName, last_name: lastName, company, title };
      posthog.identify(email, contact);
      posthog.capture(
        "growth_conversation_requested",
        { source: "agency_contact_form", ...contact },
        { $set: contact, send_instantly: true, transport: "fetch" },
      );
    }
    setContactSubmitted(true);
  };
  const requestGrowthPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    if (!firstName || !email) return;
    if (isPostHogEnabled) {
      const modelMetadata = { baseline, assumptions: a };
      posthog.identify(email, { email, first_name: firstName });
      posthog.capture(
        "growth_plan_requested",
        { source: "model_change_slide_in", ...modelMetadata },
        {
          $set: { email, first_name: firstName },
          send_instantly: true,
          transport: "fetch",
        },
      );
    }
    try {
      localStorage.setItem("growth-plan-requested-v1", "true");
    } catch {
      /* The request still succeeds when persistence is unavailable. */
    }
    setGrowthPlanSubmitted(true);
    setGrowthPlanStatus("Thanks — your Growth Plan request is in.");
  };
  const isAgencyPage = ["home", "why", "how", "terms", "privacy", "about", "philosophy", "careers", "partners"].includes(pageView);
  return (
    <main
      className={`${isAgencyPage ? "marketingHome" : ""}${showGrowthPlan ? " growthPlanVisible" : ""}`.trim() || undefined}
      style={
        {
          "--growth-plan-height": `${growthPlanHeight}px`,
        } as CSSProperties
      }
    >
      {isAgencyPage ? (
        <header className="siteHeader">
          <button className="siteBrand" type="button" onClick={openAgencyHome}>
            <span>GrowthCast</span>
          </button>
          <nav className="siteNav" aria-label="Main navigation">
            <button
              className={pageView === "why" ? "active" : ""}
              type="button"
              onClick={() => openAgencyPage("why")}
            >
              Why GrowthCast
            </button>
            <button
              className={pageView === "how" ? "active" : ""}
              type="button"
              onClick={() => openAgencyPage("how")}
            >
              How We Work
            </button>
            <details
              className="resourceNav companyNav"
              onToggle={(event) => {
                if (event.currentTarget.open) closeSiteMenus(event.currentTarget);
              }}
            >
              <summary>Company</summary>
              <div>
                <button type="button" onClick={() => openCompanyPage("about")}>About</button>
                <button type="button" onClick={() => openCompanyPage("philosophy")}>Philosophy</button>
                <button type="button" onClick={() => openCompanyPage("partners")}>Partners</button>
                <button type="button" onClick={() => openCompanyPage("careers")}>Careers</button>
              </div>
            </details>
            <details
              className="resourceNav"
              onToggle={(event) => {
                if (event.currentTarget.open) closeSiteMenus(event.currentTarget);
              }}
            >
              <summary>Resources</summary>
              <div>
                <span>Tools</span>
                <button type="button" onClick={openForecastTool}>Forecast</button>
                <span>Publishing</span>
                <p>Newsletter <small>Coming soon</small></p>
                <p>Blog <small>Coming soon</small></p>
                <p>Case Studies <small>Coming soon</small></p>
              </div>
            </details>
            <button
              className="siteNavCta"
              type="button"
              onClick={() => setShowContactForm(true)}
            >
              Let's Talk Growth
            </button>
          </nav>
        </header>
      ) : (
      <header>
        <div>
          <div className="brandTitle">
            <button className="modelWordmark" type="button" onClick={openAgencyHome}>GrowthCast</button>
            <h1>
              {pageView === "baseline"
                  ? "Baseline setup"
                  : pageView === "forecast"
                    ? "Growth forecast"
                    : pageView === "deepdive"
                      ? "Deep Dive"
                      : pageView === "channels"
                        ? "Channel settings"
                        : "Methodology"}
            </h1>
          </div>
          <nav className="pageNav">
            <button onClick={openAgencyHome}>Agency</button>
            <button
              className={pageView === "baseline" ? "active" : ""}
              onClick={() => {
                setPageView("baseline");
                setImportMessage("");
              }}
            >
              Baseline
            </button>
            <button
              className={pageView === "forecast" ? "active" : ""}
              onClick={() => openModelPage("forecast")}
            >
              Forecast
            </button>
            <button
              className={pageView === "deepdive" ? "active" : ""}
              onClick={() => openModelPage("deepdive")}
            >
              Deep Dive
            </button>
            <button
              className={pageView === "channels" ? "active" : ""}
              onClick={() => openModelPage("channels")}
            >
              Channels
            </button>
            <button
              className={pageView === "methodology" ? "active" : ""}
              onClick={() => {
                setPageView("methodology");
                setImportMessage("");
              }}
            >
              Methodology
            </button>
            <details className="navActions">
              <summary>Tools</summary>
              <div className="navActionsMenu">
                <button
                  onClick={() => {
                    setA(defaults);
                    setBaseline({
                      month: defaultBaselineMonth,
                      visitors: 0,
                      signups: 0,
                      mqls: 0,
                      sqls: 0,
                      newCustomers: 0,
                      customers: 0,
                      mrr: 0,
                      arpu: 0,
                      arr: 0,
                    });
                    setChannels(initialChannels());
                    setChannelDefaults({
                      signupRate: 0.137,
                      purchaseRate: 0.008,
                      arpu: 38,
                      mqlRate: 0.05,
                      sqlRate: 0.4,
                      closeRate: 0.2,
                      acv: 12000,
                    });
                    setBudget(0);
                    setMonthlyBudgetGrowth(0);
                    setMonthlyBudgetOverrides({});
                    setMonthlyChurnOverrides({});
                    setCashFlowSettings(defaultCashFlow);
                    setPageView("baseline");
                    setModelName("GrowthCast");
                    setForecastStartMonth(defaultForecastStartMonth);
                    setScenario("Baseline");
                    setImportMessage("");
                    if (isPostHogEnabled) {
                      posthog.capture("model_reset");
                    }
                  }}
                >
                  <RotateCcw size={16} /> Reset
                </button>
                <label className="uploadControl">
                  <Upload size={16} />
                  <span>Load assumptions</span>
                  <input
                    ref={fileInput}
                    aria-label="Assumptions file"
                    type="file"
                    accept=".csv,.json,text/csv,text/plain,application/json,application/vnd.ms-excel"
                    onChange={(e) => importAssumptions(e.target.files?.[0])}
                  />
                </label>
                <label className="menuSelect">
                  <span>Assumptions format</span>
                  <select
                    aria-label="Assumptions download format"
                    value={downloadFormat}
                    onChange={(e) =>
                      setDownloadFormat(e.target.value as "json" | "csv")
                    }
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </label>
                <button onClick={exportAssumptions}>
                  <Download size={16} /> Export assumptions
                </button>
                <label className="menuSelect">
                  <span>Forecast format</span>
                  <select
                    aria-label="Forecast download format"
                    value={forecastFormat}
                    onChange={(e) =>
                      setForecastFormat(e.target.value as "csv" | "pdf")
                    }
                  >
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV bundle (.zip)</option>
                  </select>
                </label>
                <button className="primary" onClick={exportForecast}>
                  <Download size={16} /> Export forecast
                </button>
              </div>
            </details>
          </nav>
          <p>
            {pageView === "baseline"
                ? "Enter the opening metrics that anchor every forecast."
                : pageView === "forecast"
                  ? "Change a lever. See the revenue consequence."
                  : pageView === "deepdive"
                    ? "Inspect acquisition, churn, revenue, growth, and customer movement."
                    : pageView === "channels"
                      ? "Configure acquisition channels without crowding the forecast."
                      : "How assumptions flow through the monthly model."}
          </p>
        </div>
      </header>
      )}
      {importMessage && (
        <div className="importMessage" role="status">
          {importMessage}
        </div>
      )}
      {pageView === "home" ? (
        <AgencyHome
          onForecast={openForecastTool}
          onContact={() => setShowContactForm(true)}
        />
      ) : pageView === "why" ? (
        <AgencyWhy onContact={() => setShowContactForm(true)} />
      ) : pageView === "how" ? (
        <AgencyHow onContact={() => setShowContactForm(true)} />
      ) : pageView === "terms" || pageView === "privacy" ? (
        <LegalPage type={pageView} />
      ) : pageView === "about" || pageView === "philosophy" || pageView === "careers" || pageView === "partners" ? (
        <CompanyPage type={pageView} />
      ) : (
      <section
        className={`layout ${pageView === "baseline" ? "baselineMode" : pageView === "deepdive" ? "deepMode" : pageView === "channels" ? "channelMode" : pageView === "methodology" ? "methodMode" : "forecastMode"}`}
      >
        <aside>
          <div className="panelHead">
            <h2>Assumptions</h2>
            <span>{scenario}</span>
          </div>
          <div className="scenarioTabs">
            {Object.keys(scenarios).map((name) => (
              <button
                className={scenario === name ? "active" : ""}
                key={name}
                onClick={() => {
                  setScenario(name);
                  setA({ ...a, ...scenarios[name] });
                  if (isPostHogEnabled && scenario !== name) {
                    posthog.capture("scenario_selected", { scenario: name });
                  }
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="field">
            <span>
              Starting month<small>First forecast month</small>
            </span>
            <div className="input monthInput">
              <select
                aria-label="Starting month"
                value={forecastStartMonth}
                onChange={(e) => {
                  setForecastStartMonth(e.target.value);
                  setScenario("Custom");
                }}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </label>
          {activeFields.slice(0, primaryFieldCount).map((f) => (
            <Field
              key={f.key}
              f={f}
              a={a}
              setA={(v) => {
                setScenario("Custom");
                setA(v);
              }}
            />
          ))}
          <details className="advanced">
            <summary>Advanced assumptions</summary>
            {activeFields.slice(primaryFieldCount).map((f) => (
              <Field
                key={f.key}
                f={f}
                a={a}
                setA={(v) => {
                  setScenario("Custom");
                  setA(v);
                }}
              />
            ))}
          </details>
        </aside>
        <div className="dashboard">
          <section className="baselineCard">
            <div className="baselineHead">
              <div>
                <span>Forecast anchor</span>
                <h2>Baseline metrics</h2>
                <p>
                  {businessModel === "b2b"
                    ? "Enter the latest complete month's steady-state pipeline flow. Each stage must be no larger than the stage before it. These observed volumes calibrate the forecast rates; MRR is derived from ARR."
                    : "These opening values feed the first forecast month. ARPU and ARR are derived from customers and MRR."}
                </p>
              </div>
              <div className="baselineActions">
                <label className="uploadControl">
                  <Upload size={16} />
                  <span>Upload baseline CSV</span>
                  <input
                    ref={baselineInput}
                    aria-label="Baseline CSV file"
                    type="file"
                    accept=".csv,text/csv,text/plain,application/vnd.ms-excel"
                    onChange={(e) => importBaseline(e.target.files?.[0])}
                  />
                </label>
                <button onClick={exportBaseline}>
                  <Download size={16} /> Export baselines
                </button>
              </div>
            </div>
            <fieldset className="modelTypeSelector">
              <legend>Business model</legend>
              <button
                type="button"
                className={businessModel === "b2c" ? "active" : ""}
                aria-pressed={businessModel === "b2c"}
                onClick={() => {
                  setA({ ...a, businessModel: "b2c" });
                  if (isPostHogEnabled && businessModel !== "b2c") {
                    posthog.capture("business_model_selected", {
                      business_model: "b2c",
                    });
                  }
                }}
              >
                <strong>B2C</strong>
                <span>Signup and purchase funnel</span>
              </button>
              <button
                type="button"
                className={businessModel === "b2b" ? "active" : ""}
                aria-pressed={businessModel === "b2b"}
                onClick={() => {
                  setA({ ...a, businessModel: "b2b" });
                  if (isPostHogEnabled && businessModel !== "b2b") {
                    posthog.capture("business_model_selected", {
                      business_model: "b2b",
                    });
                  }
                }}
              >
                <strong>B2B</strong>
                <span>MQL, SQL, and closed-won pipeline</span>
              </button>
            </fieldset>
            <div className="baselineGrid">
              <label>
                Model name
                <input
                  aria-label="Model name"
                  type="text"
                  maxLength={120}
                  value={modelName}
                  placeholder="GrowthCast"
                  onChange={(e) => setModelName(e.target.value.slice(0, 120))}
                />
              </label>
              <label>
                Baseline month
                <input
                  aria-label="Baseline month"
                  type="month"
                  value={baseline.month}
                  onChange={(e) => {
                    if (isIsoMonth(e.target.value))
                      setBaseline({ ...baseline, month: e.target.value });
                  }}
                />
              </label>
              <label>
                Monthly visitors
                <input
                  aria-label="Baseline visitors"
                  type="number"
                  min="0"
                  step="1"
                  value={baseline.visitors}
                  onChange={(e) => {
                    const visitors = clamp(+e.target.value);
                    if (businessModel === "b2b")
                      updateB2bBaseline("visitors", visitors);
                    else setBaseline({ ...baseline, visitors });
                  }}
                />
              </label>
              {businessModel === "b2b" ? (
                <>
                  <label>
                    Monthly MQLs
                    <input
                      aria-label="Baseline MQLs"
                      type="number"
                      min="0"
                      max={baseline.visitors}
                      step="1"
                      value={baseline.mqls}
                      onChange={(e) =>
                        updateB2bBaseline("mqls", +e.target.value)
                      }
                    />
                  </label>
                  <label>
                    Monthly SQLs
                    <input
                      aria-label="Baseline SQLs"
                      type="number"
                      min="0"
                      max={baseline.mqls}
                      step="1"
                      value={baseline.sqls}
                      onChange={(e) =>
                        updateB2bBaseline("sqls", +e.target.value)
                      }
                    />
                  </label>
                </>
              ) : (
                <label>
                  Monthly signups
                  <input
                    aria-label="Baseline signups"
                    type="number"
                    min="0"
                    step="1"
                    value={baseline.signups}
                    onChange={(e) =>
                      setBaseline({ ...baseline, signups: clamp(+e.target.value) })
                    }
                  />
                </label>
              )}
              <label>
                New customers
                <input
                  aria-label="Baseline new customers"
                  type="number"
                  min="0"
                  max={businessModel === "b2b" ? baseline.sqls : undefined}
                  step="1"
                  value={baseline.newCustomers}
                  onChange={(e) => {
                    if (businessModel === "b2b")
                      updateB2bBaseline("newCustomers", +e.target.value);
                    else
                      setBaseline({
                        ...baseline,
                        newCustomers: clamp(+e.target.value),
                      });
                  }}
                />
              </label>
              <label>
                Total customers
                <input
                  aria-label="Baseline customers"
                  type="number"
                  min="0"
                  step="1"
                  value={baseline.customers}
                  onChange={(e) => {
                    const customers = clamp(+e.target.value);
                    setBaseline({
                      ...baseline,
                      customers,
                      arpu: customers ? baseline.mrr / customers : 0,
                    });
                  }}
                />
              </label>
              <label>
                {businessModel === "b2b" ? "ARR" : "MRR"}
                <input
                  aria-label={
                    businessModel === "b2b" ? "Baseline ARR" : "Baseline MRR"
                  }
                  type="number"
                  min="0"
                  step="1"
                  value={businessModel === "b2b" ? baseline.arr : baseline.mrr}
                  onChange={(e) => {
                    const amount = clamp(+e.target.value);
                    const mrr = businessModel === "b2b" ? amount / 12 : amount;
                    setBaseline({
                      ...baseline,
                      mrr,
                      arr: businessModel === "b2b" ? amount : amount * 12,
                      arpu: baseline.customers ? mrr / baseline.customers : 0,
                    });
                  }}
                />
              </label>
              <label className="derived">
                {businessModel === "b2b" ? "Average MRR / account" : "ARPU"}{" "}
                <small>Derived</small>
                <output>{money(baseline.arpu)}</output>
              </label>
              <label className="derived">
                {businessModel === "b2b" ? "MRR" : "ARR"} <small>Derived</small>
                <output>
                  {money(businessModel === "b2b" ? baseline.mrr : baseline.arr)}
                </output>
              </label>
            </div>
            <div className="baselineFoot">
              <p>Need the complete funnel configuration too?</p>
              <label className="uploadControl">
                <Upload size={16} />
                <span>Load assumptions CSV or JSON</span>
                <input
                  aria-label="Baseline page assumptions file"
                  type="file"
                  accept=".csv,.json,text/csv,text/plain,application/json,application/vnd.ms-excel"
                  onChange={(e) => importAssumptions(e.target.files?.[0])}
                />
              </label>
            </div>
          </section>
          <DeepDive
            projection={projection}
            channels={channels}
            budget={budget}
            setBudget={setBudget}
            monthlyBudgetGrowth={monthlyBudgetGrowth}
            setMonthlyBudgetGrowth={setMonthlyBudgetGrowth}
            assumptions={a}
            baselineMrr={baseline.mrr}
            monthlyBudgetOverrides={monthlyBudgetOverrides}
            setMonthlyBudgetOverrides={setMonthlyBudgetOverrides}
            monthlyChurnOverrides={monthlyChurnOverrides}
            setMonthlyChurnOverrides={setMonthlyChurnOverrides}
            cashFlowSettings={cashFlowSettings}
            setCashFlowSettings={setCashFlowSettings}
          />
          <div className="metricsExport">
            <div className="metricsExportHead">
              <span>Marquee metrics</span>
              <ImageExportButton
                targetId="marquee-metrics"
                filename="marquee-metrics.png"
                title="Marquee growth metrics"
                description="The ten numbers that frame the current forecast."
                square
              />
            </div>
            <div id="marquee-metrics">
              <section className="cards">
                <article>
                  <small>ENDING MRR</small>
                  <strong>{moneyWhole(end.endingMrr)}</strong>
                  <em>
                    {baseline.mrr ? pct(end.endingMrr / baseline.mrr - 1) : "—"}{" "}
                    vs {baseline.month}
                  </em>
                </article>
                <article>
                  <small>ENDING ARR</small>
                  <strong>{moneyWhole(end.arr)}</strong>
                  <em>{a.months}-month run rate</em>
                </article>
                <article>
                  <small>TOTAL CUSTOMERS</small>
                  <strong>{whole(end.customers)}</strong>
                  <em>+{whole(end.customers - baseline.customers)} net</em>
                </article>
                <article>
                  <small>MAX CAC</small>
                  <strong>{moneyWhole(end.maxCac)}</strong>
                  <em>{a.targetLtvCac}:1 contribution LTV:CAC</em>
                </article>
                <article>
                  <small>NET REVENUE RETENTION</small>
                  <strong>{pct(netRevenueRetention)}</strong>
                  <em>Expansion less downgrade and revenue churn</em>
                </article>
              </section>
              <section className="cards secondaryCards">
                <article>
                  <small>PAYBACK PERIOD</small>
                  <strong>{number(payback)} mo</strong>
                  <em>Blended CAC ÷ monthly contribution ARPU</em>
                </article>
                <article>
                  <small>PREDICTED LTV</small>
                  <strong>{money(predictedLtv)}</strong>
                  <em>
                    Weighted acquisition ARPU × gross margin ÷ revenue churn
                  </em>
                </article>
                <article>
                  <small>ACTUAL BLENDED CAC</small>
                  <strong>{money(blendedCac)}</strong>
                  <em>
                    Paid spend + S&amp;M overhead + affiliate commissions ÷
                    acquired customers
                  </em>
                </article>
                <article>
                  <small>EXPECTED LTV:CAC</small>
                  <strong>
                    {expectedLtvCac === null
                      ? "—"
                      : `${number(expectedLtvCac)}:1`}
                  </strong>
                  <em>Predicted LTV ÷ blended CAC</em>
                </article>
                <article>
                  <small>SAAS MAGIC NUMBER</small>
                  <strong>
                    {magicNumber === null ? "—" : number(magicNumber)}
                  </strong>
                  <em>
                    ARR gained over 3 months ÷ those 3 months of S&amp;M spend
                  </em>
                </article>
              </section>
            </div>
          </div>
          <section
            className="churnDiagnostics"
            aria-labelledby="churn-diagnostics-title"
          >
            <div>
              <h3 id="churn-diagnostics-title">Churn value diagnostic</h3>
              <p>
                Logo churn controls customer loss; revenue churn controls MRR
                loss. Their relationship reveals the implied value of customers
                who leave.
              </p>
            </div>
            <article>
              <small>CHURNED CUSTOMER ARPU</small>
              <strong>{money(end.churnedCustomerArpu)}</strong>
              <em>Churned MRR ÷ churned customers</em>
            </article>
            <article>
              <small>CHURNED VS OPENING ARPU</small>
              <strong>
                {end.churnedArpuRatio === null
                  ? "—"
                  : pct(end.churnedArpuRatio)}
              </strong>
              <em>
                {end.churnedArpuRatio === null
                  ? "Requires logo and revenue churn"
                  : end.churnedArpuRatio > 1
                    ? "Churn skews toward higher-value customers"
                    : end.churnedArpuRatio < 1
                      ? "Churn skews toward lower-value customers"
                      : "Churn matches opening customer value"}
              </em>
            </article>
          </section>
          <section className="channelCard">
            <div className="chartTitle">
              <div>
                <h2>Channel assumptions</h2>
                <p>
                  Each channel adds traffic once in its go-live month; all
                  active traffic then compounds at the global Traffic growth
                  rate
                </p>
              </div>
              <b>+{number(channelVisitors)} launch visitors</b>
            </div>
            <div className="budgetBar">
              <label>
                Paid media budget{" "}
                <span>
                  <b>$</b>
                  <input
                    aria-label="Paid media budget"
                    type="number"
                    min="0"
                    step="1000"
                    value={budget}
                    onChange={(e) => setBudget(clamp(+e.target.value))}
                  />
                  <small>/ mo</small>
                </span>
              </label>
              <label>
                Allocated{" "}
                <strong
                  className={Math.abs(allocation - 1) > 0.001 ? "warn" : ""}
                >
                  {pct(allocation)} · {money(budget * allocation)}
                </strong>
              </label>
            </div>
            <div className="channelTabs">
              <button
                className={channelTab === "general" ? "active" : ""}
                onClick={() => setChannelTab("general")}
              >
                General
              </button>
              <button
                className={channelTab === "cpc" ? "active" : ""}
                onClick={() => setChannelTab("cpc")}
              >
                Direct Response
              </button>
              <button
                className={channelTab === "cpm" ? "active" : ""}
                onClick={() => setChannelTab("cpm")}
              >
                Demand Gen
              </button>
              <button
                className={channelTab === "manual" ? "active" : ""}
                onClick={() => setChannelTab("manual")}
              >
                Owned / Partner / Custom
              </button>
              <button
                className="showHidden"
                onClick={() => setShowHidden(!showHidden)}
              >
                {showHidden
                  ? "Hide hidden"
                  : `Show hidden (${channels.filter((c) => c.hidden).length})`}
              </button>
            </div>
            <div className="channelGroups">
              {channelTab === "general" ? (
                <section className="generalChannels">
                  <div>
                    <span>Default funnel assumptions</span>
                    <h3>Set every subchannel at once</h3>
                    <p>
                      Changes here immediately update all direct response,
                      demand generation, owned, partner, and custom channels.
                      You can still override an individual channel afterward.
                    </p>
                  </div>
                  {businessModel === "b2b" ? (
                    <>
                      <label>
                        Visitor → MQL %
                        <input
                          aria-label="All channels MQL rate"
                          type="number"
                          min="0"
                          max="100"
                          step=".1"
                          value={one(channelDefaults.mqlRate * 100)}
                          onChange={(e) => {
                            const mqlRate = rateFromInput(e.target.value);
                            setChannelDefaults({ ...channelDefaults, mqlRate });
                            setChannels(
                              channels.map((c) => ({ ...c, mqlRate })),
                            );
                          }}
                        />
                      </label>
                      <label>
                        MQL → SQL %
                        <input
                          aria-label="All channels SQL rate"
                          type="number"
                          min="0"
                          max="100"
                          step=".1"
                          value={one(channelDefaults.sqlRate * 100)}
                          onChange={(e) => {
                            const sqlRate = rateFromInput(e.target.value);
                            setChannelDefaults({ ...channelDefaults, sqlRate });
                            setChannels(
                              channels.map((c) => ({ ...c, sqlRate })),
                            );
                          }}
                        />
                      </label>
                      <label>
                        SQL → closed won %
                        <input
                          aria-label="All channels close rate"
                          type="number"
                          min="0"
                          max="100"
                          step=".1"
                          value={one(channelDefaults.closeRate * 100)}
                          onChange={(e) => {
                            const closeRate = rateFromInput(e.target.value);
                            setChannelDefaults({
                              ...channelDefaults,
                              closeRate,
                            });
                            setChannels(
                              channels.map((c) => ({ ...c, closeRate })),
                            );
                          }}
                        />
                      </label>
                      <label>
                        ACV
                        <input
                          aria-label="All channels ACV"
                          type="number"
                          min="0"
                          step="100"
                          value={one(channelDefaults.acv)}
                          onChange={(e) => {
                            const acv = clamp(+e.target.value);
                            setChannelDefaults({ ...channelDefaults, acv });
                            setChannels(channels.map((c) => ({ ...c, acv })));
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Visitor → signup %
                        <input
                          aria-label="All channels signup rate"
                          type="number"
                          min="0"
                          step=".1"
                          value={one(channelDefaults.signupRate * 100)}
                          onChange={(e) => {
                            const signupRate = rateFromInput(e.target.value);
                            setChannelDefaults({
                              ...channelDefaults,
                              signupRate,
                            });
                            setChannels(
                              channels.map((c) => ({ ...c, signupRate })),
                            );
                          }}
                        />
                      </label>
                      <label>
                        Signup → purchase %
                        <input
                          aria-label="All channels purchase rate"
                          type="number"
                          min="0"
                          step=".1"
                          value={one(channelDefaults.purchaseRate * 100)}
                          onChange={(e) => {
                            const purchaseRate = rateFromInput(e.target.value);
                            setChannelDefaults({
                              ...channelDefaults,
                              purchaseRate,
                            });
                            setChannels(
                              channels.map((c) => ({ ...c, purchaseRate })),
                            );
                          }}
                        />
                      </label>
                      <label>
                        New customer ARPU
                        <input
                          aria-label="All channels ARPU"
                          type="number"
                          min="0"
                          step=".1"
                          value={one(channelDefaults.arpu)}
                          onChange={(e) => {
                            const arpu = clamp(+e.target.value);
                            setChannelDefaults({ ...channelDefaults, arpu });
                            setChannels(channels.map((c) => ({ ...c, arpu })));
                          }}
                        />
                      </label>
                    </>
                  )}
                </section>
              ) : (
                channels
                  .map((c, i) => ({ c, i }))
                  .filter(
                    ({ c }) =>
                      c.model === channelTab && (!c.hidden || showHidden),
                  )
                  .map(({ c, i }) => (
                    <ChannelRow
                      key={c.name}
                      channel={c}
                      modeled={modeledChannels[i]}
                      index={i}
                      budget={budget}
                      setChannels={setChannels}
                      channels={channels}
                      businessModel={businessModel}
                    />
                  ))
              )}
            </div>
          </section>
          <section className="methodCard">
            <div className="methodIntro">
              <h2>How to use this model</h2>
              <p>
                Start with the Baseline scenario, configure channel launches,
                then change one assumption at a time. The forecast runs month by
                month from the opening values configured on the Baseline page.
              </p>
            </div>
            <div className="methodGrid">
              <article>
                <span>01</span>
                <h3>Baseline traffic</h3>
                <p>
                  Each month begins with the previous month’s baseline visitors
                  multiplied by <b>1 + Traffic growth</b>.
                </p>
                <code>next visitors = prior visitors × (1 + growth)</code>
              </article>
              <article>
                <span>02</span>
                <h3>Channel launches</h3>
                <p>
                  A channel adds traffic once in its Live month. Month 0
                  disables it. After launch, its traffic compounds at the global
                  Traffic growth rate.
                </p>
                <code>channel traffic = launch traffic × (1 + growth)</code>
              </article>
              <article>
                <span>03</span>
                <h3>Paid traffic</h3>
                <p>
                  Direct response uses allocated spend and CPC. Demand
                  generation uses allocated spend, CPM, and CTR.
                </p>
                <code>
                  DR = spend ÷ CPC
                  <br />
                  Demand = spend ÷ CPM × 1,000 × CTR
                </code>
              </article>
              <article>
                <span>04</span>
                <h3>{businessModel === "b2b" ? "Sales pipeline" : "Funnel"}</h3>
                {businessModel === "b2b" ? <><p>Visitors become MQLs, MQLs become SQLs, and SQLs close after the average deal cycle. Each channel can override its pipeline rates and ACV.</p><code>closed won = visitors × MQL % × SQL % × close %<br />new MRR = closed won × ACV ÷ 12</code></> : <><p>Baseline traffic uses the main conversion assumptions. A channel uses its own expanded signup and purchase assumptions.</p><code>eligible upgrades = signups shifted by days to upgrade × purchase %</code></>}
              </article>
              <article>
                <span>05</span>
                <h3>Customer bridge</h3>
                <p>
                  New customers are added while voluntary and delinquent logo
                  churn remove customers from the opening balance.
                </p>
                <code>ending customers = opening + new − churned</code>
              </article>
              <article>
                <span>06</span>
                <h3>Revenue bridge</h3>
                <p>
                  New and expansion MRR are added; downgrade and revenue churn
                  MRR are removed.
                </p>
                <code>
                  ending MRR = opening + new + expansion − downgrade − churn
                </code>
              </article>
              <article>
                <span>07</span>
                <h3>Unit economics</h3>
                <p>
                  Predicted LTV uses the customer-weighted monthly value of all
                  acquisition sources, gross margin, and revenue churn, so
                  channel economics matter while logo churn cannot mechanically
                  reduce LTV. Blended CAC combines paid launch spend, one month
                  of Sales &amp; Marketing Overhead, and churn-adjusted
                  affiliate commissions, divided by the customers attributed to
                  those channels.
                </p>
                <code>
                  LTV = (total new MRR ÷ new customers) × margin ÷ revenue churn
                  <br />
                  CAC = (paid spend + S&amp;M overhead + affiliate commissions)
                  ÷ acquired customers
                </code>
              </article>
              <article>
                <span>08</span>
                <h3>Read the result</h3>
                <p>
                  Payback shows months needed to recover blended CAC from
                  monthly contribution ARPU. Expected LTV:CAC compares predicted
                  contribution LTV with blended CAC.
                </p>
                <code>
                  payback = CAC ÷ (weighted acquisition ARPU × margin)
                  <br />
                  LTV:CAC = predicted LTV ÷ CAC
                </code>
              </article>
              <article>
                <span>09</span>
                <h3>SaaS efficiency</h3>
                <p>
                  Ending-month NRR uses the effective churn rate for that month.
                  Magic Number compares ending ARR with ending ARR three months
                  earlier, then divides the gain by paid spend plus Sales &amp;
                  Marketing Overhead across those latest three months.
                </p>
                <code>
                  NRR = 1 + expansion − downgrade − churn
                  <br />
                  Magic Number = 3-month ARR gain ÷ latest 3 months of S&amp;M
                  spend
                </code>
              </article>
              <article>
                <span>10</span>
                <h3>Channel attribution</h3>
                <p>
                  Open any Monthly Forecast row to trace the parent total across
                  baseline and launched channels. Each channel retains its own
                  cumulative customer and MRR cohort under the same logo churn,
                  revenue churn, expansion, and downgrade assumptions.
                </p>
                <code>
                  category total = sum of channel cohorts
                  <br />
                  parent month = baseline cohort + all category totals
                </code>
              </article>
            </div>
            <div className="methodNotes">
              <h3>Recommended workflow</h3>
              <ol>
                <li>
                  Name the model and export a clean Baseline assumption set.
                </li>
                <li>
                  Set each channel’s Live month; use 0 for channels outside the
                  plan.
                </li>
                <li>
                  Make paid allocations total 100% and enter CPC or CPM/CTR
                  expectations.
                </li>
                <li>
                  Expand channels only when their conversion or ARPU differs
                  from Baseline.
                </li>
                <li>
                  Compare ending MRR, payback, blended CAC, and expected
                  LTV:CAC.
                </li>
                <li>
                  Open a Monthly Forecast row to reconcile baseline and channel
                  cohorts.
                </li>
                <li>
                  Export the assumptions JSON and seven-file forecast CSV bundle
                  for review.
                </li>
              </ol>
            </div>
          </section>
          <section className="chartCard wide">
            <div className="chartTitle">
              <div>
                <h2>MRR and ARR trajectory</h2>
                <p>Realized recurring revenue from the opening baseline</p>
              </div>
              <div className="chartTools">
                <TrendingUp size={22} />
                <ImageExportButton
                  targetId="chart-mrr-trajectory"
                  filename="mrr-arr-trajectory.png"
                  title="MRR and ARR trajectory"
                  description="Realized monthly and annual recurring revenue from the opening baseline."
                />
              </div>
            </div>
            <div id="chart-mrr-trajectory" className="imageChart">
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={trend} margin={{ left: 10, right: 24 }}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ff6b4a" stopOpacity=".35" />
                      <stop offset="1" stopColor="#ff6b4a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v) => v.slice(2)}
                    minTickGap={30}
                  />
                  <YAxis
                    yAxisId="mrr"
                    tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                  />
                  <YAxis
                    yAxisId="arr"
                    orientation="right"
                    tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Legend />
                  <Area
                    yAxisId="mrr"
                    type="monotone"
                    dataKey="mrr"
                    name="Ending MRR"
                    stroke="#ff6b4a"
                    fill="url(#fill)"
                    strokeWidth={3}
                  />
                  <Line
                    yAxisId="arr"
                    type="monotone"
                    dataKey="arr"
                    name="Ending ARR"
                    stroke="#7b61ff"
                    strokeWidth={3}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
          {businessModel === "b2b" && (
            <section className="chartCard wide">
              <div className="chartTitle">
                <div>
                  <h2>Pipeline over time</h2>
                  <p>
                    MQLs and SQLs created each month, with closed-won customers
                    after the deal-cycle delay.
                  </p>
                </div>
                <ImageExportButton
                  targetId="chart-pipeline"
                  filename="pipeline-over-time.png"
                  title="Pipeline over time"
                  description="Monthly MQL, SQL, and closed-won volume across the B2B forecast."
                />
              </div>
              <div id="chart-pipeline" className="imageChart">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart
                    data={pipeline}
                    margin={{ left: 10, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={(v) => v.slice(2)}
                      minTickGap={30}
                    />
                    <YAxis yAxisId="leads" tickFormatter={whole} />
                    <YAxis
                      yAxisId="wins"
                      orientation="right"
                      tickFormatter={whole}
                    />
                    <Tooltip formatter={(v) => whole(Number(v))} />
                    <Legend />
                    <Area
                      yAxisId="leads"
                      type="monotone"
                      dataKey="mqls"
                      name="MQLs"
                      stroke="#7b61ff"
                      fill="#7b61ff"
                      fillOpacity={0.12}
                    />
                    <Line
                      yAxisId="leads"
                      type="monotone"
                      dataKey="sqls"
                      name="SQLs"
                      stroke="#2ab99f"
                      strokeWidth={3}
                    />
                    <Line
                      yAxisId="wins"
                      type="monotone"
                      dataKey="closedWon"
                      name="Closed won"
                      stroke="#ff6b4a"
                      strokeWidth={3}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          <div className="chartGrid">
            <section className="chartCard">
              <div className="chartTitle">
                <div>
                  <h2>Revenue bridge</h2>
                  <p>Monthly MRR movement</p>
                </div>
                <ImageExportButton
                  targetId="chart-revenue-bridge"
                  filename="revenue-bridge.png"
                  title="Revenue bridge"
                  description="Monthly MRR movement across new, expansion, downgrade, and churn."
                />
              </div>
              <div id="chart-revenue-bridge" className="imageChart">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={bridge} stackOffset="sign">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} />
                    <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v) => money(Number(v))} />
                    <Legend />
                    <Bar dataKey="New" stackId="movement" fill="#ff6b4a" />
                    <Bar
                      dataKey="Expansion"
                      stackId="movement"
                      fill="#7b61ff"
                    />
                    <Bar
                      dataKey="Downgrade"
                      stackId="movement"
                      fill="#f1b84b"
                    />
                    <Bar dataKey="Churn" stackId="movement" fill="#27282a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="chartCard">
              <div className="chartTitle">
                <div>
                  <h2>
                    {businessModel === "b2b"
                      ? "Account growth"
                      : "Customer growth"}
                  </h2>
                  <p>
                    {businessModel === "b2b"
                      ? "Active accounts and closed-won customers"
                      : "Logos, signups, and new customers"}
                  </p>
                </div>
                <ImageExportButton
                  targetId="chart-customer-growth"
                  filename="customer-growth.png"
                  title="Customer growth"
                  description="Logos, signups, and new customers across the forecast period."
                />
              </div>
              <div id="chart-customer-growth" className="imageChart">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart
                    data={projection}
                    margin={{ left: 10, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tickFormatter={(v) => v.slice(5)} />
                    <YAxis yAxisId="people" tickFormatter={whole} />
                    <YAxis
                      yAxisId="new"
                      orientation="right"
                      tickFormatter={whole}
                    />
                    <Tooltip formatter={(v) => whole(Number(v))} />
                    <Legend />
                    <Line
                      yAxisId="people"
                      type="monotone"
                      dataKey="customers"
                      stroke="#27282a"
                      strokeWidth={3}
                    />
                    {businessModel === "b2c" && (
                      <Line
                        yAxisId="people"
                        type="monotone"
                        dataKey="signups"
                        stroke="#7b61ff"
                      />
                    )}
                    <Line
                      yAxisId="new"
                      type="monotone"
                      dataKey="newCustomers"
                      stroke="#ff6b4a"
                      strokeWidth={2}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
          <section className="tableCard">
            <div className="chartTitle">
              <div>
                <h2>Monthly forecast</h2>
                <p>
                  Click a month to reconcile the forecast across baseline and
                  active acquisition channels.
                </p>
              </div>
            </div>
            <div className="tableWrap forecastTable">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Visitors</th>
                    {businessModel === "b2b" ? (
                      <>
                        <th>MQLs</th>
                        <th>SQLs</th>
                        <th>Closed won</th>
                        <th>Total customers</th>
                      </>
                    ) : (
                      <>
                        <th>Signups</th>
                        <th>New customers</th>
                        <th>Total customers</th>
                        <th>ARPU</th>
                      </>
                    )}
                    <th>Ending MRR</th>
                    <th>Ending ARR</th>
                    <th>Max CAC</th>
                    <th>
                      {businessModel === "b2b"
                        ? "Max cost/MQL"
                        : "Max cost/signup"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projection.map((r) => {
                    const expanded = expandedMonth === r.month,
                      detail = breakdownByMonth.get(r.month);
                    const cells = (row: ChannelBreakdownRow) => (
                      <>
                        <td>{whole(row.visitors)}</td>
                        {businessModel === "b2b" ? (
                          <>
                            <td>{whole(row.mqls)}</td>
                            <td>{whole(row.sqls)}</td>
                            <td>{whole(row.newCustomers)}</td>
                            <td>{whole(row.customers)}</td>
                          </>
                        ) : (
                          <>
                            <td>{whole(row.signups)}</td>
                            <td>{whole(row.newCustomers)}</td>
                            <td>{whole(row.customers)}</td>
                            <td>{moneyWhole(row.arpu)}</td>
                          </>
                        )}
                        <td>
                          <b>{moneyWhole(row.endingMrr)}</b>
                        </td>
                        <td>
                          <b>{moneyWhole(row.arr)}</b>
                        </td>
                        <td>{moneyWhole(row.maxCac)}</td>
                        <td>
                          {moneyWhole(
                            businessModel === "b2b"
                              ? row.maxCostPerMql
                              : row.maxCostPerSignup,
                          )}
                        </td>
                      </>
                    );
                    return (
                      <Fragment key={r.month}>
                        <tr
                          className={`monthlyRow ${expanded ? "expanded" : ""}`}
                          onClick={() =>
                            setExpandedMonth(expanded ? null : r.month)
                          }
                        >
                          <td>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`forecast-detail-${r.month}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedMonth(expanded ? null : r.month);
                              }}
                            >
                              <span aria-hidden="true">
                                {expanded ? "−" : "+"}
                              </span>
                              {r.month}
                            </button>
                          </td>
                          <td>{whole(r.visitors)}</td>
                          {businessModel === "b2b" ? (
                            <>
                              <td>{whole(r.mqls)}</td>
                              <td>{whole(r.sqls)}</td>
                              <td>{whole(r.newCustomers)}</td>
                              <td>{whole(r.customers)}</td>
                            </>
                          ) : (
                            <>
                              <td>{whole(r.signups)}</td>
                              <td>{whole(r.newCustomers)}</td>
                              <td>{whole(r.customers)}</td>
                              <td>{moneyWhole(r.arpu)}</td>
                            </>
                          )}
                          <td>
                            <b>{moneyWhole(r.endingMrr)}</b>
                          </td>
                          <td>
                            <b>{moneyWhole(r.arr)}</b>
                          </td>
                          <td>{moneyWhole(r.maxCac)}</td>
                          <td>
                            {moneyWhole(
                              businessModel === "b2b"
                                ? r.maxCostPerMql
                                : r.maxCostPerSignup,
                            )}
                          </td>
                        </tr>
                        {expanded && detail && (
                          <tr className="forecastDetailRow">
                            <td colSpan={10}>
                              <div
                                id={`forecast-detail-${r.month}`}
                                className="forecastDetail"
                              >
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Channel</th>
                                      <th>Visitors</th>
                                      {businessModel === "b2b" ? (
                                        <>
                                          <th>MQLs</th>
                                          <th>SQLs</th>
                                          <th>Closed won</th>
                                          <th>Total customers</th>
                                        </>
                                      ) : (
                                        <>
                                          <th>Signups</th>
                                          <th>New customers</th>
                                          <th>Total customers</th>
                                          <th>ARPU</th>
                                        </>
                                      )}
                                      <th>Ending MRR</th>
                                      <th>Ending ARR</th>
                                      <th>Max CAC</th>
                                      <th>
                                        {businessModel === "b2b"
                                          ? "Max cost/MQL"
                                          : "Max cost/signup"}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.categories.flatMap((category) => [
                                      <tr
                                        className="categoryRow"
                                        key={`${r.month}-${category.name}`}
                                      >
                                        <td>
                                          <em>{category.name}</em>
                                        </td>
                                        {cells(category.total)}
                                      </tr>,
                                      ...category.channels.map((channel) => (
                                        <tr
                                          className="channelBreakdownRow"
                                          key={`${r.month}-${category.name}-${channel.name}`}
                                        >
                                          <td>{channel.name}</td>
                                          {cells(channel)}
                                        </tr>
                                      )),
                                    ])}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
      )}
      {showContactForm && (
        <div
          className="contactModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowContactForm(false);
          }}
        >
          <section
            className="contactModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
          >
            <button
              className="contactModalClose"
              type="button"
              aria-label="Close contact form"
              onClick={() => setShowContactForm(false)}
            >
              ×
            </button>
            <span className="sectionLabel">Growth conversation</span>
            <h2 id="contact-title">Let&apos;s talk growth.</h2>
            {contactSubmitted ? (
              <p className="contactSuccess" role="status">Thanks. We will be in touch.</p>
            ) : (
              <form onSubmit={requestGrowthConversation}>
                <label>First name<input name="firstName" autoComplete="given-name" required /></label>
                <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
                <label>Company<input name="company" autoComplete="organization" required /></label>
                <label>Business email<input name="email" type="email" autoComplete="email" required /></label>
                <label>Title<input name="title" autoComplete="organization-title" required /></label>
                <button type="submit">Let&apos;s Talk Growth</button>
              </form>
            )}
          </section>
        </div>
      )}
      {showGrowthPlan && (
        <aside
          ref={growthPlanPrompt}
          className={`growthPlanPrompt${growthPlanClosing ? " growthPlanPromptClosing" : ""}`}
          role="region"
          aria-labelledby="growth-plan-title"
          aria-describedby="growth-plan-description"
        >
          <button
            type="button"
            className="growthPlanClose"
            aria-label="Close Growth Plan request"
            onClick={dismissGrowthPlan}
          >
            ×
          </button>
          <div>
            <span className="eyebrow">Your next step</span>
            <h2 id="growth-plan-title">
              You have the model, now let&apos;s make the plan
            </h2>
            <p id="growth-plan-description">
              Tell us where to send your personalized Growth Plan.
            </p>
          </div>
          {growthPlanSubmitted ? (
            <p className="growthPlanSuccess" role="status">
              {growthPlanStatus}
            </p>
          ) : (
            <form onSubmit={requestGrowthPlan}>
              <label>
                First name
                <input
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <button className="primary" type="submit">
                Get my Growth Plan
              </button>
            </form>
          )}
        </aside>
      )}
      {isAgencyPage ? (
        <footer className="agencyFooter h-card">
          <div className="footerBrand">
            <a className="u-url p-name" href="/">GrowthCast</a>
          </div>
          <nav aria-label="GrowthCast links">
            <span title="Email address coming soon">Email Our Founder</span>
            <a href="https://linkedin.com/in/edwardjwhiteiii" target="_blank" rel="noreferrer">Connect With Our Founder</a>
            <span title="Social profile coming soon">Follow GrowthCast</span>
          </nav>
          <nav aria-label="Legal links">
            <button type="button" onClick={() => openLegalPage("terms")}>Terms</button>
            <button type="button" onClick={() => openLegalPage("privacy")}>Privacy</button>
          </nav>
        </footer>
      ) : (
        <footer>
          Made with Gratitude in Brooklyn, NY by GrowthCast
        </footer>
      )}
    </main>
  );
}
