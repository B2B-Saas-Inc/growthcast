import {
  Fragment,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RotateCcw, TrendingUp } from "lucide-react";
import { forecastEcommerce } from "../engine/forecast";
import {
  ecommerceAnalysis,
  ecommerceProjectionEconomics,
} from "../engine/metrics";
import { ecommerceChannelBreakdown } from "../engine/channelBreakdown";
import {
  editEcommerceMonthBudget,
  ecommerceMonthSpend,
  ecommercePaidBudget,
  setEcommercePaidBudget,
  type EcommerceModel,
} from "../ecommerce";

export type CommercePresentation = {
  ImageExportControl: ComponentType<{
    targetId: string;
    filename: string;
    title: string;
    description: string;
    square?: boolean;
  }>;
  MetricHelp: ComponentType<{ label: string; children: ReactNode }>;
};
const money = (value: number | null) =>
  value === null
    ? "—"
    : (value || 0).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      });
const money2 = (value: number | null) =>
  value === null
    ? "—"
    : (value || 0).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const whole = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const ratio = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)}×`;
const colors = [
  "#ff6b4a",
  "#7b61ff",
  "#2ab99f",
  "#f1b84b",
  "#5da8c5",
  "#ef7fa6",
  "#27282a",
];
const domain = (values: number[]) => {
  const positive = Math.max(1, ...values),
    negative = Math.max(0, ...values.map((v) => -v));
  const span = Math.max(positive / 0.8, negative / 0.2) * 1.08;
  return [-span * 0.2, span * 0.8] as [number, number];
};
type Series = {
  key: string;
  name: string;
  color: string;
  axis?: "left" | "right";
  kind: "bar" | "line" | "area";
  channel?: string;
};
type Row = Record<string, number | string | null>;
type Column = {
  key: string;
  label: string;
  format?: (v: number | null) => string;
};
type View = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  series: Series[];
  columns: Column[];
  left?: "money" | "people";
  right?: "money" | "people" | "rate";
};
const monthColumn: Column = { key: "month", label: "Month" };
const moneyColumn = (key: string, label: string): Column => ({
  key,
  label,
  format: money,
});
const countColumn = (key: string, label: string): Column => ({
  key,
  label,
  format: whole,
});
const bar = (key: string, name: string, color: string): Series => ({
  key,
  name,
  color,
  kind: "bar",
});
const line = (
  key: string,
  name: string,
  color: string,
  axis: "left" | "right" = "right",
): Series => ({ key, name, color, kind: "line", axis });

function BreakdownTable({ rows, columns }: { rows: Row[]; columns: Column[] }) {
  return (
    <div className="deepTable">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.month)}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.key === "month"
                    ? row.month
                    : (c.format ?? money)(
                        row[c.key] === null ? null : Number(row[c.key]),
                      )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EcommerceViews({
  model: a,
  setModel,
  page,
  modelName,
  ImageExportControl,
  MetricHelp,
}: CommercePresentation & {
  model: EcommerceModel;
  setModel: (a: EcommerceModel) => void;
  page: string;
  modelName: string;
}) {
  const [tab, setTab] = useState("budget");
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [future, setFuture] = useState(false);
  const [editMonth, setEditMonth] = useState("");
  const [editTotal, setEditTotal] = useState<number | null>(null);
  const [editChannel, setEditChannel] = useState("");
  const [editSpend, setEditSpend] = useState(0);
  const [drag, setDrag] = useState<{
    month: string;
    channel: string;
    y: number;
    value: number;
    total: number;
    original: EcommerceModel;
  } | null>(null);
  const projection = forecastEcommerce(a);
  const analysis = ecommerceAnalysis(projection, a);
  const last = analysis[analysis.length - 1];
  const unit = ecommerceProjectionEconomics(projection, a);
  const paid = a.channels.filter(
    (c) => c.model !== "manual" && c.goLiveMonth > 0,
  );
  const rows: Row[] = analysis.map(({ segments, ...row }) => ({
    ...row,
    ...Object.fromEntries(
      paid.map((c, i) => [
        `channel${i}`,
        segments.find((s) => s.name === c.name)?.spend ?? 0,
      ]),
    ),
  }));
  const month = rows.some((row) => row.month === editMonth)
    ? editMonth
    : String(rows[0].month);
  const slug = (modelName || "GrowthCast")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) =>
      setModel(
        editEcommerceMonthBudget(
          drag.original,
          drag.month,
          drag.value -
            ((event.clientY - drag.y) * Math.max(drag.total, 1) * 1.25) / 300,
          future,
          drag.channel,
        ),
      );
    const stop = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [drag, future, setModel]);
  const views: View[] = [
    {
      id: "budget",
      label: "Budget breakdown",
      eyebrow: "Acquisition planning",
      title: "Budget breakdown by subchannel",
      description:
        "Monthly allocated spend from each enabled paid subchannel’s go-live month onward.",
      series: [
        ...paid.map((c, i) => ({
          ...line(`channel${i}`, c.name, colors[i % colors.length], "left"),
          channel: c.name,
        })),
        line("paidSpend", "Total paid spend", "#27282a", "left"),
      ],
      columns: [
        monthColumn,
        ...paid.map((c, i) => moneyColumn(`channel${i}`, c.name)),
        moneyColumn("paidSpend", "Total"),
      ],
    },
    {
      id: "orders",
      label: "Orders overview",
      eyebrow: "Repeat purchasing",
      title: "Orders overview",
      description:
        "First orders and repeat orders against the monthly order total.",
      left: "people",
      right: "people",
      series: [
        bar("newCustomers", "First orders", colors[0]),
        bar("repeatOrders", "Repeat orders", colors[1]),
        line("orders", "Total orders", "#27282a"),
      ],
      columns: [
        monthColumn,
        countColumn("newCustomers", "First orders"),
        countColumn("repeatCustomers", "Returning buyers"),
        countColumn("repeatOrders", "Repeat orders"),
        countColumn("orders", "Total orders"),
        { key: "repeatOrderShare", label: "Repeat order share", format: pct },
      ],
    },
    {
      id: "revenue",
      label: "Revenue overview",
      eyebrow: "Revenue composition",
      title: "Revenue overview",
      description:
        "First-purchase and repeat-order sales, refunds, and net sales in each month.",
      series: [
        bar("newRevenue", "First-purchase sales", colors[0]),
        bar("repeatRevenue", "Repeat sales", colors[1]),
        bar("refundMovement", "Refunds", "#27282a"),
        line("netRevenue", "Net sales", colors[2]),
      ],
      columns: [
        monthColumn,
        moneyColumn("newRevenue", "First-purchase sales"),
        moneyColumn("repeatRevenue", "Repeat sales"),
        moneyColumn("refundMovement", "Refunds"),
        moneyColumn("netRevenue", "Net sales"),
        moneyColumn("cogs", "Product cost"),
        moneyColumn("fulfillment", "Fulfillment"),
        moneyColumn(
          "contributionAfterMarketing",
          "Contribution after marketing",
        ),
      ],
    },
    {
      id: "growth",
      label: "Growth rate",
      eyebrow: "Growth momentum",
      title: "Growth rate",
      description:
        "Net-sales change and growth against the previous projected month. The first comparison is unavailable.",
      right: "rate",
      series: [
        bar("salesChange", "Net-sales change", colors[0]),
        line("salesGrowth", "Sales growth", colors[1]),
      ],
      columns: [
        monthColumn,
        moneyColumn("netRevenue", "Net sales"),
        moneyColumn("salesChange", "Net-sales change"),
        { key: "salesGrowth", label: "Growth rate", format: pct },
        moneyColumn("marketing", "Marketing spend"),
        moneyColumn(
          "contributionAfterMarketing",
          "Contribution after marketing",
        ),
      ],
    },
    {
      id: "customers",
      label: "Customers overview",
      eyebrow: "Customer movement",
      title: "Customers overview",
      description:
        "New and returning buyers against the cumulative acquired customer base.",
      left: "people",
      right: "people",
      series: [
        { ...bar("newCustomers", "New customers", colors[0]), axis: "right" },
        line("customers", "Total customers", "#27282a", "left"),
        line("repeatCustomers", "Returning buyers", colors[1], "right"),
      ],
      columns: [
        monthColumn,
        countColumn("newCustomers", "New customers"),
        countColumn("repeatCustomers", "Returning buyers"),
        countColumn("customers", "Total customers"),
        moneyColumn("cac", "Blended CAC"),
      ],
    },
    {
      id: "cashflow",
      label: "Cash flow",
      eyebrow: "Cash collection",
      title: "Cash flow breakdown",
      description:
        "Same-month order payments less refunds and payment fees. Excludes inventory timing, taxes, and settlement delays.",
      series: [
        bar("revenue", "Order payments", colors[0]),
        bar("refundMovement", "Refunds", colors[1]),
        bar("feeMovement", "Payment fees", "#27282a"),
        line("cashReceipts", "Net cash receipts", colors[2]),
      ],
      columns: [
        monthColumn,
        moneyColumn("revenue", "Order payments"),
        moneyColumn("refundMovement", "Refunds"),
        moneyColumn("feeMovement", "Payment fees"),
        moneyColumn("cashReceipts", "Net cash receipts"),
      ],
    },
  ];
  const active = views.find((v) => v.id === tab)!;
  const image = (
    id: string,
    title: string,
    description: string,
    square = false,
  ) => (
    <ImageExportControl
      targetId={id}
      filename={`${slug}-${id}.png`}
      title={title}
      description={description}
      square={square}
    />
  );
  const chart = (view: View, id: string, height: number, deep = false) => {
    const series = view.series.filter(
      (s) => !deep || s.kind === "bar" || !hiddenLines[view.id],
    );
    const axisValues = (axis: "left" | "right") =>
      rows.flatMap((row) => {
        const onAxis = series.filter((s) => (s.axis ?? "left") === axis);
        const bars = onAxis
          .filter((s) => s.kind === "bar")
          .map((s) => Number(row[s.key] ?? 0));
        return [
          bars.reduce((sum, v) => sum + Math.max(0, v), 0),
          bars.reduce((sum, v) => sum + Math.min(0, v), 0),
          ...onAxis
            .filter((s) => s.kind !== "bar")
            .map((s) => Number(row[s.key] ?? 0)),
        ];
      });
    const tick =
      (kind: "money" | "people" | "rate" = "money") =>
      (v: number) =>
        kind === "people"
          ? whole(v)
          : kind === "rate"
            ? pct(v)
            : `$${Math.round(v / 1000)}k`;
    return (
      <div id={id} className={deep ? "deepChart" : "imageChart"}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={rows}
            margin={{ left: 10, right: 24 }}
            stackOffset="sign"
          >
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={colors[0]} stopOpacity=".35" />
                <stop offset="1" stopColor={colors[0]} stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(v) => v.slice(2)}
              minTickGap={30}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={tick(view.left)}
              domain={deep ? domain(axisValues("left")) : undefined}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              hide={!series.some((s) => s.axis === "right")}
              tickFormatter={tick(view.right ?? view.left)}
              domain={deep ? domain(axisValues("right")) : undefined}
            />
            <Tooltip
              formatter={(value, name) => {
                const s = series.find((s) => s.name === name);
                const kind =
                  s?.axis === "right" ? (view.right ?? view.left) : view.left;
                return [
                  kind === "rate"
                    ? pct(Number(value))
                    : kind === "people"
                      ? whole(Number(value))
                      : money2(Number(value)),
                  name,
                ];
              }}
            />
            <Legend />
            {series.map((s) =>
              s.kind === "bar" ? (
                <Bar
                  key={s.key}
                  yAxisId={s.axis ?? "left"}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  stackId="movement"
                  isAnimationActive={false}
                />
              ) : s.kind === "area" ? (
                <Area
                  key={s.key}
                  yAxisId={s.axis ?? "left"}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  fill={`url(#${id}-fill)`}
                  strokeWidth={3}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.key}
                  yAxisId={s.axis ?? "left"}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={s.channel ? 2 : 3}
                  activeDot={s.channel ? false : undefined}
                  isAnimationActive={false}
                  dot={
                    deep && s.channel
                      ? (props: {
                          cx?: number;
                          cy?: number;
                          payload?: Row;
                        }) => (
                          <circle
                            key={`${s.key}-${props.payload?.month}`}
                            cx={props.cx}
                            cy={props.cy}
                            r={8}
                            fill="#fff"
                            stroke={s.color}
                            strokeWidth={2}
                            className="draggableDot"
                            onPointerDown={(event) => {
                              event.preventDefault();
                              setDrag({
                                month: String(props.payload?.month),
                                channel: s.channel!,
                                y: event.clientY,
                                value: Number(props.payload?.[s.key] ?? 0),
                                total: Number(props.payload?.paidSpend ?? 0),
                                original: a,
                              });
                            }}
                          />
                        )
                      : false
                  }
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };
  if (page === "deepdive")
    return (
      <section className="deepCard">
        <div className="deepTabs">
          {views.map((v) => (
            <button
              key={v.id}
              className={tab === v.id ? "active" : ""}
              aria-pressed={tab === v.id}
              onClick={() => setTab(v.id)}
            >
              {v.label}
            </button>
          ))}
          {image(`deep-chart-ecom-${tab}`, active.title, active.description)}
        </div>
        <div className="deepTitle">
          <div>
            <span>{active.eyebrow}</span>
            <h2>{active.title}</h2>
            <p>{active.description}</p>
          </div>
          <div
            className={`deepActions ${tab === "budget" ? "budgetActions" : ""}`}
          >
            {tab === "budget" && (
              <>
                <label className="deepEditable">
                  Starting monthly budget{" "}
                  <span>
                    $
                    <input
                      aria-label="Deep Dive monthly budget"
                      type="number"
                      min="0"
                      step="1000"
                      value={ecommercePaidBudget(a)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 0)
                          setModel(setEcommercePaidBudget(a, n));
                      }}
                    />
                  </span>
                </label>
                <label className="futureToggle">
                  <input
                    aria-label="Apply budget edits to future months"
                    type="checkbox"
                    checked={future}
                    onChange={(e) => setFuture(e.target.checked)}
                  />{" "}
                  Apply chart edits to future months
                </label>
                <button
                  onClick={() =>
                    setModel({
                      ...a,
                      channels: a.channels.map((c) => ({
                        ...c,
                        spendOverrides: {},
                      })),
                    })
                  }
                >
                  <RotateCcw size={12} /> Reset chart
                </button>
              </>
            )}
            <button
              onClick={() =>
                setHiddenLines({ ...hiddenLines, [tab]: !hiddenLines[tab] })
              }
            >
              {hiddenLines[tab] ? "Show lines" : "Hide lines"}
            </button>
          </div>
        </div>
        {tab === "budget" && (
          <details className="budgetAdvanced">
            <summary>Advanced budget controls</summary>
            <div className="budgetPlanner">
              <label>
                Monthly budget growth (%)
                <input
                  aria-label="Monthly channel budget growth (%)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={a.budgetGrowth * 100}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n <= 100)
                      setModel({ ...a, budgetGrowth: n / 100 });
                  }}
                />
              </label>
              <label>
                Change month
                <select
                  aria-label="Budget month"
                  value={month}
                  onChange={(e) => {
                    setEditMonth(e.target.value);
                    setEditTotal(
                      Number(
                        rows.find((r) => r.month === e.target.value)
                          ?.paidSpend ?? 0,
                      ),
                    );
                  }}
                >
                  {rows.map((r) => (
                    <option key={String(r.month)}>{r.month}</option>
                  ))}
                </select>
              </label>
              <label>
                Monthly total ($)
                <input
                  aria-label="Monthly budget total"
                  type="number"
                  min="0"
                  value={
                    editTotal ??
                    Number(rows.find((r) => r.month === month)?.paidSpend ?? 0)
                  }
                  onChange={(e) =>
                    setEditTotal(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </label>
              <button
                onClick={() =>
                  setModel(
                    editEcommerceMonthBudget(
                      a,
                      month,
                      editTotal ??
                        Number(
                          rows.find((r) => r.month === month)?.paidSpend ?? 0,
                        ),
                      false,
                    ),
                  )
                }
              >
                Apply to month
              </button>
              <button
                onClick={() =>
                  setModel(
                    editEcommerceMonthBudget(
                      a,
                      month,
                      editTotal ??
                        Number(
                          rows.find((r) => r.month === month)?.paidSpend ?? 0,
                        ),
                      true,
                    ),
                  )
                }
              >
                Apply from month onward
              </button>
            </div>
            <div className="budgetPlanner">
              <label>
                Subchannel
                <select
                  aria-label="Budget edit subchannel"
                  value={editChannel}
                  onChange={(e) => {
                    setEditChannel(e.target.value);
                    const c = paid.find((c) => c.name === e.target.value);
                    setEditSpend(c ? ecommerceMonthSpend(a, c, month) : 0);
                  }}
                >
                  <option value="">Choose a channel</option>
                  {paid.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Subchannel spend
                <input
                  aria-label="Budget edit subchannel spend"
                  type="number"
                  min="0"
                  step="100"
                  value={editSpend}
                  onChange={(e) =>
                    setEditSpend(Math.max(0, Number(e.target.value) || 0))
                  }
                />
              </label>
              <button
                disabled={!editChannel}
                onClick={() =>
                  setModel(
                    editEcommerceMonthBudget(
                      a,
                      month,
                      editSpend,
                      future,
                      editChannel,
                    ),
                  )
                }
              >
                Apply
              </button>
            </div>
            <p className="dragHint">
              Drag a channel point or edit its spend in $100 steps. The
              remaining paid budget is redistributed across other live channels;
              monthly totals stay fixed.
            </p>
          </details>
        )}
        {tab === "cashflow" && (
          <div className="cashInputs">
            <label>
              Payment fees (%)
              <input
                aria-label="Cash flow payment fee rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={a.feeRate * 100}
                onChange={(e) =>
                  setModel({
                    ...a,
                    feeRate: Math.min(
                      1,
                      Math.max(0, Number(e.target.value) / 100 || 0),
                    ),
                  })
                }
              />
            </label>
            <label>
              Refunds (%)
              <input
                aria-label="Cash flow refund rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={a.refundRate * 100}
                onChange={(e) =>
                  setModel({
                    ...a,
                    refundRate: Math.min(
                      1,
                      Math.max(0, Number(e.target.value) / 100 || 0),
                    ),
                  })
                }
              />
            </label>
          </div>
        )}
        {chart(active, `deep-chart-ecom-${tab}`, 360, true)}
        {tab === "cashflow" && (
          <div className="cashSummary commerceCashSummary">
            {[
              ["Gross sales", "revenue"],
              ["Refunds", "refundMovement"],
              ["Payment fees", "feeMovement"],
              ["Net cash receipts", "cashReceipts"],
            ].map(([label, key]) => (
              <article key={key}>
                <small>{label}</small>
                <strong>
                  {money(rows.reduce((sum, row) => sum + Number(row[key]), 0))}
                </strong>
              </article>
            ))}
          </div>
        )}
        <BreakdownTable rows={rows} columns={active.columns} />
      </section>
    );
  if (page !== "forecast") return null;
  const cards = [
    [
      "Monthly net sales",
      money(last.netRevenue),
      `Net order sales in ${last.month}, after refunds.`,
    ],
    [
      "Monthly orders",
      whole(last.orders),
      "First orders plus repeat orders in the ending month.",
    ],
    [
      "Total customers",
      whole(last.customers),
      "Cumulative unique buyers, including the opening customer base.",
    ],
    [
      "Maximum CAC",
      money(unit.maxCac),
      `${a.targetLtvCac}:1 target 12-month contribution:CAC.`,
    ],
    [
      "Repeat order share",
      pct(last.repeatOrderShare),
      "Repeat orders divided by all orders in the ending month.",
    ],
    [
      "Average order value",
      money(last.aov),
      "Gross order sales divided by orders.",
    ],
    [
      "12-month contribution",
      money(unit.twelveMonthValue),
      "First-order contribution plus eleven expected months of repeat-order contribution.",
    ],
    [
      "Actual blended CAC",
      money(last.cac),
      "All channel spend, commissions and marketing overhead divided by new buyers.",
    ],
    [
      "Paid acquisition ROAS",
      ratio(last.roas),
      "Net first-purchase sales attributed to CPC/CPM channels divided by their spend.",
    ],
    [
      "Marketing efficiency",
      ratio(last.mer),
      "All net sales divided by all marketing costs.",
    ],
  ];
  const trajectory: View = {
    ...views[2],
    title: "Revenue trajectory",
    description: "Monthly gross and net order sales from the opening baseline",
    series: [
      { ...line("revenue", "Gross sales", colors[0], "left"), kind: "area" },
      line("netRevenue", "Net sales", colors[1], "left"),
    ],
  };
  const customers: View = {
    ...views[4],
    title: "Customer growth",
    description: "Total customers, first purchases, and returning buyers",
    series: [
      line("customers", "Total customers", "#27282a", "left"),
      line("repeatCustomers", "Returning buyers", colors[1]),
      line("newCustomers", "New customers", colors[0]),
    ],
  };
  const chartCard = (v: View, id: string, wide = false) => (
    <section className={`chartCard ${wide ? "wide" : ""}`}>
      <div className="chartTitle">
        <div>
          <h2>{v.title}</h2>
          <p>{v.description}</p>
        </div>
        <div className="chartTools">
          {wide && <TrendingUp size={22} />}
          {image(id, v.title, v.description)}
        </div>
      </div>
      {chart(v, id, wide ? 300 : 260)}
    </section>
  );
  return (
    <>
      <div className="metricsExport">
        <div className="metricsExportHead">
          <span>Marquee metrics</span>
          {image(
            "ecom-marquee-metrics",
            "Marquee commerce metrics",
            "The ten numbers that frame the current forecast.",
            true,
          )}
        </div>
        <div id="ecom-marquee-metrics">
          {[0, 5].map((start) => (
            <section
              key={start}
              className={`cards ${start ? "secondaryCards" : ""}`}
            >
              {cards
                .slice(start, start + 5)
                .map(([label, value, definition]) => (
                  <article key={label}>
                    <small>{label.toUpperCase()}</small>
                    <MetricHelp label={label}>{definition}</MetricHelp>
                    <strong>{value}</strong>
                  </article>
                ))}
            </section>
          ))}
        </div>
      </div>
      <section
        className="churnDiagnostics"
        aria-labelledby="commerce-diagnostics-title"
      >
        <div>
          <h3 id="commerce-diagnostics-title">Order contribution diagnostic</h3>
          <p>
            Revenue is earned from orders placed each month. Contribution
            deducts product costs, refunds, fees and fulfillment.
          </p>
        </div>
        <article>
          <small>FIRST-ORDER CONTRIBUTION</small>
          <strong>{money(unit.firstOrderContribution)}</strong>
          <em>Weighted contribution per acquired buyer</em>
        </article>
        <article>
          <small>CONTRIBUTION AFTER MARKETING</small>
          <strong>{money(last.contributionAfterMarketing)}</strong>
          <em>Ending-month contribution less marketing costs</em>
        </article>
      </section>
      {chartCard(trajectory, "chart-ecom-trajectory", true)}
      <div className="chartGrid">
        {chartCard(
          {
            ...views[2],
            title: "Revenue bridge",
            description:
              "Monthly first-purchase sales, repeat sales, and refunds",
            series: views[2].series.filter((s) => s.kind === "bar"),
          },
          "chart-ecom-revenue-bridge",
        )}
        {chartCard(customers, "chart-ecom-customer-growth")}
      </div>
      <section className="tableCard">
        <div className="chartTitle">
          <div>
            <h2>Monthly forecast</h2>
            <p>
              Click a month to reconcile the forecast across baseline and active
              acquisition channels.
            </p>
          </div>
        </div>
        <div className="tableWrap forecastTable">
          <table>
            <thead>
              <tr>
                {[
                  "Month",
                  "Visitors",
                  "New customers",
                  "Repeat orders",
                  "Total orders",
                  "Total customers",
                  "Gross sales",
                  "Net sales",
                  "Marketing",
                  "Contribution after marketing",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.map((row) => {
                const open = expanded === row.month;
                const toggle = () => setExpanded(open ? null : row.month);
                return (
                  <Fragment key={row.month}>
                    <tr
                      className={`monthlyRow ${open ? "expanded" : ""}`}
                      onClick={toggle}
                    >
                      <td>
                        <button
                          aria-expanded={open}
                          aria-controls={`ecom-detail-${row.month}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle();
                          }}
                        >
                          <span aria-hidden="true">{open ? "−" : "+"}</span>
                          {row.month}
                        </button>
                      </td>
                      <td>{whole(row.visitors)}</td>
                      <td>{whole(row.newCustomers)}</td>
                      <td>{whole(row.repeatOrders)}</td>
                      <td>{whole(row.orders)}</td>
                      <td>{whole(row.customers)}</td>
                      <td>
                        <b>{money(row.revenue)}</b>
                      </td>
                      <td>
                        <b>{money(row.netRevenue)}</b>
                      </td>
                      <td>{money(row.marketing)}</td>
                      <td>{money(row.contributionAfterMarketing)}</td>
                    </tr>
                    {open && (
                      <tr className="forecastDetailRow">
                        <td colSpan={10}>
                          <div
                            id={`ecom-detail-${row.month}`}
                            className="forecastDetail"
                          >
                            <table>
                              <thead>
                                <tr>
                                  <th>Channel</th>
                                  <th>Visitors</th>
                                  <th>Total customers</th>
                                  <th>Orders</th>
                                  <th>Gross sales</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ecommerceChannelBreakdown(row).map((group) => (
                                  <Fragment key={group.name}>
                                    <tr className="categoryRow">
                                      <td>
                                        <em>{group.name}</em>
                                      </td>
                                      <td>{whole(group.total.visitors)}</td>
                                      <td>{whole(group.total.customers)}</td>
                                      <td>{whole(group.total.orders)}</td>
                                      <td>{money(group.total.revenue)}</td>
                                    </tr>
                                    {group.channels.map((c) => (
                                      <tr
                                        className="channelBreakdownRow"
                                        key={c.name}
                                      >
                                        <td>{c.name}</td>
                                        <td>{whole(c.visitors)}</td>
                                        <td>{whole(c.customers)}</td>
                                        <td>{whole(c.orders)}</td>
                                        <td>{money(c.revenue)}</td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
