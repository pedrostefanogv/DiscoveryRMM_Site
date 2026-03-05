interface InheritableFieldToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function InheritableFieldToggle({
  checked,
  onChange,
  disabled,
}: InheritableFieldToggleProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-white/20 bg-white/5"
      />
      Herdar
    </label>
  );
}
