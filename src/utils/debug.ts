/**
 * Debug utilities for NeoHarbor Security
 * 
 * Provides debugging and diagnostic information for development and troubleshooting.
 */

import { simpleConfig as config, isDevelopment } from '../config/simple-env';

/**
 * Log application configuration and environment info
 * Only logs in development mode to avoid exposing sensitive info in production
 */
export const logEnvironmentInfo = () => {
  if (!isDevelopment()) {
    return;
  }

  console.group('🔧 NeoHarbor Security Environment Info');
  console.log('Environment Mode:', config.environment);
  console.log('Auth Configuration:', {
    defaultMode: config.auth.defaultMode,
    enableDemo: config.auth.enableDemo,
    forceClerk: config.auth.forceClerk,
    hasClerkKey: !!config.auth.clerkPublishableKey,
  });
  console.log('API Configuration:', {
    baseUrl: config.api.baseUrl,
    timeout: config.api.timeout,
  });
  console.log('Features:', config.features);
  console.groupEnd();
};

/**
 * Log authentication events (development only)
 */
export const logAuthEvent = (event: string, data?: any) => {
  if (!isDevelopment()) {
    return;
  }
  
  console.log(`🔐 Auth Event: ${event}`, data || '');
};

/**
 * Log API calls (development only)
 */
export const logApiCall = (method: string, url: string, data?: any) => {
  if (!isDevelopment()) {
    return;
  }
  
  console.log(`🌐 API Call: ${method} ${url}`, data ? { data } : '');
};

/**
 * Log application errors with context
 */
export const logError = (context: string, error: any, additionalInfo?: any) => {
  console.error(`❌ Error in ${context}:`, error);
  if (additionalInfo) {
    console.error('Additional info:', additionalInfo);
  }
  
  // In development, also log stack trace
  if (isDevelopment() && error?.stack) {
    console.error('Stack trace:', error.stack);
  }
};

/**
 * Performance timing utility
 */
export class PerformanceTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = performance.now();
    
    if (isDevelopment()) {
      console.log(`⏱️ Timer started: ${label}`);
    }
  }

  end() {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    
    if (isDevelopment()) {
      console.log(`⏱️ Timer ended: ${this.label} - ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }
}

/**
 * Create a performance timer
 */
export const startTimer = (label: string) => new PerformanceTimer(label);

/**
 * Log component lifecycle events (development only)
 */
export const logComponentEvent = (componentName: string, event: string, data?: any) => {
  if (!isDevelopment()) {
    return;
  }
  
  console.log(`🧩 ${componentName}: ${event}`, data || '');
};

/**
 * Validate environment configuration and log any issues
 */
export const validateEnvironmentSetup = () => {
  if (!isDevelopment()) {
    return;
  }

  console.group('🔍 Environment Validation');
  
  // Check authentication setup
  console.log('Checking authentication setup...');

  
  // Check authentication setup
  if (config.auth.defaultMode === 'clerk' && !config.auth.clerkPublishableKey) {
    console.warn('⚠️ Clerk mode is enabled but no publishable key is configured');
  } else {
    console.log('✅ Authentication configuration is valid');
  }
  
  // Check API configuration
  if (!config.api.baseUrl) {
    console.warn('⚠️ No API base URL configured');
  } else {
    console.log('✅ API configuration is valid');
  }
  
  console.groupEnd();
};

// Export a function to manually trigger debugging (safer than auto-run)
export const initializeDebug = () => {
  if (typeof window !== 'undefined' && isDevelopment) {
    try {
      logEnvironmentInfo();
      validateEnvironmentSetup();
    } catch (error) {
      console.warn('Debug utilities error:', error);
    }
  }
};