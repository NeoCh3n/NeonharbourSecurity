/**
 * Simple Environment Configuration
 * 
 * A minimal, browser-safe environment configuration without complex dependencies.
 */

// Safe environment variable getter that works in all contexts
const getEnv = (key: string, defaultValue: string = ''): string => {
  try {
    // Try process.env first (build-time replacement)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key] || defaultValue;
    }
    
    // Fallback to default
    return defaultValue;
  } catch {
    return defaultValue;
  }
};

// Simple environment detection
const getEnvironment = (): 'development' | 'staging' | 'production' => {
  const nodeEnv = getEnv('NODE_ENV', 'development');
  const appEnv = getEnv('REACT_APP_ENVIRONMENT', '');
  
  if (nodeEnv === 'production') {
    if (appEnv === 'staging') return 'staging';
    return 'production';
  }
  
  return 'development';
};

// Current environment
export const environment = getEnvironment();

// Simple configuration object
export const simpleConfig = {
  environment,
  isDevelopment: environment === 'development',
  isStaging: environment === 'staging',
  isProduction: environment === 'production',
  
  auth: {
    clerkPublishableKey: getEnv('REACT_APP_CLERK_PUBLISHABLE_KEY', 'pk_test_ZWxlZ2FudC1zdG9yay01Ni5jbGVyay5hY2NvdW50cy5kZXYk'),
    enableDemo: environment === 'development' || getEnv('REACT_APP_ENABLE_DEMO') === 'true',
    defaultMode: (environment === 'production' && getEnv('REACT_APP_FORCE_CLERK') !== 'false') ? 'clerk' : 'demo',
    forceClerk: environment === 'production' && getEnv('REACT_APP_FORCE_CLERK') !== 'false',
  },
  
  api: {
    baseUrl: getEnv('REACT_APP_API_BASE_URL', 
      environment === 'production' ? 'https://api.neoharbor.com' :
      environment === 'staging' ? 'https://staging-api.neoharbor.com' :
      'http://localhost:3000/api'
    ),
    timeout: 30000,
  },
  
  features: {
    complianceOfficer: true,
    alertAnalysis: true,
    realTimeMonitoring: true,
    multiAgentPipeline: true,
    hkmaCompliance: true,
  },
} as const;

// Export individual configs for convenience
export const { auth: authConfig, api: apiConfig, features } = simpleConfig;
export const { isDevelopment, isProduction, isStaging } = simpleConfig;