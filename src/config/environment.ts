/**
 * Environment Configuration
 * 
 * This file contains all environment-specific configuration for NeoHarbor Security.
 * It provides a clean interface for managing different deployment environments.
 */

import { getBrowserEnv, getEnvironmentMode } from '../utils/browser-env';

export interface EnvironmentConfig {
  // Application Info
  appName: string;
  appVersion: string;
  environment: 'development' | 'staging' | 'production';

  // Authentication
  auth: {
    enableDemo: boolean;
    defaultMode: 'demo' | 'clerk';
    clerkPublishableKey: string;
    forceClerk: boolean;
  };

  // API Configuration
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };

  // AWS Integration
  aws: {
    region: string;
    bedrock: {
      enabled: boolean;
      region: string;
      models: {
        planner: string;
        executor: string;
        analyst: string;
        orchestrator: string;
        curator: string;
        reporter: string;
      };
    };
    securityLake: {
      enabled: boolean;
      region: string;
    };
    guardDuty: {
      enabled: boolean;
      region: string;
    };
    securityHub: {
      enabled: boolean;
      region: string;
    };
  };

  // Features
  features: {
    complianceOfficer: boolean;
    alertAnalysis: boolean;
    realTimeMonitoring: boolean;
    multiAgentPipeline: boolean;
    hkmaCompliance: boolean;
  };

  // UI Configuration
  ui: {
    theme: 'dark' | 'light' | 'auto';
    primaryColor: string;
    enableAnimations: boolean;
  };
}

// Environment-specific configurations
const configurations: Record<string, EnvironmentConfig> = {
  development: {
    appName: 'NeoHarbor Security',
    appVersion: '1.0.0-dev',
    environment: 'development',
    
    auth: {
      enableDemo: true,
      defaultMode: 'demo',
      clerkPublishableKey: 'pk_test_ZWxlZ2FudC1zdG9yay01Ni5jbGVyay5hY2NvdW50cy5kZXYk',
      forceClerk: false,
    },

    api: {
      baseUrl: 'http://localhost:3000/api',
      timeout: 30000,
      retryAttempts: 3,
    },

    aws: {
      region: 'us-east-1',
      bedrock: {
        enabled: false, // Disabled in development
        region: 'us-east-1',
        models: {
          planner: 'anthropic.claude-3-sonnet-20240229-v1:0',
          executor: 'anthropic.claude-3-haiku-20240307-v1:0',
          analyst: 'anthropic.claude-3-sonnet-20240229-v1:0',
          orchestrator: 'anthropic.claude-3-sonnet-20240229-v1:0',
          curator: 'anthropic.claude-3-haiku-20240307-v1:0',
          reporter: 'anthropic.claude-3-sonnet-20240229-v1:0',
        },
      },
      securityLake: {
        enabled: false,
        region: 'us-east-1',
      },
      guardDuty: {
        enabled: false,
        region: 'us-east-1',
      },
      securityHub: {
        enabled: false,
        region: 'us-east-1',
      },
    },

    features: {
      complianceOfficer: true,
      alertAnalysis: true,
      realTimeMonitoring: true,
      multiAgentPipeline: true,
      hkmaCompliance: true,
    },

    ui: {
      theme: 'dark',
      primaryColor: '#3b82f6',
      enableAnimations: true,
    },
  },

  staging: {
    appName: 'NeoHarbor Security',
    appVersion: '1.0.0-staging',
    environment: 'staging',
    
    auth: {
      enableDemo: true,
      defaultMode: 'clerk',
      clerkPublishableKey: getBrowserEnv('REACT_APP_CLERK_PUBLISHABLE_KEY', 'pk_test_ZWxlZ2FudC1zdG9yay01Ni5jbGVyay5hY2NvdW50cy5kZXYk'),
      forceClerk: false,
    },

    api: {
      baseUrl: getBrowserEnv('REACT_APP_API_BASE_URL', 'https://staging-api.neoharbor.com'),
      timeout: 30000,
      retryAttempts: 3,
    },

    aws: {
      region: 'us-east-1',
      bedrock: {
        enabled: true,
        region: 'us-east-1',
        models: {
          planner: 'anthropic.claude-3-sonnet-20240229-v1:0',
          executor: 'anthropic.claude-3-haiku-20240307-v1:0',
          analyst: 'anthropic.claude-3-sonnet-20240229-v1:0',
          orchestrator: 'anthropic.claude-3-sonnet-20240229-v1:0',
          curator: 'anthropic.claude-3-haiku-20240307-v1:0',
          reporter: 'anthropic.claude-3-sonnet-20240229-v1:0',
        },
      },
      securityLake: {
        enabled: true,
        region: 'us-east-1',
      },
      guardDuty: {
        enabled: true,
        region: 'us-east-1',
      },
      securityHub: {
        enabled: true,
        region: 'us-east-1',
      },
    },

    features: {
      complianceOfficer: true,
      alertAnalysis: true,
      realTimeMonitoring: true,
      multiAgentPipeline: true,
      hkmaCompliance: true,
    },

    ui: {
      theme: 'dark',
      primaryColor: '#3b82f6',
      enableAnimations: true,
    },
  },

  production: {
    appName: 'NeoHarbor Security',
    appVersion: '1.0.0',
    environment: 'production',
    
    auth: {
      enableDemo: getBrowserEnv('REACT_APP_ENABLE_DEMO') === 'true',
      defaultMode: 'clerk',
      clerkPublishableKey: getBrowserEnv('REACT_APP_CLERK_PUBLISHABLE_KEY', 'pk_test_ZWxlZ2FudC1zdG9yay01Ni5jbGVyay5hY2NvdW50cy5kZXYk'),
      forceClerk: true,
    },

    api: {
      baseUrl: getBrowserEnv('REACT_APP_API_BASE_URL', 'https://api.neoharbor.com'),
      timeout: 30000,
      retryAttempts: 3,
    },

    aws: {
      region: getBrowserEnv('REACT_APP_AWS_REGION', 'us-east-1'),
      bedrock: {
        enabled: true,
        region: getBrowserEnv('REACT_APP_AWS_BEDROCK_REGION', 'us-east-1'),
        models: {
          planner: getBrowserEnv('REACT_APP_BEDROCK_PLANNER_MODEL', 'anthropic.claude-3-sonnet-20240229-v1:0'),
          executor: getBrowserEnv('REACT_APP_BEDROCK_EXECUTOR_MODEL', 'anthropic.claude-3-haiku-20240307-v1:0'),
          analyst: getBrowserEnv('REACT_APP_BEDROCK_ANALYST_MODEL', 'anthropic.claude-3-sonnet-20240229-v1:0'),
          orchestrator: getBrowserEnv('REACT_APP_BEDROCK_ORCHESTRATOR_MODEL', 'anthropic.claude-3-sonnet-20240229-v1:0'),
          curator: getBrowserEnv('REACT_APP_BEDROCK_CURATOR_MODEL', 'anthropic.claude-3-haiku-20240307-v1:0'),
          reporter: getBrowserEnv('REACT_APP_BEDROCK_REPORTER_MODEL', 'anthropic.claude-3-sonnet-20240229-v1:0'),
        },
      },
      securityLake: {
        enabled: true,
        region: getBrowserEnv('REACT_APP_AWS_SECURITY_LAKE_REGION', 'us-east-1'),
      },
      guardDuty: {
        enabled: true,
        region: getBrowserEnv('REACT_APP_AWS_GUARDDUTY_REGION', 'us-east-1'),
      },
      securityHub: {
        enabled: true,
        region: getBrowserEnv('REACT_APP_AWS_SECURITY_HUB_REGION', 'us-east-1'),
      },
    },

    features: {
      complianceOfficer: true,
      alertAnalysis: true,
      realTimeMonitoring: true,
      multiAgentPipeline: true,
      hkmaCompliance: true,
    },

    ui: {
      theme: 'dark',
      primaryColor: '#3b82f6',
      enableAnimations: true,
    },
  },
};

