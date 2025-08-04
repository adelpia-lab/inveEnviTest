# UsbPortSelect Component

## Overview
The UsbPortSelect component is a React component that allows users to configure USB ports for four different devices (챔버, 파워, 로드, 릴레이) in a single unified interface. It provides a modern, user-friendly way to manage USB port assignments with validation and server communication capabilities.

## Features

### Unified Interface
- **Single Window**: All four devices are configured in one dialog window
- **Dropdown Selection**: Each device has a dropdown menu to select from available USB ports
- **Real-time Validation**: Prevents duplicate port assignments across devices
- **Visual Feedback**: Clear indication of current settings and validation errors

### Data Persistence
- **localStorage**: Saves settings locally in the browser
- **Server Storage**: Sends settings to backend WebSocket server for persistent storage
- **Auto-loading**: Automatically loads saved settings on component mount and server connection

### WebSocket Communication
- **Server Integration**: Communicates with backend WebSocket server
- **Real-time Updates**: Receives initial settings from server on connection
- **Error Handling**: Comprehensive error handling for network issues
- **Save Confirmation**: Receives confirmation when settings are successfully saved

## Usage

```tsx
import UsbPortSelect from './components/UsbPortSelect/UsbPortSelect';

// Basic usage
<UsbPortSelect />

// With WebSocket connection
<UsbPortSelect wsConnection={wsConnection} />

// With selection change callback
<UsbPortSelect 
  wsConnection={wsConnection} 
  onSelectionChange={(deviceType, port) => console.log(`${deviceType}: ${port}`)} 
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `wsConnection` | `WebSocket` | No | WebSocket connection for server communication |
| `onSelectionChange` | `(deviceType: string, port: string) => void` | No | Callback function called when port selection changes |

## Data Structure

```typescript
interface DevicePorts {
  챔버: string;    // USB port for chamber device
  파워: string;    // USB port for power device
  로드: string;    // USB port for load device
  릴레이: string;  // USB port for relay device
}
```

## Available Ports

The component supports the following USB ports:
- `ttyUSB0`
- `ttyUSB1`
- `ttyUSB2`
- `ttyUSB3`

## Validation Rules

### Port Assignment
- Each device must have a unique USB port
- No two devices can share the same port
- All four devices must have valid port assignments

### Error Handling
- **Duplicate Ports**: Shows error when multiple devices are assigned the same port
- **Network Issues**: Handles WebSocket connection failures gracefully
- **Server Errors**: Displays appropriate error messages for server communication issues

## Backend Integration

The component sends data to the backend using the following WebSocket message format:
```
[SAVE_USB_PORT_SETTINGS] {"챔버":"ttyUSB0","파워":"ttyUSB1","로드":"ttyUSB2","릴레이":"ttyUSB3"}
```

The backend saves this data to a JSON file (`usb_port_settings.json`) and sends confirmation messages back to the client.

### Server Messages

#### Initial Settings (on connection)
```
Initial USB port settings: {"챔버":"ttyUSB0","파워":"ttyUSB1","로드":"ttyUSB2","릴레이":"ttyUSB3"}
```

#### Save Confirmation
```
USB port settings saved: {"챔버":"ttyUSB0","파워":"ttyUSB1","로드":"ttyUSB2","릴레이":"ttyUSB3"}
```

## UI Features

### Main Interface
- **Settings Button**: Opens the configuration dialog
- **Current Settings Display**: Shows current port assignments in a compact format
- **Dark Theme**: Consistent with the application's dark theme

### Configuration Dialog
- **Grid Layout**: Organized 2x2 grid for the four devices
- **Dropdown Menus**: Easy-to-use select dropdowns for each device
- **Validation Alerts**: Clear error and success messages
- **Loading States**: Visual feedback during save operations
- **Responsive Design**: Adapts to different screen sizes

### Visual Design
- **Material-UI Components**: Uses MUI components for consistent styling
- **Dark Theme Support**: Fully compatible with dark theme
- **Hover Effects**: Interactive hover states for better UX
- **Color Coding**: Success/error states with appropriate colors

## Error Handling

The component provides comprehensive error handling for:
- Invalid port assignments (duplicates)
- Network connection issues
- Server communication errors
- Data validation failures
- File system errors (localStorage)

## State Management

### Local State
- `devicePorts`: Current port assignments
- `tempDevicePorts`: Temporary assignments during editing
- `isOpen`: Dialog open/close state
- `isLoading`: Save operation loading state
- `isSaved`: Success state after saving
- `error`: Current error message

### Persistence
- **localStorage**: Immediate local backup
- **Server Storage**: Primary persistent storage
- **Auto-sync**: Automatic synchronization between local and server data

## Dependencies

- React 19+
- Material-UI (MUI)
- TypeScript

## Browser Compatibility

- Modern browsers with WebSocket support
- localStorage support required for local data persistence
- ES6+ features for optimal performance

## Performance Considerations

- **Efficient Rendering**: Only re-renders when necessary
- **Debounced Updates**: Prevents excessive server calls
- **Memory Management**: Proper cleanup of event listeners
- **Optimized Validation**: Fast validation checks for port assignments

## Security Features

- **Input Validation**: Prevents invalid port assignments
- **Data Sanitization**: Ensures clean data before server transmission
- **Error Boundaries**: Graceful handling of unexpected errors
- **Secure Communication**: Uses WebSocket for real-time communication

## Future Enhancements

- **Port Testing**: Built-in port connectivity testing
- **Auto-detection**: Automatic detection of available USB ports
- **Advanced Validation**: More sophisticated port validation rules
- **Bulk Operations**: Support for bulk port assignment changes 