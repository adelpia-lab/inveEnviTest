import React from "react";
import RadioContext from "./RadioContext";

interface RadioGroupProps {
  label?: string;
  children: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  name?: string;
}

export default function RadioGroup({ label, children, ...rest }: RadioGroupProps) {
  return (
    <fieldset className="space-y-2 m-5 ">
      {label && (
        <legend className="text-lg font-semibold text-gray-900 mb-3 m-5">
          {label}
        </legend>
      )}
      <RadioContext.Provider value={rest}>
        <div className="space-y-2">{children}</div>
      </RadioContext.Provider>
    </fieldset>
  );
}