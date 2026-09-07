import { useState } from "react";
import { BookOpen, Check, Plus, Search } from "lucide-react";
import {
  channelLibrary,
  type ChannelModel,
  type ChannelPreset,
  type EditableChannel,
} from "../channels";

export const channelCategoryNames: Record<ChannelModel, string> = {
  cpc: "Direct Response",
  cpm: "Demand Gen",
  manual: "Owned / Partner / Custom",
};

const dollars = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
function presetSummary(preset: ChannelPreset) {
  const a = preset.assumptions;
  if (preset.model === "cpc") return `${dollars(a.cpc!)} CPC`;
  if (preset.model === "cpm") return `${dollars(a.cpm!)} CPM · ${Number((a.ctr! * 100).toFixed(1))}% CTR`;
  const traffic = `${a.visitors!.toLocaleString("en-US")} launch visitors`;
  return a.affiliateCommissionRate
    ? `${traffic} · ${a.affiliateCommissionRate * 100}% × ${a.affiliateCommissionMonths} months`
    : traffic;
}

export default function ChannelLibrary({ model, channels, onAdd }: {
  model: ChannelModel;
  channels: EditableChannel[];
  onAdd: (preset: ChannelPreset) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const presets = channelLibrary.filter((preset) => preset.model === model);
  const groups = [...new Set(presets.map((preset) => preset.group))];
  const matches = presets.filter((preset) =>
    (!group || preset.group === group) &&
    `${preset.name} ${preset.group} ${preset.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <details className="channelLibrary">
      <summary>
        <BookOpen size={20} aria-hidden="true" />
        <span>Browse channel library<small>{presets.length} {channelCategoryNames[model]} tactics</small></span>
        <Plus className="libraryToggle" size={20} aria-hidden="true" />
      </summary>
      <div className="libraryBody">
        <p className="libraryDisclaimer">
          Illustrative planning assumptions in USD, not performance benchmarks. Edit them to fit your market.
          New channels start in month 1 and inherit your General funnel defaults.
        </p>
        <p className="libraryModelNote">
          {model === "manual"
            ? "Enter incremental launch visitors, not views, contacts, or messages. Traffic enters once, then grows at the global rate. Track non-media costs in Sales & Marketing Overhead on Forecast; Partners supports affiliate commissions. Avoid counting visitors already in your baseline."
            : "New channels receive any unallocated paid budget; otherwise they start at 0%. Existing allocations stay unchanged. Split the budget between channels after adding them."}
          {model === "cpm" && " For non-clickable media, use CTR as an estimated exposure-to-site response rate. This does not model view-through lift."}
        </p>
        <div className="libraryFilters">
          <label className="librarySearch">
            <span>Search {channelCategoryNames[model]}</span>
            <span><Search size={17} aria-hidden="true" /><input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a tactic, platform, or use case"
              aria-label="Search channel library"
            /></span>
          </label>
          <label>
            Tactic group
            <select aria-label="Filter tactic group" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">All groups</option>
              {groups.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <p className="libraryResultCount" role="status">{matches.length} {matches.length === 1 ? "tactic" : "tactics"} found</p>
        <div className="libraryResults" role="region" aria-label="Channel library results" tabIndex={0}>
          {matches.length ? groups.filter((name) => matches.some((preset) => preset.group === name)).map((name) => (
            <section className="libraryGroup" key={name} aria-label={name}>
              <h4>{name}</h4>
              <ul>
                {matches.filter((preset) => preset.group === name).map((preset) => {
                  const existing = channels.find((channel) => channel.name === preset.name);
                  const added = existing && !existing.hidden;
                  return (
                    <li key={preset.name}>
                      <div><strong>{preset.name}</strong><p>{preset.description}</p></div>
                      <span className="libraryEconomics">{presetSummary(preset)}</span>
                      <button
                        type="button"
                        disabled={Boolean(added)}
                        aria-label={`${added ? "Added" : existing ? "Restore" : "Add"} ${preset.name}`}
                        onClick={() => onAdd(preset)}
                      >
                        {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                        {added ? "Added" : existing ? "Restore" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )) : (
            <div className="libraryNoResults">
              <strong>No matching tactics</strong>
              <p>Try another search or use the custom tactic in this category.</p>
              <button type="button" onClick={() => { setQuery(""); setGroup(""); }}>Clear filters</button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
