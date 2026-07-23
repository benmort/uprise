import React from "react";
import { cn } from "@uprise/ui";

// Retiring prog/ui → @uprise/ui. This native-input Checkbox has a distinct API
// (checked/onChange/label) from the shared Radix Checkbox, so it's retokenised in place
// (raw brand-*/gray-* → design tokens) and kept for its 2 consumers; they move to the shared
// Checkbox in a later step, then this is deleted.
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, label, disabled = false, className = "" }) => {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-input accent-primary focus:ring-2 focus:ring-ring"
      />
      {label ? <span className="text-sm font-medium text-foreground">{label}</span> : null}
    </label>
  );
};

export default Checkbox;
