import { describe, expect, it } from "vitest";
import {
  calculateChannelBreakdown,
  type BreakdownChannel,
} from "./channelBreakdown";
import { forecast, type Assumptions } from "./forecast";

const assumptions: Assumptions = {
  months: 2,
  monthlyTrafficGrowth: 0,
  signupRate: 0.1,
  purchaseRate: 0.1,
  voluntaryCustomerChurn: 0.02,
  delinquentCustomerChurn: 0.01,
  voluntaryRevenueChurn: 0.02,
  delinquentRevenueChurn: 0.01,
  expansionRate: 0.01,
  retractionRate: 0.005,
  newCustomerArpu: 40,
  grossMargin: 0.8,
  targetLtvCac: 3,
  daysToUpgrade: 0,
  monthlyIncrementalVisitors: 0,
  monthlySalesMarketingOverhead: 0,
};
const channels: BreakdownChannel[] = [
  {
    name: "Branded Search",
    model: "cpc",
    visitors: 100,
    goLiveMonth: 1,
    signupRate: 0.2,
    purchaseRate: 0.1,
    arpu: 60,
  },
  {
    name: "YouTube",
    model: "cpm",
    visitors: 200,
    goLiveMonth: 2,
    signupRate: 0.1,
    purchaseRate: 0.2,
    arpu: 80,
  },
  {
    name: "Enterprise / B2B",
    model: "manual",
    visitors: 10,
    goLiveMonth: 1,
    signupRate: 0.5,
    purchaseRate: 0.2,
    arpu: 1000,
  },
  {
    name: "Disabled",
    model: "cpc",
    visitors: 999,
    goLiveMonth: 0,
    signupRate: 1,
    purchaseRate: 1,
    arpu: 999,
  },
];
const start = { month: "2026-07", visitors: 1000, customers: 100, mrr: 4000 };

