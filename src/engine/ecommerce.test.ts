import { channelLibrary } from "../channels";
import { describe, expect, it } from "vitest";
import {
  ecommerceDefaults,
  addEcommerceChannel,
  ecommercePaidBudget,
  editEcommerceMonthBudget,
  ecommerceChannelControls,
  setEcommercePaidBudget,
  validateEcommerce,
  validateEcommerceFile,
} from "../ecommerce";
import { forecastEcommerce } from "./forecast";
import {
  ecommerceAnalysis,
  ecommerceMetrics,
  ecommerceUnitEconomics,
} from "./metrics";
import { ecommerceChannelBreakdown } from "./channelBreakdown";
import { commerceTables, commerceCsv } from "../ecommerceExport";

const model = () => ({
  ...ecommerceDefaults(),
  month: "2026-09",
  months: 3,
  visitors: 1000,
  customers: 100,
  conversionRate: 0.1,
  aov: 50,
  repeatRate: 0.1,
  repeatOrders: 2,
  repeatAov: 40,
});
const channel = () => ({
  name: "Paid",
  model: "cpc" as const,
  goLiveMonth: 1,
  spend: 200,
  cpc: 2,
  cpm: 10,
  ctr: 0.01,
  visitors: 0,
  conversionRate: 0.1,
  aov: 50,
  commissionRate: 0.1,
  spendOverrides: {},
});

describe("transactional ecommerce forecast", () => {
  it("models each month independently with no carried revenue or annualization", () => {
    const a = { ...model(), repeatRate: 0 };
    const rows = forecastEcommerce(a);
    expect(rows.map((r) => r.revenue)).toEqual([5000, 5000, 5000]);
    expect(rows.map((r) => r.customers)).toEqual([200, 300, 400]);
    expect(rows[0]).not.toHaveProperty("endingMrr");
    expect(rows[0]).not.toHaveProperty("arr");
    expect(forecastEcommerce(a)).toEqual(rows);
  });
  it("starts repeat buying from opening customers and never counts repeat buyers as new customers", () => {
    const rows = forecastEcommerce(model());
    expect(rows[0]).toMatchObject({
      newCustomers: 100,
      repeatCustomers: 10,
      repeatOrders: 20,
      orders: 120,
      customers: 200,
      newRevenue: 5000,
      repeatRevenue: 800,
      revenue: 5800,
    });
    expect(rows[1]).toMatchObject({
      repeatCustomers: 20,
      repeatOrders: 40,
      customers: 300,
    });
  });
  it("handles a zero baseline, no traffic, and one-month horizons", () => {
    const a = { ...ecommerceDefaults(), months: 1 };
    const [row] = forecastEcommerce(a);
    expect(row.revenue).toBe(0);
    expect(ecommerceMetrics(row, a)).toMatchObject({
      cac: null,
      roas: null,
      mer: null,
      aov: null,
    });
  });
  it("disables sources completely and respects go-live timing and zero CPC/CPM", () => {
    const a = {
      ...model(),
      channels: [
        {
          ...channel(),
          name: "Disabled",
          goLiveMonth: 0,
          spendOverrides: { "2026-10": 10000 },
        },
        { ...channel(), name: "Delayed", goLiveMonth: 2 },
        { ...channel(), name: "Zero CPC", cpc: 0 },
        { ...channel(), name: "Zero CPM", model: "cpm" as const, cpm: 0 },
      ],
    };
    const rows = forecastEcommerce(a);
    expect(rows[0].segments.map((s) => s.name)).toEqual([
      "Baseline / Existing Business",
      "Zero CPC",
      "Zero CPM",
    ]);
    expect(rows[0].segments[1].visitors).toBe(0);
    expect(rows[0].segments[2].visitors).toBe(0);
    expect(rows[1].segments.find((s) => s.name === "Delayed")?.visitors).toBe(
      100,
    );
    expect(rows[0].spend).toBe(400);
  });
  it("introduces traffic once and applies explicit paid spend adjustments", () => {
    const a = {
      ...model(),
      trafficGrowth: 0.1,
      channels: [{ ...channel(), spendOverrides: { "2026-11": 400 } }],
    };
    const rows = forecastEcommerce(a);
    expect(rows.map((r) => r.segments[1].visitors)).toEqual([100, 210, 131]);
    expect(rows.map((r) => r.spend)).toEqual([200, 400, 200]);
  });
  it("calculates demand gen and manual traffic and attributes repeat purchases to source", () => {
    const a = {
      ...model(),
      channels: [
        { ...channel(), model: "cpm" as const },
        {
          ...channel(),
          name: "Owned",
          model: "manual" as const,
          visitors: 50,
          spend: 0,
        },
      ],
    };
    const rows = forecastEcommerce(a);
    expect(rows[0].segments[1].visitors).toBe(200);
    expect(rows[1].segments[1].repeatOrders).toBe(4);
    for (const row of rows) {
      const groups = ecommerceChannelBreakdown(row);
      for (const key of ["visitors", "customers", "orders", "revenue"] as const)
        expect(groups.reduce((sum, g) => sum + g.total[key], 0)).toBeCloseTo(
          row[key],
        );
    }
  });
  it("charges one-time commission on net first-order sales only", () => {
    const a = { ...model(), refundRate: 0.2, channels: [channel()] };
    expect(forecastEcommerce(a).map((r) => r.commissions)).toEqual([
      40, 40, 40,
    ]);
  });
  it("computes contribution, refunds, fees, fulfillment and same-month cash", () => {
    const a = {
      ...model(),
      grossMargin: 0.6,
      feeRate: 0.03,
      refundRate: 0.1,
      fulfillmentCost: 5,
      overhead: 200,
      channels: [channel()],
    };
    const row = forecastEcommerce(a)[0];
    const m = ecommerceMetrics(row, a);
    expect(row.revenue).toBe(6300);
    expect(m.netRevenue).toBe(5670);
    expect(m.cogs).toBe(2520);
    expect(m.fees).toBe(189);
    expect(m.fulfillment).toBe(650);
    expect(m.contribution).toBe(2311);
    expect(m.marketing).toBe(445);
    expect(m.contributionAfterMarketing).toBe(1866);
    expect(m.cashReceipts).toBe(5481);
    expect(m.cac).toBeCloseTo(445 / 110);
    expect(m.roas).toBe(2.25);
  });
  it("uses finite contribution value and allows negative profitability", () => {
    const a = {
      ...model(),
      grossMargin: 0.6,
      refundRate: 0.1,
      feeRate: 0.03,
      fulfillmentCost: 5,
    };
    const unit = ecommerceUnitEconomics(a);
    expect(unit.firstOrderContribution).toBeCloseTo(18.5);
    expect(unit.twelveMonthValue).toBeCloseTo(18.5 + 11 * 0.1 * 2 * 13.8);
    expect(ecommerceUnitEconomics({ ...a, grossMargin: 0 }).maxCac).toBe(0);
  });
  it("exports seven commerce tables with overrides and no subscription fields", () => {
    const a = {
      ...model(),
      channels: [{ ...channel(), spendOverrides: { "2026-10": 500 } }],
    };
    const tables = commerceTables(a);
    expect(Object.keys(tables)).toHaveLength(7);
    expect(tables["forecast.csv"][0].spend).toBe(500);
    expect(JSON.stringify(tables)).not.toMatch(/mrr|arr|churn|subscription/i);
    expect(commerceCsv([{ name: "=bad", amount: -10 }])).toContain("'=bad");
    expect(commerceCsv([{ name: "=bad", amount: -10 }])).toContain('"-10"');
  });
});

