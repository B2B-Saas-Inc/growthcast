export type Assumptions = {
  months: number; monthlyTrafficGrowth: number; signupRate: number;
  purchaseRate: number; voluntaryCustomerChurn: number; delinquentCustomerChurn: number;
  voluntaryRevenueChurn: number; delinquentRevenueChurn: number;
  expansionRate: number; retractionRate: number; newCustomerArpu: number;
  grossMargin: number; targetLtvCac: number; monthlyIncrementalVisitors: number;
}

export type ChannelAssumption = { name: string; visitors: number; goLiveMonth: number; signupRate: number; purchaseRate: number; arpu: number };

export type ForecastOverrides = { channelVisitors?: Record<string, Record<string, number>>; revenueChurn?: Record<string, number> };

export type ForecastMonth = {
  month: string; visitors: number; signups: number; newCustomers: number; churnedCustomers: number;
  customers: number; newMrr: number; expansionMrr: number; retractionMrr: number; churnMrr: number;
  endingMrr: number; arr: number; arpu: number; ltv: number; maxCac: number; maxCostPerSignup: number;
}

const addMonths = (iso: string, count: number) => {
  const [year, month] = iso.split('-').map(Number); const d = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const round = (n: number) => Math.round(n * 100) / 100;

export function forecast(start: { month: string; visitors: number; customers: number; mrr: number }, a: Assumptions, channelInputs: ChannelAssumption[] = [], overrides: ForecastOverrides = {}): ForecastMonth[] {
  let baselineVisitors = start.visitors, customers = start.customers, mrr = start.mrr;
  const channels = channelInputs.map(channel => ({ ...channel, activeVisitors: 0 }));
  return Array.from({ length: a.months }, (_, i) => {
    const month = addMonths(start.month, i + 1);
    baselineVisitors = baselineVisitors * (1 + a.monthlyTrafficGrowth) + a.monthlyIncrementalVisitors;
    const channelTotals = channels.reduce((totals, channel) => {
      channel.activeVisitors = overrides.channelVisitors?.[month]?.[channel.name] ?? (i + 1 === channel.goLiveMonth ? channel.visitors : channel.activeVisitors * (1 + a.monthlyTrafficGrowth));
      const signups = channel.activeVisitors * channel.signupRate;
      const newCustomers = signups * channel.purchaseRate;
      return { visitors: totals.visitors + channel.activeVisitors, signups: totals.signups + signups, newCustomers: totals.newCustomers + newCustomers, newMrr: totals.newMrr + newCustomers * channel.arpu };
    }, { visitors: 0, signups: 0, newCustomers: 0, newMrr: 0 });
    const visitors = baselineVisitors + channelTotals.visitors;
    const signups = baselineVisitors * a.signupRate + channelTotals.signups;
    const newCustomers = baselineVisitors * a.signupRate * a.purchaseRate + channelTotals.newCustomers;
    const churnedCustomers = customers * (a.voluntaryCustomerChurn + a.delinquentCustomerChurn);
    const newMrr = baselineVisitors * a.signupRate * a.purchaseRate * a.newCustomerArpu + channelTotals.newMrr;
    const expansionMrr = mrr * a.expansionRate;
    const retractionMrr = mrr * a.retractionRate;
    const revenueChurn = overrides.revenueChurn?.[month] ?? (a.voluntaryRevenueChurn + a.delinquentRevenueChurn);
    const churnMrr = mrr * revenueChurn;
    customers = Math.max(0, customers + newCustomers - churnedCustomers);
    mrr = Math.max(0, mrr + newMrr + expansionMrr - retractionMrr - churnMrr);
    const arpu = customers ? mrr / customers : 0;
    const ltv = revenueChurn ? arpu / revenueChurn : 0;
    const maxCac = ltv * a.grossMargin / a.targetLtvCac;
    return { month, visitors: Math.round(visitors), signups: Math.round(signups), newCustomers: Math.round(newCustomers), churnedCustomers: Math.round(churnedCustomers), customers: Math.round(customers), newMrr: round(newMrr), expansionMrr: round(expansionMrr), retractionMrr: round(retractionMrr), churnMrr: round(churnMrr), endingMrr: round(mrr), arr: round(mrr * 12), arpu: round(arpu), ltv: round(ltv), maxCac: round(maxCac), maxCostPerSignup: round(maxCac * a.purchaseRate) };
  });
}
