import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

// The forecast island is prerendered by Astro and hydrated with client:load.
// AppIsland renders the static pass with restoreSavedModel=false, then remounts
// with browser-local state. That static pass must match the build byte for byte,
// so it may not read localStorage or the calendar month. These tests lock the
// static pass to deterministic, build-time defaults, which stops React #418.

const forecastPath = "/resources/tools/forecast";

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const setSavedModel = (value: unknown) => {
  const store = new Map<string, string>([
    ["growth-model-state-v1", JSON.stringify(value)],
    ["growth-plan-requested-v1", "true"],
  ]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: store.size,
  };
};

describe("forecast island static pass", () => {
  it("ignores a saved model so it matches the static build", () => {
    const withoutSaved = renderToString(
      <App initialPath={forecastPath} restoreSavedModel={false} />,
    );
    setSavedModel({
      schemaVersion: 3,
      modelName: "Returning Visitor Model",
      baseline: {
        month: "2025-03",
        visitors: 4200,
        signups: 120,
        mqls: 0,
        sqls: 0,
        newCustomers: 8,
        customers: 310,
        mrr: 24000,
        arpu: 77,
        arr: 288000,
      },
      forecastStartMonth: "2025-04",
    });
    const withSaved = renderToString(
      <App initialPath={forecastPath} restoreSavedModel={false} />,
    );
    expect(withSaved).toBe(withoutSaved);
    expect(withSaved).not.toContain("Returning Visitor Model");
  });

  it("seeds the month from a build-time constant, not new Date()", () => {
    const first = renderToString(
      <App initialPath={forecastPath} restoreSavedModel={false} />,
    );
    const second = renderToString(
      <App initialPath={forecastPath} restoreSavedModel={false} />,
    );
    expect(first).toBe(second);
    // The seed baseline month is a fixed constant; a current-month default would
    // drop it from the render on every real run.
    expect(first).toContain("2024-08");
    expect(first).toContain("2024-09");
  });
});
