export type Assumptions = {
  months: number;
  monthlyTrafficGrowth: number;
  signupRate: number;
  purchaseRate: number;
  voluntaryCustomerChurn: number;
  delinquentCustomerChurn: number;
  voluntaryRevenueChurn: number;
  delinquentRevenueChurn: number;
  expansionRate: number;
  retractionRate: number;
  newCustomerArpu: number;
  grossMargin: number;
  targetLtvCac: number;
  daysToUpgrade: number;
  monthlyIncrementalVisitors: number;
  monthlySalesMarketingOverhead: number;
  businessModel?: "b2c" | "b2b";
  mqlRate?: number;
  sqlRate?: number;
  closeRate?: number;
  dealCycleDays?: number;
  acv?: number;
};

export type ChannelAssumption = {
  name: string;
  visitors: number;
  goLiveMonth: number;
  signupRate: number;
  purchaseRate: number;
  arpu: number;
  mqlRate?: number;
  sqlRate?: number;
  closeRate?: number;
  acv?: number;
};

export type ForecastOverrides = {
  channelVisitors?: Record<string, Record<string, number>>;
  revenueChurn?: Record<string, number>;
};

export type ForecastMonth = {
  month: string;
  visitors: number;
  signups: number;
  mqls: number;
  sqls: number;
  newCustomers: number;
  churnedCustomers: number;
  customers: number;
  newMrr: number;
  expansionMrr: number;
  retractionMrr: number;
  churnMrr: number;
  endingMrr: number;
  arr: number;
  arpu: number;
  acquisitionArpu: number | null;
  ltv: number | null;
  maxCac: number | null;
  maxCostPerSignup: number | null;
  maxCostPerMql: number | null;
  churnedCustomerArpu: number | null;
  churnedArpuRatio: number | null;
};

