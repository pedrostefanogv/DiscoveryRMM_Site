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
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border-strong bg-surface-light"
      />
      Herdar
    </label>
  );
}
