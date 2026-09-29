import type { ChannelPreset } from "./channels";
/** D2C inputs are separate from subscription assumptions; all rates are monthly. */
export type EcommerceChannel = {
  name: string;
  model: "cpc" | "cpm" | "manual";
  goLiveMonth: number;
  spend: number;
  allocation?: number;
  hidden?: boolean;
  cpc: number;
  cpm: number;
  ctr: number;
  visitors: number;
  conversionRate: number;
  aov: number;
  commissionRate: number;
  spendOverrides: Record<string, number>;
};
export type EcommerceModel = {
  month: string;
  months: number;
  visitors: number;
  customers: number;
  trafficGrowth: number;
  conversionRate: number;
  aov: number;
  repeatRate: number;
  repeatOrders: number;
  repeatAov: number;
  grossMargin: number;
  fulfillmentCost: number;
  feeRate: number;
  refundRate: number;
  overhead: number;
  targetLtvCac: number;
  budgetGrowth: number;
  budget?: number;
  channelDefaults?: { conversionRate: number; aov: number };
  channels: EcommerceChannel[];
};
export const ecommerceDefaults = (): EcommerceModel => ({
  month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  months: 12,
  visitors: 0,
  customers: 0,
  trafficGrowth: 0,
  conversionRate: 0.02,
  aov: 75,
  repeatRate: 0,
  repeatOrders: 1,
  repeatAov: 75,
  grossMargin: 0.6,
  fulfillmentCost: 0,
  feeRate: 0,
  refundRate: 0,
  overhead: 0,
  targetLtvCac: 3,
  budgetGrowth: 0,
  channels: [],
});
export const validMonth = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
  Number(value.slice(0, 4)) >= 1900 &&
  Number(value.slice(0, 4)) <= 2200;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1e12;
export function validateEcommerce(input: unknown): EcommerceModel {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid D2C model");
  const value = input as EcommerceModel;
  if (value.budget !== undefined && !nonnegative(value.budget))
    throw new Error("Invalid D2C budget");
  if (
    value.channelDefaults !== undefined &&
    (!value.channelDefaults ||
      !nonnegative(value.channelDefaults.conversionRate) ||
      value.channelDefaults.conversionRate > 1 ||
      !nonnegative(value.channelDefaults.aov))
  )
    throw new Error("Invalid D2C channel defaults");
  const numericKeys = Object.keys(ecommerceDefaults()).filter(
    (key) => !["month", "channels"].includes(key),
  ) as (keyof EcommerceModel)[];
  if (
    !Number.isInteger(value.visitors) ||
    !Number.isInteger(value.customers) ||
    !validMonth(value.month) ||
    numericKeys.some((key) => !nonnegative(value[key])) ||
    !Number.isInteger(value.months) ||
    value.months < 1 ||
    value.months > 60 ||
    value.repeatOrders < 1 ||
    value.repeatOrders > 100 ||
    value.targetLtvCac <= 0 ||
    value.trafficGrowth > 1 ||
    value.budgetGrowth > 1 ||
    [
      "conversionRate",
      "repeatRate",
      "grossMargin",
      "feeRate",
      "refundRate",
    ].some((key) => Number(value[key as keyof EcommerceModel]) > 1)
  )
    throw new Error("Invalid D2C assumptions");
  if (!Array.isArray(value.channels) || value.channels.length > 100)
    throw new Error("Invalid D2C channels");
  const names = new Set<string>();
  for (const c of value.channels) {
    if (
      !c ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 120 ||
      names.has(c.name) ||
      !["cpc", "cpm", "manual"].includes(c.model) ||
      !Number.isInteger(c.goLiveMonth) ||
      c.goLiveMonth < 0 ||
      c.goLiveMonth > 60 ||
      [
        "spend",
        "cpc",
        "cpm",
        "ctr",
        "visitors",
        "conversionRate",
        "aov",
        "commissionRate",
      ].some((key) => !nonnegative(c[key as keyof EcommerceChannel])) ||
      (c.allocation !== undefined &&
        (!nonnegative(c.allocation) || c.allocation > 1)) ||
      (c.hidden !== undefined && typeof c.hidden !== "boolean") ||
      c.ctr > 1 ||
      c.conversionRate > 1 ||
      c.commissionRate > 1 ||
      !c.spendOverrides ||
      typeof c.spendOverrides !== "object" ||
      Array.isArray(c.spendOverrides) ||
      Object.entries(c.spendOverrides).some(
        ([month, spend]) => !validMonth(month) || !nonnegative(spend),
      )
    )
      throw new Error("Invalid D2C channel");
    names.add(c.name);
  }
  return structuredClone(value);
}
export type EcommerceFile = {
  schemaVersion: 4;
  businessModel: "d2c";
  modelName: string;
  ecommerce: EcommerceModel;
};
export function validateEcommerceFile(input: unknown): EcommerceFile {
  const v = input as EcommerceFile;
  if (
    !v ||
    v.schemaVersion !== 4 ||
    v.businessModel !== "d2c" ||
    typeof v.modelName !== "string" ||
    v.modelName.length > 120
  )
    throw new Error("Expected a version 4 D2C assumption file");
  return {
    schemaVersion: 4,
    businessModel: "d2c",
    modelName: v.modelName,
    ecommerce: validateEcommerce(v.ecommerce),
  };
}

