import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { type EcommerceModel } from "./ecommerce";
import { forecastEcommerce } from "./engine/forecast";
import {
  ecommerceAnalysis,
  ecommerceMetrics,
  ecommerceProjectionEconomics,
} from "./engine/metrics";

const cell = (v: unknown) =>
  `"${String(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : (v ?? "")).replace(/"/g, '""')}"`;
export const commerceCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  return [
    keys.map(cell).join(","),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
};
export function commerceTables(a: EcommerceModel) {
  const rows = ecommerceAnalysis(forecastEcommerce(a), a);
  return {
    "forecast.csv": rows.map(({ segments: _segments, ...row }) => {
      void _segments;
      return row;
    }),
    "budget-breakdown.csv": rows.flatMap((row) => [
      {
        month: row.month,
        channel: "Marketing overhead",
        spend: a.overhead,
        commissions: 0,
      },
      ...row.segments.map((c) => ({
        month: row.month,
        channel: c.name,
        spend: c.spend,
        commissions: c.commissions,
      })),
    ]),
    "orders-overview.csv": rows.map((r) => ({
      month: r.month,
      firstOrders: r.newCustomers,
      repeatCustomers: r.repeatCustomers,
      repeatOrders: r.repeatOrders,
      orders: r.orders,
      repeatOrderShare: r.repeatOrderShare,
    })),
    "revenue-overview.csv": rows.map((r) => ({
      month: r.month,
      firstPurchaseSales: r.newRevenue,
      repeatSales: r.repeatRevenue,
      grossSales: r.revenue,
      refunds: r.refunds,
      netSales: r.netRevenue,
    })),
    "growth-rate.csv": rows.map((r) => ({
      salesChange: r.salesChange,
      salesGrowth: r.salesGrowth,
      month: r.month,
      netSales: r.netRevenue,
      cogs: r.cogs,
      fees: r.fees,
      fulfillment: r.fulfillment,
      contribution: r.contribution,
      marketing: r.marketing,
      contributionAfterMarketing: r.contributionAfterMarketing,
    })),
    "customers-overview.csv": rows.flatMap((r) =>
      r.segments.map((c) => ({
        month: r.month,
        category: c.category,
        channel: c.name,
        newCustomers: c.newCustomers,
        customersToDate: c.customers,
        visitors: c.visitors,
        orders: c.orders,
        grossSales: c.revenue,
      })),
    ),
    "cash-flow.csv": rows.map((r) => ({
      month: r.month,
      grossSales: r.revenue,
      refunds: -r.refunds,
      paymentFees: -r.fees,
      cashReceipts: r.cashReceipts,
    })),
  };
}
export async function exportEcommerceForecast(
  a: EcommerceModel,
  modelName: string,
  format: "csv" | "pdf",
) {
  const slug = (modelName || "GrowthCast")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const tables = commerceTables(a);
  if (format === "csv") {
    const zip = new JSZip();
    Object.entries(tables).forEach(([name, rows]) =>
      zip.file(name, commerceCsv(rows)),
    );
    const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-d2c-forecast.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  let y = 42;
  const line = (text: string, size = 11) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 745) as string[];
    for (const part of lines) {
      if (y > 548) {
        doc.addPage();
        y = 42;
      }
      doc.text(part, 42, y);
      y += size + 6;
    }
  };
  line(`${modelName || "GrowthCast"} - D2C / Ecommerce Forecast`, 22);
  line(
    `Baseline ${a.month} | ${a.months} forecast months | Generated ${new Date().toISOString().slice(0, 10)}`,
  );
  line(
    "Planning estimates in USD. One-time orders and repeat purchasing; no recurring revenue. Cash receipts assume same-month collection. Inventory timing, tax, settlement delays and fixed operating costs are excluded.",
  );
  const projection = forecastEcommerce(a);
  const last = projection[projection.length - 1];
  const metrics = ecommerceMetrics(last, a);
  line(
    `Ending month ${last.month}: ${last.orders} orders; ${last.customers} customers acquired to date; net sales $${metrics.netRevenue.toFixed(2)}; contribution after marketing $${metrics.contributionAfterMarketing.toFixed(2)}.`,
    13,
  );
  const unit = ecommerceProjectionEconomics(projection, a);
  line(
    `12-month contribution per new buyer $${unit.twelveMonthValue.toFixed(2)}; maximum CAC $${unit.maxCac.toFixed(2)}. Value includes the first order and 11 months of expected repeat orders.`,
  );
  line("Assumptions", 16);
  const labels: Record<string, string> = {
    month: "Baseline month",
    months: "Forecast months",
    visitors: "Acquisition visitors",
    customers: "Previously acquired customers",
    trafficGrowth: "Monthly traffic growth",
    conversionRate: "First-purchase conversion",
    aov: "First-order value",
    repeatRate: "Monthly repeat buyer rate",
    repeatOrders: "Orders per repeat buyer",
    repeatAov: "Repeat-order value",
    grossMargin: "Product gross margin",
    fulfillmentCost: "Fulfillment per order",
    feeRate: "Payment fee rate",
    refundRate: "Refund rate",
    overhead: "Monthly marketing overhead",
    targetLtvCac: "Target 12-month contribution / CAC",
    budgetGrowth: "Monthly budget growth",
    budget: "Paid media budget",
    channelDefaults: "General channel defaults",
  };
  Object.entries(a)
    .filter(([key]) => key !== "channels")
    .forEach(([key, value]) =>
      line(
        `${labels[key]}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
      ),
    );
  for (const c of a.channels)
    line(
      `Channel: ${c.name} (${c.model}), live month ${c.goLiveMonth}; monthly spend ${c.spend}; CPC ${c.cpc}; CPM ${c.cpm}; CTR ${c.ctr}; launch visitors ${c.visitors}; conversion ${c.conversionRate}; order value ${c.aov}; commission ${c.commissionRate}; spend overrides ${JSON.stringify(c.spendOverrides)}`,
    );
  for (const [name, rows] of Object.entries(tables)) {
    doc.addPage();
    y = 42;
    line(name.replace(".csv", "").replace(/-/g, " "), 18);
    for (const row of rows)
      line(
        Object.entries(row)
          .map(
            ([key, value]) =>
              `${key}: ${typeof value === "number" ? Number(value.toFixed(2)) : (value ?? "unavailable")}`,
          )
          .join(" | "),
        9,
      );
  }
  // Vector charts remain crisp and include all forecast months in the portable PDF.
  const series = ecommerceAnalysis(projection, a);
  const charts = [
    ["Budget breakdown", "paidSpend"],
    ["Orders overview", "orders"],
    ["Revenue overview", "netRevenue"],
    ["Growth rate (fraction)", "salesGrowth"],
    ["Customers overview", "customers"],
    ["Cash flow", "cashReceipts"],
  ] as const;
  for (const [title, key] of charts) {
    doc.addPage();
    y = 42;
    line(title, 18);
    line(`${series[0].month} to ${last.month}`);
    const values = series.map((r) => r[key]);
    const available = values.filter((value): value is number => value !== null);
    const low = Math.min(0, ...available),
      high = Math.max(1, ...available),
      range = high - low;
    const x = (i: number) => 90 + (i * 650) / Math.max(1, series.length - 1);
    const plotY = (v: number) => 460 - ((v - low) / range) * 320;
    doc.setDrawColor(170);
    doc.line(90, plotY(0), 740, plotY(0));
    doc.setFontSize(10);
    doc.text(high.toFixed(0), 42, 145);
    doc.text(low.toFixed(0), 42, 465);
    doc.text(series[0].month, 90, 490);
    doc.text(last.month, 695, 490);
    doc.setDrawColor(39, 120, 90);
    doc.setLineWidth(2);
    values.forEach((v, i) => {
      if (v === null) return;
      doc.circle(x(i), plotY(v), 2, "S");
      if (i && values[i - 1] !== null)
        doc.line(x(i - 1), plotY(values[i - 1]!), x(i), plotY(v));
    });
  }
  doc.save(`${slug}-d2c-forecast.pdf`);
}
