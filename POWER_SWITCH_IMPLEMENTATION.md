# Power Switch Implementation

## Overview
This implementation adds a power switch functionality that:
1. When PowerSwitch is clicked, it sends a WebSocket message to the server
2. The server sets `machineRunning = true` as a global variable
3. The server then executes `runNextTankEnviTestProcess()`

## Files Modified

### 1. Server-side (backend-websocket-server.js)
- **Added global variable**: `machineRunning = false`
- **Added utility functions**:
  - `getMachineRunningStatus()` - returns current machine running status
  - `setMachineRunningStatus(status)` - sets machine running status
- **Added message handler**: `[POWER_SWITCH]` message processing
- **Added import**: `runNextTankEnviTestProcess` from RunTestProcess.js

### 2. Client-side (PowerSwitch.tsx)
- **Added WebSocket connection prop**: `wsConnection`
- **Added message handling**: Listens for power switch status messages from server
- **Added state synchronization**: Syncs local state with server state
- **Added message sending**: Sends `[POWER_SWITCH] ON/OFF` messages when clicked

### 3. Main page (index.js)
- **Updated PowerSwitch component**: Passes WebSocket connection as prop
- **Added message handling**: Handles power switch messages globally

## Message Flow

### When Power Switch is clicked ON:
1. **Client**: PowerSwitch component sends `[POWER_SWITCH] ON`
2. **Server**: 
   - Sets `machineRunning = true`
   - Sends confirmation: `[POWER_SWITCH] ON - Machine running: true`
   - Executes `runNextTankEnviTestProcess()`
3. **Client**: PowerSwitch component receives confirmation and updates UI

### When Power Switch is clicked OFF:
1. **Client**: PowerSwitch component sends `[POWER_SWITCH] OFF`
2. **Server**: 
   - Sets `machineRunning = false`
   - Sends confirmation: `[POWER_SWITCH] OFF - Machine running: false`
3. **Client**: PowerSwitch component receives confirmation and updates UI

## Server Message Handlers

### `[POWER_SWITCH] ON`
- Sets `machineRunning = true`
- Sends confirmation message
- Executes `runNextTankEnviTestProcess()` asynchronously
- Sends completion/error messages when process finishes

### `[POWER_SWITCH] OFF`
- Sets `machineRunning = false`
- Sends confirmation message

### `[POWER_SWITCH] STATUS`
- Returns current machine running status
- Used for initial state synchronization

## Global Variable Access
The `machineRunning` variable and its accessor functions are exported for external access:
```javascript
export { getMachineRunningStatus, setMachineRunningStatus };
```

## Error Handling
- WebSocket connection validation before sending messages
- Try-catch blocks for message processing
- Proper error logging and client notification
- Graceful handling of connection failures

## State Synchronization
- Server sends initial machine status on client connection
- Client syncs local state with server state
- Real-time updates when power switch is toggled
- Proper cleanup of event listeners

## Testing
The implementation has been tested and verified to work correctly:
- Global variable functions work as expected
- WebSocket message handling is properly implemented
- State synchronization between client and server works
- Error handling is in place 