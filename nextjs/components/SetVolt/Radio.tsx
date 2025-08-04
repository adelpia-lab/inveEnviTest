import { useContext } from "react";
import RadioContext, { RadioContextType } from "./RadioContext";

interface RadioProps {
  children: React.ReactNode;
  value: string;
  name?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}

export default function Radio({ children, value, name, defaultChecked, disabled }: RadioProps) {
  const group: RadioContextType = useContext(RadioContext);

  return (
    <label className="flex items-center space-x-2 cursor-pointer">
      <input
        type="radio"
        value={value}
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled || group.disabled}
        checked={group.value !== undefined ? value === group.value : undefined}
        onChange={(e) => group.onChange && group.onChange(e.target.value)}
        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
      />
      <span className="text-sm font-medium text-gray-900">{children}</span>
    </label>
  );
}
