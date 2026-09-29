import { useState } from "react";
import ChannelLibrary, { channelCategoryNames } from "./ChannelLibrary";
import ChannelRow from "./ChannelRow";
import NumberField from "./ForecastNumberField";
import type { ChannelModel } from "../channels";
import {
  addEcommerceChannel,
  ecommerceChannelControls,
  ecommercePaidBudget,
  setEcommercePaidBudget,
  type EcommerceModel,
} from "../ecommerce";
import { forecastEcommerce } from "../engine/forecast";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
  });
export default function EcommerceChannels({
  model: a,
  setModel,
}: {
  model: EcommerceModel;
  setModel: (a: EcommerceModel) => void;
}) {
  const [tab, setTab] = useState<ChannelModel | "general">("general");
  const [showHidden, setShowHidden] = useState(false);
  const [status, setStatus] = useState("");
  const channels = ecommerceChannelControls(a);
  const budget = ecommercePaidBudget(a);
  const defaults = a.channelDefaults ?? {
    conversionRate: a.conversionRate,
    aov: a.aov,
  };
  const allocation = channels.reduce(
    (sum, c) =>
      sum + (c.model !== "manual" && c.goLiveMonth > 0 ? c.allocation : 0),
    0,
  );
  const launchRows = forecastEcommerce({
    ...a,
    visitors: 0,
    customers: 0,
    trafficGrowth: 0,
    budgetGrowth: 0,
    channels: channels.map((c) => ({
      ...c,
      goLiveMonth: c.goLiveMonth ? 1 : 0,
      spendOverrides: {},
    })),
    months: 1,
  })[0].segments;
  const launchTraffic = launchRows.reduce((sum, c) => sum + c.visitors, 0);
  const setChannels = (updated: typeof channels) =>
    setModel({
      ...a,
      budget,
      channels: updated.map((c) => ({
        ...c,
        spend: c.model === "manual" ? c.spend : budget * c.allocation,
      })),
    });
  const applyDefault = (patch: Partial<typeof defaults>) =>
    setModel({
      ...a,
      channelDefaults: { ...defaults, ...patch },
      channels: a.channels.map((c) => ({ ...c, ...patch })),
    });
  return (
    <section className="channelCard">
      <div className="chartTitle">
        <div>
          <h2>Channel assumptions</h2>
          <p>
            Each channel adds traffic once in its go-live month; all active
            traffic then compounds at the global Traffic growth rate
          </p>
        </div>
        <b>+{launchTraffic.toLocaleString("en-US")} launch visitors</b>
      </div>
      <div className="budgetBar">
        <label>
          Paid media budget{" "}
          <span>
            <b>$</b>
            <input
              aria-label="Paid media budget"
              type="number"
              min="0"
              step="1000"
              value={budget}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value) && value >= 0)
                  setModel(setEcommercePaidBudget(a, value));
              }}
            />
            <small>/ mo</small>
          </span>
        </label>
        <label>
          Allocated{" "}
          <strong className={Math.abs(allocation - 1) > 0.001 ? "warn" : ""}>
            {pct(allocation)} · {money(budget * allocation)}
          </strong>
        </label>
      </div>
      <div className="channelTabs">
        {(["general", "cpc", "cpm", "manual"] as const).map((key) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setStatus("");
            }}
          >
            {key === "general" ? "General" : channelCategoryNames[key]}
          </button>
        ))}
        <button
          className="showHidden"
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden
            ? "Hide hidden"
            : `Show hidden (${channels.filter((c) => c.hidden).length})`}
        </button>
      </div>
      <div className="channelGroups">
        {tab === "general" ? (
          <section className="generalChannels">
            <div>
              <span>Default funnel assumptions</span>
              <h3>Set every subchannel at once</h3>
              <p>
                Changes here immediately update all direct response, demand
                generation, owned, partner, and custom channels. New channels
                inherit these defaults too. You can still override an individual
                channel afterward.
              </p>
            </div>
            <NumberField
              channel
              label="All channels first-purchase conversion"
              value={defaults.conversionRate}
              rate
              onChange={(conversionRate) => applyDefault({ conversionRate })}
            />
            <NumberField
              channel
              label="All channels average order value ($)"
              value={defaults.aov}
              onChange={(aov) => applyDefault({ aov })}
            />
          </section>
        ) : (
          <>
            <div className="channelPlanIntro">
              <div>
                <h3>{channelCategoryNames[tab]}</h3>
                <p>
                  {tab === "cpc"
                    ? "Capture demand with channels modeled by cost per click."
                    : tab === "cpm"
                      ? "Build awareness with channels modeled by impressions and site response."
                      : "Plan organic, partner, and custom acquisition with launch visitors."}
                </p>
              </div>
              <span>
                {channels.filter((c) => c.model === tab).length} in your plan
              </span>
            </div>
            <ChannelLibrary
              key={tab}
              model={tab}
              channels={channels}
              commerce
              onAdd={(preset) => {
                setModel(addEcommerceChannel(a, preset));
                setStatus(
                  `${preset.name} added or restored. Review its settings below the library.`,
                );
              }}
            />
            <p className="channelStatus" role="status">
              {status}
            </p>
            <h3 className="channelListHeading">Your channels</h3>
            {!channels.some(
              (c) => c.model === tab && (!c.hidden || showHidden),
            ) && (
              <div className="channelEmpty">
                <strong>
                  {channels.some((c) => c.model === tab)
                    ? "Your channels are hidden, not disabled"
                    : "Build your channel mix, one tactic at a time"}
                </strong>
                <p>
                  Open the library above to add or restore tactics. Hidden
                  channels still contribute to your forecast.
                </p>
              </div>
            )}
            {channels
              .map((c, index) => ({ c, index }))
              .filter(({ c }) => c.model === tab && (!c.hidden || showHidden))
              .map(({ c, index }) => (
                <ChannelRow
                  key={c.name}
                  channel={c}
                  modeled={{
                    ...c,
                    visitors:
                      launchRows.find((row) => row.name === c.name)?.visitors ??
                      0,
                  }}
                  index={index}
                  budget={budget}
                  channels={channels}
                  setChannels={setChannels}
                  onRemove={() =>
                    setModel({
                      ...a,
                      budget,
                      channels: channels.filter((_, i) => i !== index),
                    })
                  }
                >
                  <NumberField
              channel
                    label={`${c.name} first-purchase conversion`}
                    value={c.conversionRate}
                    rate
                    onChange={(conversionRate) =>
                      setChannels(
                        channels.map((row, i) =>
                          i === index ? { ...row, conversionRate } : row,
                        ),
                      )
                    }
                  />
                  <NumberField
              channel
                    label={`${c.name} average order value ($)`}
                    value={c.aov}
                    onChange={(aov) =>
                      setChannels(
                        channels.map((row, i) =>
                          i === index ? { ...row, aov } : row,
                        ),
                      )
                    }
                  />
                  <NumberField
              channel
                    label={`${c.name} first-purchase commission`}
                    value={c.commissionRate}
                    rate
                    onChange={(commissionRate) =>
                      setChannels(
                        channels.map((row, i) =>
                          i === index ? { ...row, commissionRate } : row,
                        ),
                      )
                    }
                  />
                  {c.model === "manual" && (
                    <NumberField
              channel
                      label={`${c.name} monthly non-media spend ($)`}
                      value={c.spend}
                      onChange={(spend) =>
                        setChannels(
                          channels.map((row, i) =>
                            i === index ? { ...row, spend } : row,
                          ),
                        )
                      }
                    />
                  )}
                </ChannelRow>
              ))}
          </>
        )}
      </div>
    </section>
  );
}
