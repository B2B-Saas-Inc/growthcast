export default function NumberField({
  label,
  value,
  onChange,
  max = 1e9,
  min = 0,
  rate = false,
  integer = false,
  compact = false,
  channel = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
  min?: number;
  rate?: boolean;
  integer?: boolean;
  compact?: boolean;
  channel?: boolean;
}) {
  return (
    <label className={compact ? "field" : channel ? "commerceChannelField" : "ecomField"}>
      <span>
        {label}
        {rate && !compact ? " (%)" : ""}
      </span>
      <div className={compact ? "input" : undefined}>
        <input
          aria-label={`${label}${rate ? " (%)" : ""}`}
          type="number"
          min={min}
          max={rate ? 100 : max}
          step={integer ? 1 : "any"}
          value={rate ? Number((value * 100).toFixed(4)) : value}
          onChange={(e) => {
            const n = Number(e.target.value) / (rate ? 100 : 1);
            if (
              Number.isFinite(n) &&
              n >= min &&
              n <= (rate ? 1 : max) &&
              (!integer || Number.isInteger(n))
            )
              onChange(n);
          }}
        />
        {compact && <b>{rate ? "%" : ""}</b>}
      </div>
    </label>
  );
}
