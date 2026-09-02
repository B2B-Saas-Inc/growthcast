import { describe, expect, it } from "vitest";
import {
  delayedConversionShares,
  forecast,
  type Assumptions,
} from "./forecast";
const a: Assumptions = {
  months: 2,
  monthlyTrafficGrowth: 0.1,
  signupRate: 0.1,
  purchaseRate: 0.2,
  voluntaryCustomerChurn: 0.03,
  delinquentCustomerChurn: 0.01,
  voluntaryRevenueChurn: 0.03,
  delinquentRevenueChurn: 0.01,
  expansionRate: 0.02,
  retractionRate: 0.01,
  newCustomerArpu: 40,
  grossMargin: 0.8,
  targetLtvCac: 3,
  daysToUpgrade: 0,
  monthlyIncrementalVisitors: 0,
  monthlySalesMarketingOverhead: 0,
};
describe("forecast", () => {
  it("calculates a traceable monthly bridge", () => {
    const [m] = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      a,
    );
    expect(m.month).toBe("2026-08");
    expect(m.visitors).toBe(1100);
    expect(m.signups).toBe(110);
    expect(m.newCustomers).toBe(22);
    expect(m.churnedCustomers).toBe(4);
    expect(m.customers).toBe(118);
    expect(m.endingMrr).toBe(4760);
    expect(m.arr).toBe(57120);
    expect(m.maxCostPerSignup).toBeGreaterThan(0);
    expect(
      [
        m.visitors,
        m.signups,
        m.newCustomers,
        m.churnedCustomers,
        m.customers,
      ].every(Number.isInteger),
    ).toBe(true);
  });
  it("shifts uniformly acquired signup conversions into the following month", () => {
    const months = forecast(
      { month: "2026-07", visitors: 100, customers: 0, mrr: 0 },
      {
        ...a,
        months: 3,
        monthlyTrafficGrowth: 0,
        signupRate: 1,
        purchaseRate: 1,
        daysToUpgrade: 5,
      },
    );
    expect(months[0].signups).toBe(100);
    expect(months[0].newCustomers).toBe(84);
    expect(months[1].newCustomers).toBe(99);
    expect(months[0].newMrr).toBeCloseTo((4000 * 26) / 31, 2);
    expect(months[1].newMrr).toBeCloseTo(4000 * (5 / 31 + 25 / 30), 2);
  });
  it("adds channel traffic once at go-live, then compounds it", () => {
    const months = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      { ...a, months: 3 },
      [
        {
          name: "Meta",
          visitors: 10000,
          goLiveMonth: 2,
          signupRate: 0.1,
          purchaseRate: 0.2,
          arpu: 40,
        },
      ],
    );
    expect(months[0].visitors).toBe(1100);
    expect(months[1].visitors).toBe(11210);
    expect(months[2].visitors).toBe(12331);
  });
  it("applies monthly visitor overrides as adjustments to the compounded channel cohort", () => {
    const months = forecast(
      { month: "2026-07", visitors: 0, customers: 0, mrr: 0 },
      { ...a, months: 2, monthlyTrafficGrowth: 0.1 },
      [
        {
          name: "Meta",
          visitors: 100,
          goLiveMonth: 1,
          signupRate: 0.1,
          purchaseRate: 0.2,
          arpu: 40,
        },
      ],
      {
        channelVisitors: { "2026-08": { Meta: 100 }, "2026-09": { Meta: 40 } },
      },
    );
    expect(months[0].visitors).toBe(100);
    expect(months[1].visitors).toBe(150);
  });
  it("excludes channels with live month zero", () => {
    const base = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      { ...a, months: 2 },
    );
    const disabled = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      { ...a, months: 2 },
      [
        {
          name: "Meta",
          visitors: 10000,
          goLiveMonth: 0,
          signupRate: 0.1,
          purchaseRate: 0.2,
          arpu: 40,
        },
      ],
    );
    expect(disabled).toEqual(base);
  });
  it("ignores stale visitor overrides for disabled and pre-launch channels", () => {
    const channel = {
      name: "Future",
      visitors: 100,
      goLiveMonth: 3,
      signupRate: 1,
      purchaseRate: 1,
      arpu: 40,
    };
    const months = forecast(
      { month: "2026-07", visitors: 0, customers: 0, mrr: 0 },
      { ...a, months: 2, monthlyTrafficGrowth: 0 },
      [channel, { ...channel, name: "Disabled", goLiveMonth: 0 }],
      {
        channelVisitors: {
          "2026-08": { Future: 500, Disabled: 500 },
          "2026-09": { Future: 500, Disabled: 500 },
        },
      },
    );
    expect(months.map((month) => month.visitors)).toEqual([0, 0]);
    expect(months.map((month) => month.newCustomers)).toEqual([0, 0]);
  });
  it("applies monthly channel and churn overrides to later model results", () => {
    const base = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      a,
      [
        {
          name: "Meta",
          visitors: 100,
          goLiveMonth: 1,
          signupRate: 0.1,
          purchaseRate: 0.2,
          arpu: 40,
        },
      ],
    );
    const changed = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      a,
      [
        {
          name: "Meta",
          visitors: 100,
          goLiveMonth: 1,
          signupRate: 0.1,
          purchaseRate: 0.2,
          arpu: 40,
        },
      ],
      {
        channelVisitors: { "2026-08": { Meta: 1000 } },
        revenueChurn: { "2026-08": 0.1 },
      },
    );
    expect(changed[0].visitors).toBeGreaterThan(base[0].visitors);
    expect(changed[0].churnMrr).toBe(400);
    expect(changed[1].endingMrr).not.toBe(base[1].endingMrr);
  });
  it("reconciles logo and revenue churn through churned-customer ARPU", () => {
    const [month] = forecast(
      { month: "2026-07", visitors: 0, customers: 1000, mrr: 50000 },
      {
        ...a,
        months: 1,
        monthlyTrafficGrowth: 0,
        signupRate: 0,
        purchaseRate: 0,
        voluntaryCustomerChurn: 0.05,
        delinquentCustomerChurn: 0,
        voluntaryRevenueChurn: 0.03,
        delinquentRevenueChurn: 0,
        expansionRate: 0,
        retractionRate: 0,
      },
    );
    expect(month.churnedCustomers).toBe(50);
    expect(month.churnMrr).toBe(1500);
    expect(month.churnedCustomerArpu).toBe(30);
    expect(month.churnedArpuRatio).toBe(0.6);
  });
  it("keeps LTV stable when only logo churn changes and increases it when revenue churn falls", () => {
    const start = {
      month: "2026-07",
      visitors: 1000,
      customers: 100,
      mrr: 4000,
    };
    const base = forecast(start, { ...a, months: 1 })[0];
    const lowerLogo = forecast(start, {
      ...a,
      months: 1,
      voluntaryCustomerChurn: 0.01,
    })[0];
    const lowerRevenue = forecast(start, {
      ...a,
      months: 1,
      voluntaryRevenueChurn: 0.01,
    })[0];
    expect(lowerLogo.ltv).toBe(base.ltv);
    expect(lowerRevenue.ltv).toBeGreaterThan(base.ltv!);
  });
  it("weights acquisition ARPU across baseline and active channel customers", () => {
    const start = {
      month: "2026-07",
      visitors: 1000,
      customers: 100,
      mrr: 4000,
    };
    const base = forecast(start, { ...a, months: 1 })[0];
    const enterprise = forecast(start, { ...a, months: 1 }, [
      {
        name: "Enterprise / B2B",
        visitors: 100,
        goLiveMonth: 1,
        signupRate: 0.1,
        purchaseRate: 0.2,
        arpu: 1000,
      },
    ])[0];
    expect(base.acquisitionArpu).toBe(40);
    expect(enterprise.acquisitionArpu).toBe(120);
    expect(enterprise.ltv).toBe(3000);
    expect(enterprise.ltv).toBeGreaterThan(base.ltv!);
    const inactive = forecast(start, { ...a, months: 1 }, [
      {
        name: "Enterprise / B2B",
        visitors: 0,
        goLiveMonth: 1,
        signupRate: 0.1,
        purchaseRate: 0.2,
        arpu: 1000,
      },
    ])[0];
    expect(inactive.ltv).toBe(base.ltv);
  });
  it("marks churn-based unit economics unavailable when revenue churn is zero", () => {
    const [month] = forecast(
      { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
      { ...a, voluntaryRevenueChurn: 0, delinquentRevenueChurn: 0 },
    );
    expect(month.ltv).toBeNull();
    expect(month.maxCac).toBeNull();
    expect(month.maxCostPerSignup).toBeNull();
  });
  it("models a B2B MQL-to-SQL pipeline and converts ACV to MRR", () => {
    const [month] = forecast(
      { month: "2026-07", visitors: 1000, customers: 10, mrr: 10000 },
      {
        ...a,
        months: 1,
        monthlyTrafficGrowth: 0,
        businessModel: "b2b",
        mqlRate: 0.1,
        sqlRate: 0.5,
        closeRate: 0.2,
        dealCycleDays: 0,
        acv: 12000,
        voluntaryCustomerChurn: 0,
        delinquentCustomerChurn: 0,
        voluntaryRevenueChurn: 0,
        delinquentRevenueChurn: 0,
        expansionRate: 0,
        retractionRate: 0,
      },
    );
    expect(month.mqls).toBe(100);
    expect(month.sqls).toBe(50);
    expect(month.newCustomers).toBe(10);
    expect(month.newMrr).toBe(10000);
    expect(month.endingMrr).toBe(20000);
    expect(month.signups).toBe(0);
  });
  it("keeps B2B customer and contract revenue movements discrete", () => {
    const base = {
      ...a,
      months: 1,
      monthlyTrafficGrowth: 0,
      businessModel: "b2b" as const,
      mqlRate: 1,
      sqlRate: 1,
      closeRate: 0.004,
      dealCycleDays: 0,
      acv: 48000,
      voluntaryCustomerChurn: 0.05,
      delinquentCustomerChurn: 0,
      voluntaryRevenueChurn: 0.05,
      delinquentRevenueChurn: 0,
      expansionRate: 0,
      retractionRate: 0,
    };
    const [belowOneWin] = forecast(
      { month: "2026-07", visitors: 100, customers: 1, mrr: 4000 },
      base,
    );
    expect(belowOneWin.newCustomers).toBe(0);
    expect(belowOneWin.newMrr).toBe(0);
    expect(belowOneWin.churnedCustomers).toBe(0);
    expect(belowOneWin.churnMrr).toBe(0);
    expect(belowOneWin.customers).toBe(1);
    expect(belowOneWin.endingMrr).toBe(4000);

    const [wholeWins] = forecast(
      { month: "2026-07", visitors: 1000, customers: 20, mrr: 80000 },
      { ...base, closeRate: 0.002 },
    );
    expect(wholeWins.newCustomers).toBe(2);
    expect(wholeWins.newMrr).toBe(8000);
    expect(wholeWins.churnedCustomers).toBe(1);
    expect(wholeWins.churnMrr).toBe(4000);
    expect(wholeWins.customers).toBe(21);
    expect(wholeWins.endingMrr).toBe(84000);
  });
  it("uses exact calendar boundaries for B2B deal-cycle cohorts", () => {
    expect(delayedConversionShares("2026-08", 45, 3)).toEqual([
      0,
      16 / 31,
      15 / 31,
    ]);
    expect(
      delayedConversionShares("2026-08", 400, 2).reduce(
        (sum, share) => sum + share,
        0,
      ),
    ).toBe(0);
    const months = forecast(
      { month: "2026-07", visitors: 100, customers: 0, mrr: 0 },
      {
        ...a,
        months: 4,
        monthlyTrafficGrowth: 0,
        businessModel: "b2b",
        mqlRate: 1,
        sqlRate: 1,
        closeRate: 1,
        dealCycleDays: 45,
        acv: 1200,
      },
    );
    expect(months[0].newCustomers).toBe(0);
    expect(months[1].newCustomers).toBe(52);
    expect(months[2].newCustomers).toBe(102);
    expect(months[1].newMrr).toBe(5200);
    expect(months[0].acquisitionArpu).toBeNull();
    expect(months[0].maxCostPerMql).toBeNull();
    expect(months[1].acquisitionArpu).toBeCloseTo(100, 2);
    expect(months[1].maxCostPerMql).toBeCloseTo(666.67, 2);
    expect(months[0].maxCostPerSignup).toBeNull();
  });
  it("is deterministic", () =>
    expect(
      forecast(
        { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
        a,
      ),
    ).toEqual(
      forecast(
        { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 },
        a,
      ),
    ));
});
