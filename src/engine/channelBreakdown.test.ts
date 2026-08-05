import { describe, expect, it } from 'vitest';
import { calculateChannelBreakdown, type BreakdownChannel } from './channelBreakdown';
import { forecast, type Assumptions } from './forecast';

const assumptions: Assumptions = { months: 2, monthlyTrafficGrowth: 0, signupRate: .1, purchaseRate: .1, voluntaryCustomerChurn: .02, delinquentCustomerChurn: .01, voluntaryRevenueChurn: .02, delinquentRevenueChurn: .01, expansionRate: .01, retractionRate: .005, newCustomerArpu: 40, grossMargin: .8, targetLtvCac: 3, monthlyIncrementalVisitors: 0, monthlySalesMarketingOverhead: 0 };
const channels: BreakdownChannel[] = [
  { name: 'Branded Search', model: 'cpc', visitors: 100, goLiveMonth: 1, signupRate: .2, purchaseRate: .1, arpu: 60 },
  { name: 'YouTube', model: 'cpm', visitors: 200, goLiveMonth: 2, signupRate: .1, purchaseRate: .2, arpu: 80 },
  { name: 'Enterprise / B2B', model: 'manual', visitors: 10, goLiveMonth: 1, signupRate: .5, purchaseRate: .2, arpu: 1000 },
  { name: 'Disabled', model: 'cpc', visitors: 999, goLiveMonth: 0, signupRate: 1, purchaseRate: 1, arpu: 999 },
];
const start = { month: '2026-07', visitors: 1000, customers: 100, mrr: 4000 };

describe('channel breakdown', () => {
  it('groups launched channels and excludes disabled and future channels', () => {
    const result = calculateChannelBreakdown(start, assumptions, channels);
    expect(result[0].categories.map(category => category.name)).toEqual(['Baseline / Existing Business', 'Direct Response', 'Owned / Partner / Custom']);
    expect(result[0].categories.flatMap(category => category.channels.map(channel => channel.name))).not.toContain('YouTube');
    expect(result[1].categories.flatMap(category => category.channels.map(channel => channel.name))).toContain('YouTube');
    expect(result[1].categories.flatMap(category => category.channels.map(channel => channel.name))).not.toContain('Disabled');
  });

  it('reconciles every monthly subtotal to the forecast', () => {
    const projection = forecast(start, assumptions, channels);
    const breakdown = calculateChannelBreakdown(start, assumptions, channels);
    breakdown.forEach((month, index) => {
      const totals = month.categories.map(category => category.total);
      expect(totals.reduce((sum, row) => sum + row.visitors, 0)).toBeCloseTo(projection[index].visitors, 0);
      expect(totals.reduce((sum, row) => sum + row.signups, 0)).toBeCloseTo(projection[index].signups, 0);
      expect(totals.reduce((sum, row) => sum + row.newCustomers, 0)).toBeCloseTo(projection[index].newCustomers, 0);
      expect(totals.reduce((sum, row) => sum + row.customers, 0)).toBeCloseTo(projection[index].customers, 0);
      expect(totals.reduce((sum, row) => sum + row.endingMrr, 0)).toBeCloseTo(projection[index].endingMrr, 1);
      expect(totals.reduce((sum, row) => sum + row.arr, 0)).toBeCloseTo(projection[index].arr, 0);
    });
  });

  it('uses each channel ARPU and funnel for acquisition thresholds', () => {
    const first = calculateChannelBreakdown(start, assumptions, channels)[0];
    const enterprise = first.categories.flatMap(category => category.channels).find(channel => channel.name === 'Enterprise / B2B')!;
    expect(enterprise.arpu).toBeGreaterThan(100);
    expect(enterprise.maxCac).toBeCloseTo(1000 / .03 * .8 / 3);
    expect(enterprise.maxCostPerSignup).toBeCloseTo(enterprise.maxCac! * .2);
  });
});
