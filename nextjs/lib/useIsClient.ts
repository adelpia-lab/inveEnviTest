import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the component is running on the client side
 * This helps prevent hydration mismatches by ensuring consistent rendering
 * between server and client during the initial render
 */
export function useIsClient() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
} 