describe("channel breakdown", () => {
  it("groups launched channels and excludes disabled and future channels", () => {
    const result = calculateChannelBreakdown(start, assumptions, channels);
    expect(result[0].categories.map((category) => category.name)).toEqual([
      "Baseline / Existing Business",
      "Direct Response",
      "Owned / Partner / Custom",
    ]);
    expect(
      result[0].categories.flatMap((category) =>
        category.channels.map((channel) => channel.name),
      ),
    ).not.toContain("YouTube");
    expect(
      result[1].categories.flatMap((category) =>
        category.channels.map((channel) => channel.name),
      ),
    ).toContain("YouTube");
    expect(
      result[1].categories.flatMap((category) =>
        category.channels.map((channel) => channel.name),
      ),
    ).not.toContain("Disabled");
  });

  it("reconciles every monthly subtotal to the forecast", () => {
    const projection = forecast(start, assumptions, channels);
    const breakdown = calculateChannelBreakdown(start, assumptions, channels);
    breakdown.forEach((month, index) => {
      const totals = month.categories.map((category) => category.total);
      expect(totals.reduce((sum, row) => sum + row.visitors, 0)).toBeCloseTo(
        projection[index].visitors,
        0,
      );
      expect(totals.reduce((sum, row) => sum + row.signups, 0)).toBeCloseTo(
        projection[index].signups,
        0,
      );
      expect(
        totals.reduce((sum, row) => sum + row.newCustomers, 0),
      ).toBeCloseTo(projection[index].newCustomers, 0);
      expect(totals.reduce((sum, row) => sum + row.customers, 0)).toBeCloseTo(
        projection[index].customers,
        0,
      );
      expect(totals.reduce((sum, row) => sum + row.endingMrr, 0)).toBeCloseTo(
        projection[index].endingMrr,
        1,
      );
      expect(totals.reduce((sum, row) => sum + row.arr, 0)).toBeCloseTo(
        projection[index].arr,
        0,
      );
    });
  });

  it("uses each channel ARPU and funnel for acquisition thresholds", () => {
    const first = calculateChannelBreakdown(start, assumptions, channels)[0];
    const enterprise = first.categories
      .flatMap((category) => category.channels)
      .find((channel) => channel.name === "Enterprise / B2B")!;
    expect(enterprise.arpu).toBeGreaterThan(100);
    expect(enterprise.maxCac).toBeCloseTo(((1000 / 0.03) * 0.8) / 3);
    expect(enterprise.maxCostPerSignup).toBeCloseTo(enterprise.maxCac! * 0.2);
  });

  it("reconciles B2B MQL, SQL, customer, and recurring-revenue totals", () => {
    const b2b = {
      ...assumptions,
      months: 4,
      businessModel: "b2b" as const,
      mqlRate: 0.1,
      sqlRate: 0.5,
      closeRate: 0.2,
      dealCycleDays: 45,
      acv: 12000,
    };
    const b2bChannels = channels.map((channel, index) => ({
      ...channel,
      mqlRate: 0.1 + index * 0.05,
      sqlRate: 0.25 + index * 0.1,
      closeRate: 0.1 + index * 0.05,
      acv: 12000 + index * 6000,
    }));
    const projection = forecast(start, b2b, b2bChannels);
    const breakdown = calculateChannelBreakdown(start, b2b, b2bChannels);
    breakdown.forEach((month, index) => {
      const totals = month.categories.map((category) => category.total);
      expect(totals.reduce((sum, row) => sum + row.mqls, 0)).toBeCloseTo(
        projection[index].mqls,
        0,
      );
      expect(totals.reduce((sum, row) => sum + row.sqls, 0)).toBeCloseTo(
        projection[index].sqls,
        0,
      );
      expect(
        totals.reduce((sum, row) => sum + row.newCustomers, 0),
      ).toBeCloseTo(projection[index].newCustomers, 0);
      expect(totals.reduce((sum, row) => sum + row.endingMrr, 0)).toBeCloseTo(
        projection[index].endingMrr,
        1,
      );
    });
    const firstChannels = breakdown[0].categories.flatMap(
      (category) => category.channels,
    );
    const branded = firstChannels.find(
      (channel) => channel.name === "Branded Search",
    )!;
    expect(branded.newCustomers).toBe(0);
    expect(branded.maxCostPerMql).toBeNull();
    expect(projection[0].maxCostPerMql).toBeNull();
    const realizedBranded = breakdown[1].categories
      .flatMap((category) => category.channels)
      .find((channel) => channel.name === "Branded Search")!;
    expect(realizedBranded.maxCostPerMql).toBeCloseTo(
      realizedBranded.maxCac! * 0.25 * 0.1,
    );
    expect(projection[1].maxCostPerMql).not.toBeNull();
  });

  it("marks cost per lead unavailable when delayed wins arrive without current leads", () => {
    const b2b = {
      ...assumptions,
      months: 2,
      businessModel: "b2b" as const,
      mqlRate: 1,
      sqlRate: 1,
      closeRate: 1,
      dealCycleDays: 45,
      acv: 12000,
    };
    const channel = {
      ...channels[0],
      visitors: 100,
      mqlRate: 1,
      sqlRate: 1,
      closeRate: 1,
      acv: 12000,
    };
    const overrides = {
      channelVisitors: { "2026-09": { "Branded Search": -100 } },
    };
    const projection = forecast(
      { month: "2026-07", visitors: 0, customers: 0, mrr: 0 },
      b2b,
      [channel],
      overrides,
    );
    const breakdown = calculateChannelBreakdown(
      { month: "2026-07", visitors: 0, customers: 0, mrr: 0 },
      b2b,
      [channel],
      overrides,
    );
    const category = breakdown[1].categories.find(
      (item) => item.name === "Direct Response",
    )!;
    expect(projection[1].newCustomers).toBeGreaterThan(0);
    expect(projection[1].mqls).toBe(0);
    expect(projection[1].maxCostPerMql).toBeNull();
    expect(category.total.maxCostPerMql).toBeNull();
    expect(category.channels[0].maxCostPerMql).toBeNull();
  });
});
