import { describe, expect, it } from 'vitest';
import type { ForecastMonth } from './forecast';
import { calculateMagicNumber, calculateNrr, cashFlowFor, defaultCashFlow } from './metrics';

const month = (iso: string, arr: number, endingMrr = arr / 12, newMrr = 100): ForecastMonth => ({
  month: iso, visitors: 0, signups: 0, newCustomers: 0, churnedCustomers: 0, customers: 0,
  newMrr, expansionMrr: 0, retractionMrr: 0, churnMrr: 0, endingMrr, arr, arpu: 0,
  ltv: null, maxCac: null, maxCostPerSignup: null,
});

describe('SaaS metrics', () => {
  it('calculates NRR from expansion, downgrade, and effective churn', () => {
    expect(calculateNrr(.018, .006, .057)).toBeCloseTo(.955);
  });

  it('uses two complete calendar quarters and includes monthly overhead in Magic Number spend', () => {
    const projection = [
      month('2026-08', 100), month('2026-09', 110),
      month('2026-10', 120), month('2026-11', 130), month('2026-12', 140),
      month('2027-01', 150), month('2027-02', 160), month('2027-03', 170),
      month('2027-04', 180),
    ];
    expect(calculateMagicNumber(projection, projection.map(() => 100), 50)).toBeCloseTo((170 - 140) * 4 / 450);
  });

  it('returns unavailable without two complete quarters or prior-quarter spend', () => {
    expect(calculateMagicNumber([month('2026-10', 100), month('2026-11', 110), month('2026-12', 120)], [0, 0, 0], 0)).toBeNull();
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
