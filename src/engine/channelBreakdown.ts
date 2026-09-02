import {
  delayedConversionShares,
  forecast,
  type Assumptions,
  type ChannelAssumption,
  type ForecastOverrides,
} from "./forecast";

export type BreakdownChannel = ChannelAssumption & {
  model: "manual" | "cpc" | "cpm";
};
export type ChannelBreakdownRow = {
  name: string;
  visitors: number;
  signups: number;
  mqls: number;
  sqls: number;
  newCustomers: number;
  customers: number;
  arpu: number;
  endingMrr: number;
  arr: number;
  maxCac: number | null;
  maxCostPerSignup: number | null;
  maxCostPerMql: number | null;
};
export type ChannelBreakdownCategory = {
  name: string;
  total: ChannelBreakdownRow;
  channels: ChannelBreakdownRow[];
};
export type ChannelMonthBreakdown = {
  month: string;
  categories: ChannelBreakdownCategory[];
};

type SegmentState = {
  customers: number;
  mrr: number;
  activeVisitors: number;
  pendingCustomers: number[];
  pendingMrr: number[];
};
type SegmentMonth = ChannelBreakdownRow & {
  newMrr: number;
  purchaseRate: number;
  potentialCustomers: number;
};

const addMonths = (iso: string, count: number) => {
  const [year, month] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

function advanceSegment(
  name: string,
  state: SegmentState,
  month: string,
  monthIndex: number,
  visitors: number,
  signupRate: number,
  purchaseRate: number,
  newCustomerArpu: number,
  assumptions: Assumptions,
  revenueChurn: number,
): SegmentMonth {
  const isB2b = assumptions.businessModel === "b2b";
  const mqlRate = isB2b ? signupRate : 0;
  const sqlRate = isB2b ? (assumptions.sqlRate ?? 1) : 0;
  const closeRate = isB2b ? purchaseRate : 0;
  const signups = isB2b ? 0 : visitors * signupRate;
  const mqls = isB2b ? visitors * mqlRate : 0;
  const sqls = isB2b ? mqls * sqlRate : 0;
  const potentialCustomers = isB2b ? sqls * closeRate : signups * purchaseRate;
  const shares = delayedConversionShares(
    month,
    isB2b ? (assumptions.dealCycleDays ?? 0) : assumptions.daysToUpgrade,
    assumptions.months - monthIndex,
  );
  shares.forEach((share, offset) => {
    state.pendingCustomers[monthIndex + offset] += potentialCustomers * share;
    state.pendingMrr[monthIndex + offset] +=
      potentialCustomers * newCustomerArpu * share;
  });
  const pendingCustomerCount = state.pendingCustomers[monthIndex];
  const newCustomers = isB2b
    ? Math.round(pendingCustomerCount)
    : pendingCustomerCount;
  const newMrr =
    isB2b && pendingCustomerCount
      ? newCustomers * (state.pendingMrr[monthIndex] / pendingCustomerCount)
      : state.pendingMrr[monthIndex];
  const churnedCustomers = Math.min(
    state.customers,
    Math.round(
      state.customers *
        (assumptions.voluntaryCustomerChurn +
          assumptions.delinquentCustomerChurn),
    ),
  );
  const churnMrr = isB2b
    ? Math.min(
        state.mrr,
        newCustomerArpu
          ? Math.round((state.mrr * revenueChurn) / newCustomerArpu) *
              newCustomerArpu
          : 0,
      )
    : state.mrr * revenueChurn;
  state.customers = Math.max(0, state.customers + newCustomers - churnedCustomers);
  state.mrr = Math.max(
    0,
    state.mrr +
      newMrr +
      state.mrr * assumptions.expansionRate -
      state.mrr * assumptions.retractionRate -
      churnMrr,
  );
  const arpu = state.customers ? state.mrr / state.customers : 0;
  const acquisitionArpu = newCustomers ? newMrr / newCustomers : null;
  const ltv = revenueChurn && acquisitionArpu !== null
    ? acquisitionArpu / revenueChurn
    : null;
  const maxCac =
    ltv === null || !assumptions.targetLtvCac
      ? null
      : (ltv * assumptions.grossMargin) / assumptions.targetLtvCac;
  const leadVolume = isB2b ? mqls : signups;
  return {
    name,
    visitors,
    signups,
    mqls,
    sqls,
    newCustomers,
    customers: state.customers,
    arpu,
    endingMrr: state.mrr,
    arr: state.mrr * 12,
    maxCac,
    maxCostPerSignup:
      maxCac === null || isB2b || !leadVolume
        ? null
        : maxCac * purchaseRate,
    maxCostPerMql:
      maxCac === null || !isB2b || !leadVolume
        ? null
        : maxCac * sqlRate * closeRate,
    newMrr,
    purchaseRate,
    potentialCustomers,
  };
}

function subtotal(
  name: string,
  rows: SegmentMonth[],
  assumptions: Assumptions,
  revenueChurn: number,
): ChannelBreakdownRow {
  const visitors = rows.reduce((sum, row) => sum + row.visitors, 0);
  const signups = rows.reduce((sum, row) => sum + row.signups, 0);
  const mqls = rows.reduce((sum, row) => sum + row.mqls, 0);
  const sqls = rows.reduce((sum, row) => sum + row.sqls, 0);
  const newCustomers = rows.reduce((sum, row) => sum + row.newCustomers, 0);
  const customers = rows.reduce((sum, row) => sum + row.customers, 0);
  const endingMrr = rows.reduce((sum, row) => sum + row.endingMrr, 0);
  const potentialCustomers = rows.reduce(
    (sum, row) => sum + row.potentialCustomers,
    0,
  );
  const newMrr = rows.reduce((sum, row) => sum + row.newMrr, 0);
  const acquisitionArpu = newCustomers ? newMrr / newCustomers : null;
  const maxCac =
    revenueChurn && acquisitionArpu !== null && assumptions.targetLtvCac
      ? ((acquisitionArpu / revenueChurn) * assumptions.grossMargin) /
        assumptions.targetLtvCac
      : null;
  const leadVolume = assumptions.businessModel === "b2b" ? mqls : signups;
  const purchaseRate = leadVolume ? potentialCustomers / leadVolume : 0;
  return {
    name,
    visitors,
    signups,
    mqls,
    sqls,
    newCustomers,
    customers,
    arpu: customers ? endingMrr / customers : 0,
    endingMrr,
    arr: endingMrr * 12,
    maxCac,
    maxCostPerSignup:
      maxCac === null || assumptions.businessModel === "b2b" || !leadVolume
        ? null
        : maxCac * purchaseRate,
    maxCostPerMql:
      maxCac === null || assumptions.businessModel !== "b2b" || !leadVolume
        ? null
        : maxCac * purchaseRate,
  };
}

export function calculateChannelBreakdown(
  start: { month: string; visitors: number; customers: number; mrr: number },
  assumptions: Assumptions,
  channels: BreakdownChannel[],
  overrides: ForecastOverrides = {},
): ChannelMonthBreakdown[] {
  let baselineVisitors = start.visitors;
  const emptyPending = () =>
    Array.from({ length: assumptions.months }, () => 0);
  const baselineState: SegmentState = {
    customers: start.customers,
    mrr: start.mrr,
    activeVisitors: 0,
    pendingCustomers: emptyPending(),
    pendingMrr: emptyPending(),
  };
  const channelStates = new Map(
    channels.map((channel) => [
      channel.name,
      {
        customers: 0,
        mrr: 0,
        activeVisitors: 0,
        pendingCustomers: emptyPending(),
        pendingMrr: emptyPending(),
      } satisfies SegmentState,
    ]),
  );
  const parentProjection = forecast(start, assumptions, channels, overrides);
  const categoryFor = (model: BreakdownChannel["model"]) =>
    model === "cpc"
      ? "Direct Response"
      : model === "cpm"
        ? "Demand Gen"
        : "Owned / Partner / Custom";
  const categoryOrder = [
    "Baseline / Existing Business",
    "Direct Response",
    "Demand Gen",
    "Owned / Partner / Custom",
  ];

  return Array.from({ length: assumptions.months }, (_, index) => {
    const month = addMonths(start.month, index + 1);
    const revenueChurn =
      overrides.revenueChurn?.[month] ??
      assumptions.voluntaryRevenueChurn + assumptions.delinquentRevenueChurn;
    baselineVisitors =
      baselineVisitors * (1 + assumptions.monthlyTrafficGrowth) +
      assumptions.monthlyIncrementalVisitors;
    const baseline = advanceSegment(
      "Baseline / existing business",
      baselineState,
      month,
      index,
      baselineVisitors,
      assumptions.businessModel === "b2b"
        ? (assumptions.mqlRate ?? assumptions.signupRate)
        : assumptions.signupRate,
      assumptions.businessModel === "b2b"
        ? (assumptions.closeRate ?? assumptions.purchaseRate)
        : assumptions.purchaseRate,
      assumptions.businessModel === "b2b"
        ? (assumptions.acv ?? assumptions.newCustomerArpu * 12) / 12
        : assumptions.newCustomerArpu,
      assumptions,
      revenueChurn,
    );
    const groups = new Map<string, SegmentMonth[]>([
      ["Baseline / Existing Business", [baseline]],
    ]);

    channels.forEach((channel) => {
      if (channel.goLiveMonth === 0 || index + 1 < channel.goLiveMonth) return;
      const state = channelStates.get(channel.name)!;
      const adjustment = overrides.channelVisitors?.[month]?.[channel.name];
      const compoundedVisitors =
        state.activeVisitors * (1 + assumptions.monthlyTrafficGrowth);
      state.activeVisitors =
        adjustment === undefined
          ? index + 1 === channel.goLiveMonth
            ? channel.visitors
            : compoundedVisitors
          : Math.max(0, compoundedVisitors + adjustment);
      const row = advanceSegment(
        channel.name,
        state,
        month,
        index,
        state.activeVisitors,
        assumptions.businessModel === "b2b"
          ? (channel.mqlRate ?? assumptions.mqlRate ?? channel.signupRate)
          : channel.signupRate,
        assumptions.businessModel === "b2b"
          ? (channel.closeRate ?? assumptions.closeRate ?? channel.purchaseRate)
          : channel.purchaseRate,
        assumptions.businessModel === "b2b"
          ? (channel.acv ?? assumptions.acv ?? channel.arpu * 12) / 12
          : channel.arpu,
        assumptions.businessModel === "b2b" && channel.sqlRate !== undefined
          ? { ...assumptions, sqlRate: channel.sqlRate }
          : assumptions,
        revenueChurn,
      );
      const category = categoryFor(channel.model);
      groups.set(category, [...(groups.get(category) || []), row]);
    });

    const parent = parentProjection[index];
    const allRows = [...groups.values()].flat();
    const customerDelta =
      parent.customers - allRows.reduce((sum, row) => sum + row.customers, 0);
    const newCustomerDelta =
      parent.newCustomers -
      allRows.reduce((sum, row) => sum + row.newCustomers, 0);
    const mrrDelta =
      parent.endingMrr -
      allRows.reduce((sum, row) => sum + row.endingMrr, 0);
    baseline.customers += customerDelta;
    baseline.newCustomers += newCustomerDelta;
    baseline.endingMrr += mrrDelta;
    baseline.arr = baseline.endingMrr * 12;
    baseline.arpu = baseline.customers
      ? baseline.endingMrr / baseline.customers
      : 0;
    baselineState.customers += customerDelta;
    baselineState.mrr += mrrDelta;

    return {
      month,
      categories: categoryOrder
        .filter((name) => groups.has(name))
        .map((name) => {
          const rows = groups.get(name)!;
          return {
            name,
            total: subtotal(name, rows, assumptions, revenueChurn),
            channels: rows,
          };
        }),
    };
  });
}
