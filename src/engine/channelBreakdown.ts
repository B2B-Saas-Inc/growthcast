import type { Assumptions, ChannelAssumption, ForecastOverrides } from './forecast';

export type BreakdownChannel = ChannelAssumption & { model: 'manual' | 'cpc' | 'cpm' };
export type ChannelBreakdownRow = {
  name: string;
  visitors: number;
  signups: number;
  newCustomers: number;
  customers: number;
  arpu: number;
  endingMrr: number;
  arr: number;
  maxCac: number | null;
  maxCostPerSignup: number | null;
};
export type ChannelBreakdownCategory = { name: string; total: ChannelBreakdownRow; channels: ChannelBreakdownRow[] };
export type ChannelMonthBreakdown = { month: string; categories: ChannelBreakdownCategory[] };

type SegmentState = { customers: number; mrr: number; activeVisitors: number };
type SegmentMonth = ChannelBreakdownRow & { newMrr: number; purchaseRate: number };

const addMonths = (iso: string, count: number) => {
  const [year, month] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

function advanceSegment(name: string, state: SegmentState, visitors: number, signupRate: number, purchaseRate: number, newCustomerArpu: number, assumptions: Assumptions, revenueChurn: number): SegmentMonth {
  const signups = visitors * signupRate;
  const newCustomers = signups * purchaseRate;
  const newMrr = newCustomers * newCustomerArpu;
  state.customers = Math.max(0, state.customers + newCustomers - state.customers * (assumptions.voluntaryCustomerChurn + assumptions.delinquentCustomerChurn));
  state.mrr = Math.max(0, state.mrr + newMrr + state.mrr * assumptions.expansionRate - state.mrr * assumptions.retractionRate - state.mrr * revenueChurn);
  const arpu = state.customers ? state.mrr / state.customers : 0;
  const ltv = revenueChurn ? newCustomerArpu / revenueChurn : null;
  const maxCac = ltv === null || !assumptions.targetLtvCac ? null : ltv * assumptions.grossMargin / assumptions.targetLtvCac;
  return { name, visitors, signups, newCustomers, customers: state.customers, arpu, endingMrr: state.mrr, arr: state.mrr * 12, maxCac, maxCostPerSignup: maxCac === null ? null : maxCac * purchaseRate, newMrr, purchaseRate };
}

function subtotal(name: string, rows: SegmentMonth[], assumptions: Assumptions, revenueChurn: number): ChannelBreakdownRow {
  const visitors = rows.reduce((sum, row) => sum + row.visitors, 0);
  const signups = rows.reduce((sum, row) => sum + row.signups, 0);
  const newCustomers = rows.reduce((sum, row) => sum + row.newCustomers, 0);
  const customers = rows.reduce((sum, row) => sum + row.customers, 0);
  const endingMrr = rows.reduce((sum, row) => sum + row.endingMrr, 0);
  const newMrr = rows.reduce((sum, row) => sum + row.newMrr, 0);
  const acquisitionArpu = newCustomers ? newMrr / newCustomers : null;
  const maxCac = revenueChurn && acquisitionArpu !== null && assumptions.targetLtvCac ? acquisitionArpu / revenueChurn * assumptions.grossMargin / assumptions.targetLtvCac : null;
  const purchaseRate = signups ? newCustomers / signups : 0;
  return { name, visitors, signups, newCustomers, customers, arpu: customers ? endingMrr / customers : 0, endingMrr, arr: endingMrr * 12, maxCac, maxCostPerSignup: maxCac === null ? null : maxCac * purchaseRate };
}

export function calculateChannelBreakdown(start: { month: string; visitors: number; customers: number; mrr: number }, assumptions: Assumptions, channels: BreakdownChannel[], overrides: ForecastOverrides = {}): ChannelMonthBreakdown[] {
  let baselineVisitors = start.visitors;
  const baselineState: SegmentState = { customers: start.customers, mrr: start.mrr, activeVisitors: 0 };
  const channelStates = new Map(channels.map(channel => [channel.name, { customers: 0, mrr: 0, activeVisitors: 0 } satisfies SegmentState]));
  const categoryFor = (model: BreakdownChannel['model']) => model === 'cpc' ? 'Direct Response' : model === 'cpm' ? 'Demand Gen' : 'Owned / Partner / Custom';
  const categoryOrder = ['Baseline / Existing Business', 'Direct Response', 'Demand Gen', 'Owned / Partner / Custom'];

  return Array.from({ length: assumptions.months }, (_, index) => {
    const month = addMonths(start.month, index + 1);
    const revenueChurn = overrides.revenueChurn?.[month] ?? assumptions.voluntaryRevenueChurn + assumptions.delinquentRevenueChurn;
    baselineVisitors = baselineVisitors * (1 + assumptions.monthlyTrafficGrowth) + assumptions.monthlyIncrementalVisitors;
    const baseline = advanceSegment('Baseline / existing business', baselineState, baselineVisitors, assumptions.signupRate, assumptions.purchaseRate, assumptions.newCustomerArpu, assumptions, revenueChurn);
    const groups = new Map<string, SegmentMonth[]>([['Baseline / Existing Business', [baseline]]]);

    channels.forEach(channel => {
      if (channel.goLiveMonth === 0 || index + 1 < channel.goLiveMonth) return;
      const state = channelStates.get(channel.name)!;
      const adjustment = overrides.channelVisitors?.[month]?.[channel.name];
      const compoundedVisitors = state.activeVisitors * (1 + assumptions.monthlyTrafficGrowth);
      state.activeVisitors = adjustment === undefined ? (index + 1 === channel.goLiveMonth ? channel.visitors : compoundedVisitors) : Math.max(0, compoundedVisitors + adjustment);
      const row = advanceSegment(channel.name, state, state.activeVisitors, channel.signupRate, channel.purchaseRate, channel.arpu, assumptions, revenueChurn);
      const category = categoryFor(channel.model);
      groups.set(category, [...(groups.get(category) || []), row]);
    });

    return {
      month,
      categories: categoryOrder.filter(name => groups.has(name)).map(name => {
        const rows = groups.get(name)!;
        return { name, total: subtotal(name, rows, assumptions, revenueChurn), channels: rows };
      }),
    };
  });
}
