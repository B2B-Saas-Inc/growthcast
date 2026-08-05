import { describe, expect, it } from 'vitest';
import type { ForecastMonth } from './forecast';
import { calculateBlendedCac, calculateMagicNumber, calculateNrr, cashFlowFor, defaultCashFlow } from './metrics';

const month = (iso: string, arr: number, endingMrr = arr / 12, newMrr = 100): ForecastMonth => ({
  month: iso, visitors: 0, signups: 0, newCustomers: 0, churnedCustomers: 0, customers: 0,
  newMrr, expansionMrr: 0, retractionMrr: 0, churnMrr: 0, endingMrr, arr, arpu: 0,
  ltv: null, maxCac: null, maxCostPerSignup: null,
});

describe('SaaS metrics', () => {
  it('calculates NRR from expansion, downgrade, and effective churn', () => {
    expect(calculateNrr(.018, .006, .057)).toBeCloseTo(.955);
  });

  it('compares ending ARR with three months earlier and includes three months of paid spend and overhead', () => {
    const projection = [
      month('2027-04', 1_203_496), month('2027-05', 1_330_000),
      month('2027-06', 1_470_000), month('2027-07', 1_609_707),
    ];
    expect(calculateMagicNumber(projection, projection.map(() => 50_000), 30_000)).toBeCloseTo(406_211 / 240_000);
  });

  it('returns unavailable without four months or quarterly spend', () => {
    expect(calculateMagicNumber([month('2027-05', 100), month('2027-06', 110), month('2027-07', 120)], [0, 0, 0], 0)).toBeNull();
    expect(calculateMagicNumber([month('2027-04', 90), month('2027-05', 100), month('2027-06', 110), month('2027-07', 120)], [0, 0, 0, 0], 0)).toBeNull();
  });

  it('includes monthly Sales & Marketing overhead in blended CAC', () => {
    expect(calculateBlendedCac(50_000, 30_000, 5_000, 100)).toBe(850);
    expect(calculateBlendedCac(50_000, 30_000, 5_000, 0)).toBe(0);
  });

  it('calculates cash collections, fees, refunds, and net cash', () => {
    const result = cashFlowFor(month('2026-08', 12000, 1000, 100), {
      ...defaultCashFlow, monthlyShare: .6, annualShare: .3, oneTimeEnabled: true, oneTimeShare: .1,
      feeRate: .03, refundRate: .02,
    });
    expect(result.monthlySubscriptions).toBe(600);
    expect(result.yearlySubscriptions).toBe(360);
    expect(result.oneTimePayments).toBe(120);
    expect(result.fees).toBe(-32.4);
    expect(result.refunds).toBe(-21.6);
    expect(result.netCash).toBe(1026);
  });
});
