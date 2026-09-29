import type { ReactNode } from "react";
import type { ChannelModel } from "../channels";
export type ChannelControls = {
  name: string;
  model: ChannelModel;
  goLiveMonth: number;
  visitors: number;
  allocation: number;
  cpc: number;
  cpm: number;
  ctr: number;
  hidden: boolean;
};
const clamp = (n: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const rateFromInput = (value: string) => clamp(Number(value) / 100, 0, 1);
const one = (n: number) => Number(n.toFixed(1));
const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
export default function ChannelRow<T extends ChannelControls>({
  channel: c,
  modeled,
  index,
  budget,
  setChannels,
  channels,
  children,
  onRemove,
}: {
  channel: T;
  modeled: T;
  index: number;
  budget: number;
  setChannels: (c: T[]) => void;
  channels: T[];
  children: ReactNode;
  onRemove: () => void;
}) {
  const update = (patch: Partial<ChannelControls>) =>
    setChannels(channels.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const setLiveMonth = (goLiveMonth: number) => {
    if (
      goLiveMonth !== 0 ||
      c.goLiveMonth === 0 ||
      c.model === "manual" ||
      c.allocation === 0
    ) {
      update({ goLiveMonth });
      return;
    }
    const recipients = channels
      .map((x, i) => ({ x, i }))
      .filter(
        ({ x, i }) => i !== index && x.model !== "manual" && x.goLiveMonth > 0,
      );
    const weight = recipients.reduce((sum, { x }) => sum + x.allocation, 0);
    setChannels(
      channels.map((x, i) => {
        if (i === index) return { ...x, goLiveMonth: 0, allocation: 0 };
        const recipient = recipients.find((r) => r.i === i);
        if (!recipient) return x;
        const share = weight ? x.allocation / weight : 1 / recipients.length;
        return { ...x, allocation: x.allocation + c.allocation * share };
      }),
    );
  };
  const spend = c.goLiveMonth === 0 ? 0 : budget * c.allocation;
  const impliedCpc = modeled.visitors ? spend / modeled.visitors : 0;
  return (
    <details className="channel" data-channel-name={c.name}>
      <summary>
        <strong>{c.name}</strong>
        <label>
          Live month
          <input
            aria-label={`${c.name} goLiveMonth`}
            type="number"
            min="0"
            max="60"
            step="1"
            value={c.goLiveMonth}
            onChange={(e) =>
              setLiveMonth(clamp(Math.round(+e.target.value), 0, 60))
            }
          />
        </label>
        {c.model === "manual" ? (
          <label>
            Launch visitors
            <input
              aria-label={`${c.name} visitors`}
              type="number"
              min="0"
              step="100"
              value={one(c.visitors)}
              onChange={(e) => update({ visitors: clamp(+e.target.value) })}
            />
          </label>
        ) : (
          <>
            <label>
              Budget %
              <input
                aria-label={`${c.name} allocation`}
                type="number"
                min="0"
                max="100"
                step="1"
                value={one(c.allocation * 100)}
                onChange={(e) =>
                  update({ allocation: rateFromInput(e.target.value) })
                }
              />
              <small>{money(spend)}</small>
            </label>
            {c.model === "cpc" ? (
              <label>
                CPC
                <input
                  aria-label={`${c.name} cpc`}
                  type="number"
                  min="0"
                  step=".1"
                  value={one(c.cpc)}
                  onChange={(e) => update({ cpc: clamp(+e.target.value) })}
                />
              </label>
            ) : (
              <>
                <label>
                  CPM
                  <input
                    aria-label={`${c.name} cpm`}
                    type="number"
                    min="0"
                    step=".1"
                    value={one(c.cpm)}
                    onChange={(e) => update({ cpm: clamp(+e.target.value) })}
                  />
                </label>
                <label>
                  CTR %
                  <input
                    aria-label={`${c.name} ctr`}
                    type="number"
                    min="0"
                    step=".1"
                    value={one(c.ctr * 100)}
                    onChange={(e) =>
                      update({ ctr: rateFromInput(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
          </>
        )}
        <span className="traffic">
          <b>{number(modeled.visitors)}</b> visits
          <small>
            {c.model !== "manual" ? `${money(impliedCpc)} expected CPC` : ""}
          </small>
        </span>
      </summary>
      <div className="channelAdvanced">
        {children}
        <div className="channelRowActions">
          <button
            className="hideChannel"
            onClick={() => update({ hidden: !c.hidden })}
          >
            {c.hidden ? "Restore subchannel" : "Hide subchannel"}
          </button>
          <button
            className="hideChannel"
            onClick={onRemove}
            aria-label={`Remove ${c.name}`}
          >
            Remove channel
          </button>
          <small>
            Hiding only changes this list. Set Live month to 0 to disable.
            Removing clears this channel’s monthly spend edits and leaves its
            budget unallocated.
          </small>
        </div>
      </div>
    </details>
  );
}
