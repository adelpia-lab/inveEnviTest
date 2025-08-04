# ProductInput Component

## Overview
The ProductInput component is a React component that allows users to input model names and product names with validation and server communication capabilities.

## Features

### Input Validation
- **Model Name**: Must be exactly 8 digits (e.g., "61514540")
- **Product Names**: Must be exactly 6 characters in the format "XX1234" (2 uppercase letters + 4 digits)
- **Quantity**: Exactly 10 product names are required

### Data Persistence
- **localStorage**: Saves data locally in the browser
- **Server Storage**: Sends data to backend WebSocket server for persistent storage
- **Auto-loading**: Automatically loads saved data on component mount

### WebSocket Communication
- **Server Integration**: Communicates with backend WebSocket server
- **Real-time Updates**: Receives initial data from server on connection
- **Error Handling**: Comprehensive error handling for network issues

## Usage

```tsx
import ProductInput from './components/SystemSet/ProductInput';

// Basic usage
<ProductInput />

// With WebSocket connection
<ProductInput wsConnection={wsConnection} />

// With save callback
<ProductInput 
  wsConnection={wsConnection} 
  onSave={(data) => console.log('Saved:', data)} 
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `wsConnection` | `WebSocket` | No | WebSocket connection for server communication |
| `onSave` | `(data: ProductInputData) => void` | No | Callback function called when data is saved |

## Data Structure

```typescript
interface ProductInputData {
  modelName: string;      // 8-digit number
  productNames: string[]; // Array of 10 product names (6 characters each)
}
```

## Validation Rules

### Model Name
- Must be exactly 8 characters long
- Must contain only digits (0-9)
- Example: "61514540"

### Product Names
- Must be exactly 6 characters long
- First 2 characters must be uppercase letters (A-Z)
- Last 4 characters must be digits (0-9)
- Examples: "PL2222", "AB1234", "XY5678"

## Backend Integration

The component sends data to the backend using the following WebSocket message format:
```
[SAVE_PRODUCT_INPUT] {"modelName":"61514540","productNames":["PL2222","PL2233",...]}
```

The backend saves this data to a JSON file (`product_input.json`) and sends confirmation messages back to the client.

## Error Handling

The component provides comprehensive error handling for:
- Invalid input formats
- Network connection issues
- Server communication errors
- Data validation failures

## UI Features

- **Modal Dialog**: Clean, responsive dialog interface
- **Real-time Validation**: Immediate feedback on input errors
- **Loading States**: Visual feedback during save operations
- **Success Messages**: Confirmation when data is saved successfully
- **Auto-formatting**: Automatic uppercase conversion for product names
- **Input Restrictions**: Prevents invalid characters from being entered

## Dependencies

- React 19+
- Material-UI (MUI)
- Zod (for validation)
- TypeScript

## Browser Compatibility

- Modern browsers with WebSocket support
- localStorage support required for local data persistence 