describe("D2C state contract", () => {
  it("round-trips a version 4 file without changing input", () => {
    const data = {
      schemaVersion: 4,
      businessModel: "d2c",
      modelName: "My Store",
      ecommerce: model(),
    };
    expect(validateEcommerceFile(JSON.parse(JSON.stringify(data)))).toEqual(
      data,
    );
  });
  it.each([
    { months: 0 },
    { months: 61 },
    { conversionRate: 1.1 },
    { repeatRate: -1 },
    { aov: Infinity },
    { month: "2026-13" },
    { channels: null },
    { repeatOrders: 0 },
    { targetLtvCac: 0 },
  ])("rejects invalid state atomically: %j", (patch) => {
    expect(() => validateEcommerce({ ...model(), ...patch })).toThrow();
  });
  it("rejects malformed overrides, duplicate sources and unsupported schemas", () => {
    expect(() =>
      validateEcommerce({
        ...model(),
        channels: [{ ...channel(), spendOverrides: { bad: 10 } }],
      }),
    ).toThrow();
    expect(() =>
      validateEcommerce({ ...model(), channels: [channel(), channel()] }),
    ).toThrow();
    expect(() =>
      validateEcommerceFile({
        schemaVersion: 5,
        businessModel: "d2c",
        modelName: "x",
        ecommerce: model(),
      }),
    ).toThrow();
  });
});