const addMonths = (iso: string, count: number) => {
  const [year, month] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const round = (n: number) => Math.round(n * 100) / 100;
const roundRate = (n: number) => Math.round(n * 10000) / 10000;

export function delayedConversionShares(
  sourceMonth: string,
  delayDays: number,
  maxOffsets: number,
): number[] {
  const [year, month] = sourceMonth.split("-").map(Number);
  const sourceStart = Date.UTC(year, month - 1, 1);
  const sourceEnd = Date.UTC(year, month, 1);
  const sourceDays = (sourceEnd - sourceStart) / 86400000;
  const shiftedStart = sourceStart + Math.max(0, delayDays) * 86400000;
  const shiftedEnd = sourceEnd + Math.max(0, delayDays) * 86400000;
  return Array.from({ length: maxOffsets }, (_, offset) => {
    const targetStart = Date.UTC(year, month - 1 + offset, 1);
    const targetEnd = Date.UTC(year, month + offset, 1);
    return (
      Math.max(
        0,
        Math.min(shiftedEnd, targetEnd) - Math.max(shiftedStart, targetStart),
      ) /
      86400000 /
      sourceDays
    );
  });
}

export function forecast(
  start: { month: string; visitors: number; customers: number; mrr: number },
  a: Assumptions,
  channelInputs: ChannelAssumption[] = [],
  overrides: ForecastOverrides = {},
): ForecastMonth[] {
  const isB2b = a.businessModel === "b2b";
  const baselineMqlRate = a.mqlRate ?? a.signupRate;
  const baselineSqlRate = a.sqlRate ?? 1;
  const baselineCloseRate = a.closeRate ?? a.purchaseRate;
  const baselineAcv = a.acv ?? a.newCustomerArpu * 12;
  let baselineVisitors = start.visitors,
    customers = start.customers,
    mrr = start.mrr;
  const channels = channelInputs.map((channel) => ({
    ...channel,
    activeVisitors: 0,
  }));
  const pendingCustomers = Array.from({ length: a.months }, () => 0);
  const pendingMrr = Array.from({ length: a.months }, () => 0);
  return Array.from({ length: a.months }, (_, i) => {
    const month = addMonths(start.month, i + 1);
    baselineVisitors =
      baselineVisitors * (1 + a.monthlyTrafficGrowth) +
      a.monthlyIncrementalVisitors;
    const channelTotals = channels.reduce(
      (totals, channel) => {
        if (channel.goLiveMonth === 0 || i + 1 < channel.goLiveMonth) {
          channel.activeVisitors = 0;
          return totals;
        }
        const visitorAdjustment =
          overrides.channelVisitors?.[month]?.[channel.name];
        const compoundedVisitors =
          channel.activeVisitors * (1 + a.monthlyTrafficGrowth);
        channel.activeVisitors =
          visitorAdjustment === undefined
            ? i + 1 === channel.goLiveMonth
              ? channel.visitors
              : compoundedVisitors
            : Math.max(0, compoundedVisitors + visitorAdjustment);
        const signups = isB2b ? 0 : channel.activeVisitors * channel.signupRate;
        const mqls = isB2b
          ? channel.activeVisitors * (channel.mqlRate ?? baselineMqlRate)
          : 0;
        const sqls = isB2b ? mqls * (channel.sqlRate ?? baselineSqlRate) : 0;
        const newCustomers = isB2b
          ? sqls * (channel.closeRate ?? baselineCloseRate)
          : signups * channel.purchaseRate;
        const monthlyValue = isB2b
          ? (channel.acv ?? baselineAcv) / 12
          : channel.arpu;
        return {
          visitors: totals.visitors + channel.activeVisitors,
          signups: totals.signups + signups,
          mqls: totals.mqls + mqls,
          sqls: totals.sqls + sqls,
          newCustomers: totals.newCustomers + newCustomers,
          newMrr: totals.newMrr + newCustomers * monthlyValue,
        };
      },
      { visitors: 0, signups: 0, mqls: 0, sqls: 0, newCustomers: 0, newMrr: 0 },
    );
    const visitors = baselineVisitors + channelTotals.visitors;
    const signups = isB2b
      ? 0
      : baselineVisitors * a.signupRate + channelTotals.signups;
    const mqls = isB2b
      ? baselineVisitors * baselineMqlRate + channelTotals.mqls
      : 0;
    const sqls = isB2b
      ? baselineVisitors * baselineMqlRate * baselineSqlRate +
        channelTotals.sqls
      : 0;
    const potentialCustomers = isB2b
      ? baselineVisitors *
          baselineMqlRate *
          baselineSqlRate *
          baselineCloseRate +
        channelTotals.newCustomers
      : baselineVisitors * a.signupRate * a.purchaseRate +
        channelTotals.newCustomers;
    const potentialMrr = isB2b
      ? (baselineVisitors *
          baselineMqlRate *
          baselineSqlRate *
          baselineCloseRate *
          baselineAcv) /
          12 +
        channelTotals.newMrr
      : baselineVisitors * a.signupRate * a.purchaseRate * a.newCustomerArpu +
        channelTotals.newMrr;
    const shares = delayedConversionShares(
      month,
      isB2b ? (a.dealCycleDays ?? 0) : a.daysToUpgrade,
      a.months - i,
    );
    shares.forEach((share, offset) => {
      pendingCustomers[i + offset] += potentialCustomers * share;
      pendingMrr[i + offset] += potentialMrr * share;
    });
    const pendingCustomerCount = pendingCustomers[i];
    const newCustomers = isB2b
      ? Math.round(pendingCustomerCount)
      : pendingCustomerCount;
    const newMrr =
      isB2b && pendingCustomerCount
        ? newCustomers * (pendingMrr[i] / pendingCustomerCount)
        : pendingMrr[i];
    const openingArpu = customers ? mrr / customers : 0;
    const churnedCustomers = Math.min(
      customers,
      Math.round(
        customers *
          (a.voluntaryCustomerChurn + a.delinquentCustomerChurn),
      ),
    );
    const expansionMrr = mrr * a.expansionRate;
    const retractionMrr = mrr * a.retractionRate;
    const revenueChurn =
      overrides.revenueChurn?.[month] ??
      a.voluntaryRevenueChurn + a.delinquentRevenueChurn;
    const monthlyContractValue = baselineAcv / 12;
    const churnMrr = isB2b
      ? Math.min(
          mrr,
          monthlyContractValue
            ? Math.round((mrr * revenueChurn) / monthlyContractValue) *
                monthlyContractValue
            : 0,
        )
      : mrr * revenueChurn;
    const churnedCustomerArpu = churnedCustomers
      ? churnMrr / churnedCustomers
      : null;
    const churnedArpuRatio =
      churnedCustomerArpu !== null && openingArpu
        ? churnedCustomerArpu / openingArpu
        : null;
    customers = Math.max(0, customers + newCustomers - churnedCustomers);
    mrr = Math.max(0, mrr + newMrr + expansionMrr - retractionMrr - churnMrr);
    const arpu = customers ? mrr / customers : 0;
    const acquisitionArpu = newCustomers ? newMrr / newCustomers : null;
    const ltv =
      revenueChurn && acquisitionArpu !== null
        ? acquisitionArpu / revenueChurn
        : null;
    const maxCac =
      ltv === null || !a.targetLtvCac
        ? null
        : (ltv * a.grossMargin) / a.targetLtvCac;
    const leadVolume = isB2b ? mqls : signups;
    const conversionAfterLead = leadVolume
      ? potentialCustomers / leadVolume
      : 0;
    const maxCostPerLead =
      maxCac === null || !leadVolume
        ? null
        : round(maxCac * conversionAfterLead);
    return {
      month,
      visitors: Math.round(visitors),
      signups: Math.round(signups),
      mqls: Math.round(mqls),
      sqls: Math.round(sqls),
      newCustomers: Math.round(newCustomers),
      churnedCustomers: Math.round(churnedCustomers),
      customers: Math.round(customers),
      newMrr: round(newMrr),
      expansionMrr: round(expansionMrr),
      retractionMrr: round(retractionMrr),
      churnMrr: round(churnMrr),
      endingMrr: round(mrr),
      arr: round(mrr * 12),
      arpu: round(arpu),
      acquisitionArpu: acquisitionArpu === null ? null : round(acquisitionArpu),
      ltv: ltv === null ? null : round(ltv),
      maxCac: maxCac === null ? null : round(maxCac),
      maxCostPerSignup: isB2b ? null : maxCostPerLead,
      maxCostPerMql: isB2b ? maxCostPerLead : null,
      churnedCustomerArpu:
        churnedCustomerArpu === null ? null : round(churnedCustomerArpu),
      churnedArpuRatio:
        churnedArpuRatio === null ? null : roundRate(churnedArpuRatio),
    };
  });
}
