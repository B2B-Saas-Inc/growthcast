import NumberField from "./ForecastNumberField";
import EcommerceChannels from "./EcommerceChannels";
import EcommerceViews, { type CommercePresentation } from "./EcommerceViews";
import { type EcommerceModel, validMonth } from "../ecommerce";
import "./ecommerce.css";

type Props = CommercePresentation & {
  model: EcommerceModel;
  setModel: (value: EcommerceModel) => void;
  modelName: string;
  setModelName: (value: string) => void;
  page: string;
  switchModel: (model: "b2c" | "b2b") => void;
};
export default function EcommerceForecast({
  model: a,
  setModel,
  modelName,
  setModelName,
  page,
  switchModel,
  ImageExportControl,
  MetricHelp,
}: Props) {
  const field = (
    label: string,
    key: keyof EcommerceModel,
    rate = false,
    max?: number,
    min?: number,
    integer = false,
  ) => (
    <NumberField
      key={key}
      compact={page === "forecast"}
      label={label}
      value={a[key] as number}
      onChange={(value) => setModel({ ...a, [key]: value })}
      rate={rate}
      max={max}
      min={min}
      integer={integer}
    />
  );
  return (
    <section
      className={`layout ${page === "forecast" ? "forecastMode" : "ecomWide"}`}
    >
      {page === "forecast" && (
        <aside aria-label="Forecast assumptions">
          <div className="panelHead">
            <h2>Assumptions</h2>
            <span>D2C</span>
          </div>
          <p>
            Illustrative planning inputs. Replace these with your own store
            economics. Repeat purchasing defaults to zero.
          </p>
          <div>
            {field("Forecast months", "months", false, 60, 1, true)}
            {field("Monthly acquisition traffic growth", "trafficGrowth", true)}
            {field("Visitor to first purchase", "conversionRate", true)}
            {field("First-order average value ($)", "aov")}
            {field("Monthly repeat buyer rate", "repeatRate", true)}
            {field(
              "Orders per repeat buyer per month",
              "repeatOrders",
              false,
              100,
              1,
            )}
            {field("Repeat-order average value ($)", "repeatAov")}
          </div>
          <details className="advanced">
            <summary>Advanced assumptions</summary>
            <div>
              {field(
                "Product gross margin before refunds",
                "grossMargin",
                true,
              )}
              {field("Fulfillment cost per order ($)", "fulfillmentCost")}
              {field("Payment fee rate", "feeRate", true)}
              {field("Refund rate on gross sales", "refundRate", true)}
              {field("Monthly marketing overhead ($)", "overhead")}
              {field(
                "Target 12-month contribution to CAC",
                "targetLtvCac",
                false,
                100,
                0.1,
              )}
            </div>
          </details>
        </aside>
      )}
      <div className="dashboard ecommerceMode">
        {(page === "baseline" || page === "methodology") && (
          <div className="ecomHeading">
            <div>
              <span>D2C / ECOMMERCE</span>
              <h2>
                {page === "baseline"
                  ? "Build your commerce baseline"
                  : "How this forecast works"}
              </h2>
              <p>
                One-time orders, repeat purchasing, and contribution economics.
              </p>
            </div>
          </div>
        )}
        {page === "baseline" && (
          <section className="baselineCard">
            <fieldset className="modelTypeSelector">
              <legend>Business model</legend>
              <button onClick={() => switchModel("b2c")} aria-pressed={false}>
                <strong>B2C</strong>
                <span>Signup and purchase funnel</span>
              </button>
              <button onClick={() => switchModel("b2b")} aria-pressed={false}>
                <strong>B2B</strong>
                <span>MQL, SQL, and closed-won pipeline</span>
              </button>
              <button className="active" aria-pressed={true}>
                <strong>D2C / Ecommerce</strong>
                <span>Orders and repeat purchases</span>
              </button>
            </fieldset>
            <div className="ecomFields">
              <label className="ecomField">
                Model name
                <input
                  value={modelName}
                  maxLength={120}
                  onChange={(e) => setModelName(e.target.value)}
                />
              </label>
              <label className="ecomField">
                Baseline month
                <input
                  type="month"
                  value={a.month}
                  onChange={(e) => {
                    if (validMonth(e.target.value))
                      setModel({ ...a, month: e.target.value });
                  }}
                />
              </label>
              {field(
                "Baseline monthly acquisition visitors",
                "visitors",
                false,
                undefined,
                0,
                true,
              )}
              {field(
                "Previously acquired customers",
                "customers",
                false,
                undefined,
                0,
                true,
              )}
            </div>
            <p>
              Forecasting starts the following month. Visitors represent
              potential first-time buyers. Existing customers can place repeat
              orders independently; exclude returning-buyer traffic from
              acquisition visitors to avoid double counting. Historical sales
              are not carried forward.
            </p>
          </section>
        )}
        <div hidden={page !== "channels"}>
          <EcommerceChannels model={a} setModel={setModel} />
        </div>
        <EcommerceViews
          model={a}
          setModel={setModel}
          page={page}
          modelName={modelName}
          ImageExportControl={ImageExportControl}
          MetricHelp={MetricHelp}
        />
        {page === "methodology" && (
          <section className="baselineCard">
            <h3>Orders drive revenue</h3>
            <p>
              First orders = acquisition visitors × first-purchase conversion.
              Each new buyer places one first order. Repeat buyers = opening
              cumulative customers × monthly repeat buyer rate; repeat orders =
              repeat buyers × orders per repeat buyer. New buyers enter the
              repeat pool next month. People and orders are rounded per source
              before summing.
            </p>
            <p>
              Monthly sales = first orders × source average order value + repeat
              orders × repeat average order value. Prior sales never become next
              month's sales. Customers to date accumulate without a churn
              assumption; repeat buying is a monthly probability, not guaranteed
              subscription renewal.
            </p>
            <h3>Channel traffic and attribution</h3>
            <p>
              CPC traffic = spend ÷ CPC. CPM traffic = spend ÷ CPM × 1,000 ×
              click-through rate. Zero CPC or CPM produces zero traffic. Manual
              traffic launches once, then compounds with traffic growth. Paid
              traffic also launches once and compounds; changes in monthly spend
              add or remove the corresponding purchased visitors. Live month 0
              disables the entire source. Repeat orders remain attributed to the
              original acquisition source. Commissions apply once to net
              first-purchase sales, never to future orders.
            </p>
            <h3>Contribution and cash</h3>
            <p>
              Net sales = gross sales less refunds. Product cost = gross sales ×
              (1 − gross margin); refunded product cost is not recovered.
              Payment fees use gross sales; fulfillment uses all orders.
              Contribution subtracts those costs from net sales. Contribution
              after marketing also subtracts channel spend, commissions and
              monthly overhead. Cash receipts assume same-month payment, less
              refunds and fees. Inventory timing, settlement delays, taxes and
              other operating costs are not modeled.
            </p>
            <h3>Acquisition economics</h3>
            <p>
              Blended CAC = all channel spend, commissions and overhead ÷ all
              newly acquired buyers. Paid acquisition ROAS = net first-purchase
              sales attributed to CPC/CPM sources ÷ their spend. Marketing
              efficiency ratio (MER) = all net sales ÷ all marketing costs.
              These are distinct measures.
            </p>
            <p>
              12-month contribution per new customer = first-order contribution
              + 11 × monthly repeat buyer rate × repeat orders per buyer ×
              repeat-order contribution. The first order uses
              acquisition-weighted order value; this finite forecast is not
              perpetual lifetime value. Maximum CAC is nonnegative 12-month
              contribution divided by the target contribution-to-CAC ratio.
              Undefined ratios display a dash.
            </p>
            <p>
              All values are planning estimates in USD. Assumptions, saved
              progress, charts, tables, and exports use the same deterministic
              order model.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}
