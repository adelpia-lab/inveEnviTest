# TimeModePopup Component

A modal popup component for configuring timer mode settings with T1-T8 time inputs.

## Features

- 1024x800px modal popup
- Background image using `/img/timeOp.svg`
- T1-T8 time input fields (in minutes)
- SAVE and CANCEL buttons
- Responsive design with Tailwind CSS
- TypeScript support

## Props

```typescript
interface TimeModePopupProps {
  isOpen: boolean;           // Controls modal visibility
  onClose: () => void;       // Called when modal is closed
  onSave: (timeValues: Record<string, string>) => void; // Called when SAVE is clicked
}
```

## Usage

```tsx
import TimeModePopup from '/components/TimeModePopup/TimeModePopup';

const [isTimeModePopupOpen, setIsTimeModePopupOpen] = useState(false);

const handleTimeModeSave = (timeValues) => {
  console.log('Saved time values:', timeValues);
  // Handle saving time values
};

const handleTimeModeClose = () => {
  setIsTimeModePopupOpen(false);
};

<TimeModePopup
  isOpen={isTimeModePopupOpen}
  onClose={handleTimeModeClose}
  onSave={handleTimeModeSave}
/>
```

## Time Values

The component manages time values for T1 through T8, where each value represents minutes. The values are stored as strings and can be converted to numbers as needed.

## Styling

The component uses Tailwind CSS classes and includes:
- Fixed positioning for modal overlay
- Centered modal with backdrop
- Input field styling with focus states
- Button styling with hover effects
- Responsive grid layout for time inputs