describe("D2C shared channel workflow", () => {
  const meta = channelLibrary.find((p) => p.name === "Meta")!;
  const search = channelLibrary.find((p) => p.name === "Branded Search")!;
  it("migrates spend-based files to budget controls without changing projections", () => {
    const a = {
      ...model(),
      channels: [
        channel(),
        { ...channel(), name: "Second", spend: 600 },
        { ...channel(), name: "Disabled", goLiveMonth: 0, spend: 999 },
      ],
    };
    expect(ecommercePaidBudget(a)).toBe(800);
    const controls = ecommerceChannelControls(a);
    expect(controls.map((c) => c.allocation)).toEqual([0.25, 0.75, 0]);
    expect(forecastEcommerce({ ...a, channels: controls })).toEqual(
      forecastEcommerce(a),
    );
    expect(
      validateEcommerce({ ...a, budget: 800, channels: controls }).channels,
    ).toEqual(controls);
  });
  it("adds from the shared library without reallocating the existing budget", () => {
    let a = setEcommercePaidBudget(model(), 1000);
    a = addEcommerceChannel(a, meta);
    expect(a.channels[0]).toMatchObject({
      name: "Meta",
      allocation: 1,
      spend: 1000,
      cpc: 1.5,
      aov: 50,
      conversionRate: 0.1,
    });
    a = addEcommerceChannel(a, search);
    expect(a.channels[1]).toMatchObject({ allocation: 0, spend: 0 });
    expect(a.channels[0].spend).toBe(1000);
    const updated = setEcommercePaidBudget(a, 2000);
    expect(updated.channels.map((c) => c.spend)).toEqual([2000, 0]);
  });
  it("restores hidden tactics without duplicating or resetting their edits", () => {
    const a = addEcommerceChannel(model(), meta);
    a.channels[0] = {
      ...a.channels[0],
      hidden: true,
      aov: 123,
      spendOverrides: { "2026-10": 432 },
    };
    const restored = addEcommerceChannel(a, meta);
    expect(restored.channels).toHaveLength(1);
    expect(restored.channels[0]).toMatchObject({
      hidden: false,
      aov: 123,
      spendOverrides: { "2026-10": 432 },
    });
    expect(forecastEcommerce(a)).toEqual(forecastEcommerce(restored));
  });
  it("inherits General commerce defaults and uses a one-time partner commission", () => {
    const a = addEcommerceChannel(
      { ...model(), channelDefaults: { conversionRate: 0.04, aov: 90 } },
      channelLibrary.find((p) => p.name === "Partners")!,
    );
    expect(a.channels[0]).toMatchObject({
      conversionRate: 0.04,
      aov: 90,
      commissionRate: 0.3,
      spend: 0,
      allocation: 0,
    });
    expect(a.channels[0]).not.toHaveProperty("affiliateCommissionMonths");
  });
  it("validates the additive budget and visibility settings", () => {
    for (const patch of [
      { budget: -1 },
      { channelDefaults: { conversionRate: 2, aov: 50 } },
      { channels: [{ ...channel(), hidden: "yes" }] },
      { channels: [{ ...channel(), allocation: 2 }] },
    ]) {
      expect(() => validateEcommerce({ ...model(), ...patch })).toThrow();
    }
  });
});

describe("D2C analytical views and budget editing", () => {
  it("keeps the first growth comparison unavailable and calculates subsequent net-sales growth", () => {
    const a = {
      ...model(),
      repeatRate: 0,
      channels: [{ ...channel(), spendOverrides: { "2026-11": 0 } }],
    };
    const rows = ecommerceAnalysis(forecastEcommerce(a), a);
    expect(rows[0].salesGrowth).toBeNull();
    expect(rows[0].salesChange).toBeNull();
    expect(rows[1].salesChange).toBe(-500);
    expect(rows[1].salesGrowth).toBeCloseTo(-500 / 5500);
    expect(rows[2].salesChange).toBe(500);
    const empty = ecommerceAnalysis(
      forecastEcommerce(ecommerceDefaults()),
      ecommerceDefaults(),
    );
    expect(empty[1].salesGrowth).toBeNull();
  });
  it("shows refund and fee movements as losses without changing cash totals", () => {
    const a = { ...model(), feeRate: 0.03, refundRate: 0.1 };
    const [r] = ecommerceAnalysis(forecastEcommerce(a), a);
    expect(r.refundMovement).toBe(-580);
    expect(r.feeMovement).toBe(-174);
    expect(r.revenue + r.refundMovement + r.feeMovement).toBe(r.cashReceipts);
  });
  it("rebalances a channel in $100 steps while retaining each monthly total", () => {
    const a = {
      ...model(),
      channels: [
        channel(),
        { ...channel(), name: "Second", spend: 800 },
        { ...channel(), name: "Disabled", goLiveMonth: 0 },
      ],
    };
    const next = editEcommerceMonthBudget(a, "2026-10", 460, true, "Paid");
    expect(next.channels[0].spendOverrides).toEqual({
      "2026-10": 500,
      "2026-11": 500,
      "2026-12": 500,
    });
    expect(next.channels[1].spendOverrides).toEqual(
      next.channels[0].spendOverrides,
    );
    expect(next.channels[2].spendOverrides).toEqual({});
    expect(a.channels[0].spendOverrides).toEqual({});
    expect(forecastEcommerce(next).map((r) => r.spend)).toEqual([
      1000, 1000, 1000,
    ]);
  });
  it("applies isolated and forward totals with live-month timing and no disabled spend", () => {
    const a = {
      ...model(),
      channels: [
        channel(),
        { ...channel(), name: "Later", goLiveMonth: 2, spend: 800 },
      ],
    };
    const isolated = editEcommerceMonthBudget(a, "2026-10", 600, false);
    expect(forecastEcommerce(isolated).map((r) => r.spend)).toEqual([
      600, 1000, 1000,
    ]);
    const forward = editEcommerceMonthBudget(a, "2026-10", 600, true);
    expect(forecastEcommerce(forward).map((r) => r.spend)).toEqual([
      600, 600, 600,
    ]);
    expect(forward.channels[1].spendOverrides["2026-10"]).toBeUndefined();
    expect(editEcommerceMonthBudget(a, "2026-10", 100, false, "Paid")).toEqual(
      a,
    );
  });
});
