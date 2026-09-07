import { describe, expect, it } from "vitest";
import type { ForecastMonth } from "./forecast";
import {
  calculateBlendedCac,
  calculateMagicNumber,
  calculateNrr,
  calculatePaybackPeriod,
  calculatePredictedLtv,
  cashFlowFor,
  defaultCashFlow,
} from "./metrics";

const month = (
  iso: string,
  arr: number,
  endingMrr = arr / 12,
  newMrr = 100,
): ForecastMonth => ({
  month: iso,
  visitors: 0,
  signups: 0,
  mqls: 0,
  sqls: 0,
  newCustomers: 0,
  churnedCustomers: 0,
  customers: 0,
  newMrr,
  expansionMrr: 0,
  retractionMrr: 0,
  churnMrr: 0,
  endingMrr,
  arr,
  arpu: 0,
  acquisitionArpu: null,
  ltv: null,
  maxCac: null,
  maxCostPerSignup: null,
  maxCostPerMql: null,
  churnedCustomerArpu: null,
  churnedArpuRatio: null,
});

describe("SaaS metrics", () => {
  it("calculates NRR from expansion, downgrade, and effective churn", () => {
    expect(calculateNrr(0.018, 0.006, 0.057)).toBeCloseTo(0.955);
  });

  it("uses ACV contribution margin and annual logo churn for B2B LTV and payback", () => {
    expect(calculatePredictedLtv("b2b", 100, 120_000, 0.05, 0.8)).toBe(
      1_920_000,
    );
    expect(calculatePredictedLtv("b2b", null, 120_000, 0, 0.8)).toBeNull();
    expect(
      calculatePaybackPeriod("b2b", 47_138, 100, 120_000, 0.8),
    ).toBeCloseTo(5.89225);
  });

  it("compares ending ARR with three months earlier and includes three months of paid spend and overhead", () => {
    const projection = [
      month("2027-04", 1_203_496),
      month("2027-05", 1_330_000),
      month("2027-06", 1_470_000),
      month("2027-07", 1_609_707),
    ];
    expect(
      calculateMagicNumber(
        projection,
        projection.map(() => 50_000),
        30_000,
      ),
    ).toBeCloseTo(406_211 / 240_000);
  });

  it("matches the reported quarterly SaaS Magic Number example", () => {
    const projection = [
      month("2029-06", 1_991_910),
      month("2029-07", 2_030_000),
      month("2029-08", 2_080_000),
      month("2029-09", 2_126_606),
    ];
    expect(calculateMagicNumber(projection, [0, 6_000, 6_000, 6_000], 20_000)).toBeCloseTo(1.7268718);
  });

  it("returns unavailable without four months or quarterly spend", () => {
    expect(
      calculateMagicNumber(
        [month("2027-05", 100), month("2027-06", 110), month("2027-07", 120)],
        [0, 0, 0],
        0,
      ),
    ).toBeNull();
    expect(
      calculateMagicNumber(
        [
          month("2027-04", 90),
          month("2027-05", 100),
          month("2027-06", 110),
          month("2027-07", 120),
        ],
        [0, 0, 0, 0],
        0,
      ),
    ).toBeNull();
  });

  it("includes Sales & Marketing overhead in blended CAC", () => {
    expect(calculateBlendedCac(50_000, 30_000, 5_000, 100)).toBe(850);
    expect(calculateBlendedCac(24_000, 24_000, 0, 12)).toBe(4_000);
    expect(calculateBlendedCac(50_000, 30_000, 5_000, 0)).toBe(0);
  });

  it("calculates cash collections, fees, refunds, and net cash", () => {
    const result = cashFlowFor(month("2026-08", 12000, 1000, 100), {
      ...defaultCashFlow,
      monthlyShare: 0.6,
      annualShare: 0.3,
      oneTimeEnabled: true,
      oneTimeShare: 0.1,
      feeRate: 0.03,
      refundRate: 0.02,
    });
    expect(result.monthlySubscriptions).toBe(600);
    expect(result.yearlySubscriptions).toBe(360);
    expect(result.oneTimePayments).toBe(120);
    expect(result.fees).toBe(-32.4);
    expect(result.refunds).toBe(-21.6);
    expect(result.netCash).toBe(1026);
  });
});
