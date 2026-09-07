import { describe, expect, it } from "vitest";
import {
  addChannelFromLibrary,
  channelLibrary,
  makeChannel,
  normalizeChannels,
  type ChannelDefaults,
  type EditableChannel,
} from "./channels";
import { forecast, type Assumptions } from "./engine/forecast";
import { calculateChannelBreakdown } from "./engine/channelBreakdown";

const defaults: ChannelDefaults = {
  signupRate: 0.2, purchaseRate: 0.1, arpu: 60,
  mqlRate: 0.12, sqlRate: 0.3, closeRate: 0.25, acv: 24000,
};
const preset = (name: string) => channelLibrary.find((entry) => entry.name === name)!;
const assumptions: Assumptions = {
  months: 3, monthlyTrafficGrowth: 0.1, signupRate: 0.1, purchaseRate: 0.1,
  voluntaryCustomerChurn: 0.02, delinquentCustomerChurn: 0.01,
  voluntaryRevenueChurn: 0.02, delinquentRevenueChurn: 0.01,
  expansionRate: 0.01, retractionRate: 0.005, newCustomerArpu: 40,
  grossMargin: 0.8, targetLtvCac: 3, daysToUpgrade: 3,
  monthlyIncrementalVisitors: 0, monthlySalesMarketingOverhead: 0,
};
const baseline = { month: "2026-08", visitors: 1000, customers: 100, mrr: 4000 };

describe("channel library", () => {
  it("starts empty and preserves intentionally empty saved/imported lists", () => {
    expect(normalizeChannels()).toEqual([]);
    expect(normalizeChannels([])).toEqual([]);
    expect(normalizeChannels(JSON.parse("[]"))).toEqual([]);
    expect(forecast(baseline, assumptions, normalizeChannels())).toEqual(forecast(baseline, assumptions));
  });

  it("covers every category with unique names compatible with persisted state", () => {
    expect(new Set(channelLibrary.map((entry) => entry.name)).size).toBe(channelLibrary.length);
    for (const model of ["cpc", "cpm", "manual"]) {
      expect(channelLibrary.filter((entry) => entry.model === model).length).toBeGreaterThanOrEqual(15);
      expect(channelLibrary.some((entry) => entry.model === model && entry.group === "Custom")).toBe(true);
    }
    expect(channelLibrary.every((entry) => entry.name.length <= 120 && entry.description && entry.group)).toBe(true);
  });

  it.each(channelLibrary)("$name has safe defaults and round-trips without adding other tactics", (entry) => {
    const [channel] = addChannelFromLibrary([], entry, defaults);
    expect(channel.goLiveMonth).toBe(1);
    expect(channel.hidden).toBe(false);
    expect(channel).toMatchObject(defaults);
    expect(channel).toMatchObject(entry.assumptions);
    expect(Object.values(channel).filter((value) => typeof value === "number").every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(channel.ctr).toBeLessThanOrEqual(1);
    if (entry.model === "cpc") expect(channel.cpc).toBeGreaterThan(0);
    if (entry.model === "cpm") {
      expect(channel.cpm).toBeGreaterThan(0);
      expect(channel.ctr).toBeGreaterThan(0);
    }
    expect(normalizeChannels(JSON.parse(JSON.stringify([channel])))).toEqual([channel]);
  });

  it("uses remaining paid allocation without changing existing budgets or assumptions", () => {
    const current = [{ ...makeChannel("Meta", "cpc", 0.6), cpc: 7 }];
    const next = addChannelFromLibrary(current, preset("YouTube"), defaults);
    expect(next[0]).toEqual(current[0]);
    expect(next[1].allocation).toBeCloseTo(0.4);
    expect(current).toHaveLength(1);
    const third = addChannelFromLibrary(next, preset("LinkedIn"), defaults);
    expect(third[2].allocation).toBe(0);
    expect(third.slice(0, 2)).toEqual(next);
  });

  it("ignores disabled allocation and clamps overallocated plans", () => {
    const disabled = { ...makeChannel("Meta", "cpc", 1), goLiveMonth: 0 };
    expect(addChannelFromLibrary([disabled], preset("YouTube"), defaults)[1].allocation).toBe(1);
    const overallocated = [makeChannel("Meta", "cpc", 1), makeChannel("LinkedIn", "cpc", 0.5)];
    expect(addChannelFromLibrary(overallocated, preset("YouTube"), defaults)[2].allocation).toBe(0);
  });

  it("does not allocate paid spend to owned tactics", () => {
    expect(addChannelFromLibrary([], preset("SEO / organic"), defaults)[0].allocation).toBe(0);
  });

  it("prevents duplicates and restores hidden channels without resetting edits or activation", () => {
    const edited = { ...makeChannel("Meta", "cpc", 0.3), cpc: 9, signupRate: 0.5, goLiveMonth: 0, hidden: true };
    const next = addChannelFromLibrary([edited], preset("Meta"), defaults);
    expect(next).toEqual([{ ...edited, hidden: false }]);
    expect(addChannelFromLibrary(next, preset("Meta"), defaults)).toEqual(next);
    expect(edited.hidden).toBe(true);
  });

  it("preserves existing model membership, order, all economics, and forecast results", () => {
    const saved = [
      { ...makeChannel("Imported tactic", "manual"), visitors: 180, arpu: 200, goLiveMonth: 2 },
      { ...makeChannel("Meta", "cpc", 0.7), cpc: 2, visitors: 350, hidden: true },
      { ...makeChannel("Partners", "manual"), visitors: 200, affiliateCommissionRate: 0.15, affiliateCommissionMonths: 6 },
    ];
    expect(normalizeChannels(saved)).toEqual(saved);
    for (const businessModel of ["b2c", "b2b"] as const) {
      const a = { ...assumptions, businessModel, mqlRate: 0.05, sqlRate: 0.4, closeRate: 0.2, acv: 12000 };
      expect(forecast(baseline, a, normalizeChannels(saved))).toEqual(forecast(baseline, a, saved));
      expect(calculateChannelBreakdown(baseline, a, normalizeChannels(saved))).toEqual(calculateChannelBreakdown(baseline, a, saved));
    }
  });

  it("fills legacy pipeline and partner fields but never applies library CPCs or traffic", () => {
    const legacy = JSON.parse(JSON.stringify([
      makeChannel("LinkedIn", "cpc", 0.5),
      makeChannel("Partners", "manual"),
    ]));
    for (const channel of legacy) {
      for (const key of ["mqlRate", "sqlRate", "closeRate", "acv", "affiliateCommissionRate", "affiliateCommissionMonths"]) delete channel[key];
    }
    const restored = normalizeChannels(legacy as EditableChannel[]);
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({ cpc: 2, visitors: 0, mqlRate: 0.05, sqlRate: 0.4, closeRate: 0.2, acv: 12000 });
    expect(restored[1]).toMatchObject({ visitors: 0, affiliateCommissionRate: 0.3, affiliateCommissionMonths: 12 });
  });

  it("leaves explicit zero partner commissions intact", () => {
    expect(normalizeChannels([makeChannel("Partners", "manual")])[0].affiliateCommissionRate).toBe(0);
    expect(addChannelFromLibrary([], preset("Partners"), defaults)[0]).toMatchObject({ affiliateCommissionRate: 0.3, affiliateCommissionMonths: 12 });
  });
});