// Get current environment using browser-compatible method
const getCurrentEnvironment = getEnvironmentMode;

// Helper function to safely get configuration
const getConfig = (): EnvironmentConfig => {
  try {
    const env = getCurrentEnvironment();
    const config = configurations[env];
    if (!config) {
      console.warn(`No configuration found for environment: ${env}, falling back to development`);
      return configurations.development;
    }
    return config;
  } catch (error) {
    console.warn('Environment configuration error, falling back to development:', error);
    return configurations.development;
  }
};

// Export the current configuration
export const config: EnvironmentConfig = getConfig();

// Helper functions
export const isProduction = () => config.environment === 'production';
export const isDevelopment = () => config.environment === 'development';
export const isStaging = () => config.environment === 'staging';

// Feature flags
export const features = config.features;

// API configuration
export const apiConfig = config.api;

// AWS configuration
export const awsConfig = config.aws;

// Authentication configuration
export const authConfig = config.auth;

// UI configuration
export const uiConfig = config.ui;

// Validation function for required environment variables in production
export const validateEnvironment = (): string[] => {
  const errors: string[] = [];
  
  if (isProduction()) {
    if (!config.auth.clerkPublishableKey || config.auth.clerkPublishableKey === 'pk_test_ZWxlZ2FudC1zdG9yay01Ni5jbGVyay5hY2NvdW50cy5kZXYk') {
      errors.push('REACT_APP_CLERK_PUBLISHABLE_KEY is required in production');
    }
    
    if (!config.api.baseUrl || config.api.baseUrl === 'https://api.neoharbor.com') {
      errors.push('REACT_APP_API_BASE_URL should be configured for production');
    }
  }
  
  return errors;
};

// Log configuration on startup (development only)
if (isDevelopment() && typeof console !== 'undefined') {
  console.log('🔧 NeoHarbor Security Configuration:', {
    environment: config.environment,
    authMode: config.auth.defaultMode,
    demoEnabled: config.auth.enableDemo,
    bedrockEnabled: config.aws.bedrock.enabled,
  });
}