/** Additive version-4 fields: old spend-based files retain their actual spending. */
export function ecommercePaidBudget(a: EcommerceModel) {
  return (
    a.budget ??
    a.channels.reduce(
      (sum, c) =>
        sum + (c.model !== "manual" && c.goLiveMonth > 0 ? c.spend : 0),
      0,
    )
  );
}
export function ecommerceChannelControls(a: EcommerceModel) {
  const budget = ecommercePaidBudget(a);
  return a.channels.map((c) => ({
    ...c,
    hidden: c.hidden ?? false,
    allocation:
      c.allocation ??
      (budget && c.model !== "manual" && c.goLiveMonth > 0
        ? c.spend / budget
        : 0),
  }));
}
export function setEcommercePaidBudget(
  a: EcommerceModel,
  budget: number,
): EcommerceModel {
  return {
    ...a,
    budget,
    channels: ecommerceChannelControls(a).map((c) => ({
      ...c,
      spend: c.model === "manual" ? c.spend : budget * c.allocation,
    })),
  };
}
export function addEcommerceChannel(
  a: EcommerceModel,
  preset: ChannelPreset,
): EcommerceModel {
  const channels = ecommerceChannelControls(a);
  const existing = channels.find((c) => c.name === preset.name);
  if (existing)
    return {
      ...a,
      channels: channels.map((c) =>
        c === existing ? { ...c, hidden: false } : c,
      ),
    };
  const budget = ecommercePaidBudget(a);
  const used = channels.reduce(
    (sum, c) =>
      sum + (c.model !== "manual" && c.goLiveMonth > 0 ? c.allocation : 0),
    0,
  );
  const allocation = preset.model === "manual" ? 0 : Math.max(0, 1 - used);
  const defaults = a.channelDefaults ?? {
    conversionRate: a.conversionRate,
    aov: a.aov,
  };
  return {
    ...a,
    budget,
    channels: [
      ...channels,
      {
        name: preset.name,
        model: preset.model,
        goLiveMonth: 1,
        spend: budget * allocation,
        allocation,
        hidden: false,
        cpc: preset.assumptions.cpc ?? 2,
        cpm: preset.assumptions.cpm ?? 20,
        ctr: preset.assumptions.ctr ?? 0.008,
        visitors: preset.assumptions.visitors ?? 0,
        ...defaults,
        commissionRate: preset.assumptions.affiliateCommissionRate ?? 0,
        spendOverrides: {},
      },
    ],
  };
}

export function ecommerceMonthSpend(
  a: EcommerceModel,
  channel: EcommerceChannel,
  month: string,
) {
  const offset =
    (Number(month.slice(0, 4)) - Number(a.month.slice(0, 4))) * 12 +
    Number(month.slice(5)) -
    Number(a.month.slice(5));
  return !channel.goLiveMonth || offset < channel.goLiveMonth
    ? 0
    : (channel.spendOverrides[month] ??
        channel.spend * (1 + a.budgetGrowth) ** (offset - 1));
}
function budgetMonths(a: EcommerceModel, from: string, future: boolean) {
  const [year, month] = a.month.split("-").map(Number);
  return Array.from({ length: a.months }, (_, i) => {
    const d = new Date(Date.UTC(year, month + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }).filter((month) => (future ? month >= from : month === from));
}
export function editEcommerceMonthBudget(
  a: EcommerceModel,
  from: string,
  total: number,
  future: boolean,
  selected?: string,
): EcommerceModel {
  const channels = structuredClone(a.channels);
  for (const month of budgetMonths(a, from, future)) {
    const live = channels.filter(
      (c) =>
        c.model !== "manual" &&
        c.goLiveMonth > 0 &&
        (() => {
          const offset =
            (Number(month.slice(0, 4)) - Number(a.month.slice(0, 4))) * 12 +
            Number(month.slice(5)) -
            Number(a.month.slice(5));
          return offset >= c.goLiveMonth;
        })(),
    );
    if (!live.length) continue;
    const values = live.map((c) => ecommerceMonthSpend(a, c, month));
    const currentTotal = values.reduce((sum, n) => sum + n, 0);
    if (selected) {
      const target = live.find((c) => c.name === selected);
      if (!target || live.length < 2) continue;
      const targetValue = Math.min(
        currentTotal,
        Math.max(0, Math.round(total / 100) * 100),
      );
      const others = live.filter((c) => c !== target);
      const otherTotal = others.reduce(
        (sum, c) => sum + ecommerceMonthSpend(a, c, month),
        0,
      );
      let remaining = currentTotal - targetValue;
      target.spendOverrides[month] = targetValue;
      others.forEach((c, i) => {
        const share = otherTotal
          ? ecommerceMonthSpend(a, c, month) / otherTotal
          : 1 / others.length;
        const value =
          i === others.length - 1
            ? remaining
            : Math.min(
                remaining,
                Math.round(((currentTotal - targetValue) * share) / 100) * 100,
              );
        c.spendOverrides[month] = value;
        remaining -= value;
      });
    } else {
      let remaining = Math.max(0, total);
      live.forEach((c, i) => {
        const value =
          i === live.length - 1
            ? remaining
            : Math.min(
                remaining,
                Math.round(
                  total *
                    (currentTotal
                      ? values[i] / currentTotal
                      : 1 / live.length) *
                    100,
                ) / 100,
              );
        c.spendOverrides[month] = value;
        remaining -= value;
      });
    }
  }
  return { ...a, channels };
}
