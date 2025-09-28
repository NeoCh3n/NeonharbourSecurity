/**
 * Browser-compatible environment utilities
 * 
 * This module provides safe access to environment variables in browser contexts
 * where process.env might not be available.
 */

// Cache for environment variables to avoid repeated lookups
const envCache = new Map<string, string>();

/**
 * Safely get an environment variable value
 * Works in both browser and Node.js environments
 */
export const getBrowserEnv = (key: string, defaultValue: string = ''): string => {
  // Return cached value if available
  if (envCache.has(key)) {
    return envCache.get(key) || defaultValue;
  }

  let value = defaultValue;
  
  try {
    // Try to access process.env if available (Node.js or webpack environments)
    if (typeof process !== 'undefined' && process.env && key in process.env) {
      value = process.env[key] || defaultValue;
    }
    // Try to access window environment variables (if injected by build process)
    else if (typeof window !== 'undefined' && (window as any).ENV && key in (window as any).ENV) {
      value = (window as any).ENV[key] || defaultValue;
    }
    // Fallback for known React environment variables
    else if (typeof window !== 'undefined' && key.startsWith('REACT_APP_')) {
      // In some build setups, environment variables might be available globally
      const globalKey = `__${key}__`;
      if ((window as any)[globalKey]) {
        value = (window as any)[globalKey];
      }
    }
  } catch (error) {
    console.warn(`Failed to access environment variable ${key}:`, error);
  }

  // Cache the result
  envCache.set(key, value);
  return value;
};

/**
 * Check if we're in a browser environment
 */
export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * Check if we're in a Node.js environment
 */
export const isNode = (): boolean => {
  return typeof process !== 'undefined' && process.versions && process.versions.node;
};

/**
 * Get the current environment mode
 */
export const getEnvironmentMode = (): 'development' | 'staging' | 'production' => {
  try {
    const nodeEnv = getBrowserEnv('NODE_ENV', 'development');
    const reactAppEnv = getBrowserEnv('REACT_APP_ENVIRONMENT', '');
    
    if (nodeEnv === 'production') {
      if (reactAppEnv === 'staging') {
        return 'staging';
      }
      // Check hostname for staging environment
      if (isBrowser() && window.location.hostname.includes('staging')) {
        return 'staging';
      }
      return 'production';
    }
    
    return 'development';
  } catch (error) {
    console.warn('Error determining environment mode:', error);
    return 'development';
  }
};

/**
 * Clear the environment cache (useful for testing)
 */
export const clearEnvCache = (): void => {
  envCache.clear();
};

/**
 * Pre-defined environment variable getters for common React app variables
 */
export const getReactAppEnv = (key: string, defaultValue: string = ''): string => {
  return getBrowserEnv(`REACT_APP_${key}`, defaultValue);
};

/**
 * Get all current environment information for debugging
 */
export const getEnvironmentInfo = () => {
  return {
    isBrowser: isBrowser(),
    isNode: isNode(),
    mode: getEnvironmentMode(),
    nodeEnv: getBrowserEnv('NODE_ENV'),
    reactAppEnv: getBrowserEnv('REACT_APP_ENVIRONMENT'),
    hasProcess: typeof process !== 'undefined',
    hasWindow: typeof window !== 'undefined',
  };
};