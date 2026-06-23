import React from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}) => {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded focus:ring-2"
      />
      {label && (
        <span className="text-sm font-medium text-gray-700 dark:text-gray-400">
          {label}
        </span>
      )}
    </label>
  );
};

export default Checkbox;
