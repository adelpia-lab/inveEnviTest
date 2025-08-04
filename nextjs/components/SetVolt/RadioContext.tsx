import { createContext } from 'react';

interface RadioContextType {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}
const RadioContext = createContext<RadioContextType>({});

export default RadioContext;
export type { RadioContextType };
