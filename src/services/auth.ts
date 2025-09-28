/**
 * Authentication Service
 * 
 * This service provides a unified interface for authentication operations.
 * It currently supports both demo mode and Clerk authentication, with
 * clean interfaces for future production deployment.
 */

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  isDemo?: boolean;
}

export interface AuthState {
  isSignedIn: boolean;
  isLoaded: boolean;
  user: User | null;
}

export interface AuthCallbacks {
  onSignIn?: (user: User) => void;
  onSignOut?: () => void;
  onError?: (error: string) => void;
}

/**
 * Demo Authentication Implementation
 * Used for testing and demonstrations
 */
export class DemoAuthService {
  private static instance: DemoAuthService;
  private authState: AuthState = {
    isSignedIn: false,
    isLoaded: true,
    user: null,
  };
  private callbacks: AuthCallbacks = {};

  static getInstance(): DemoAuthService {
    if (!DemoAuthService.instance) {
      DemoAuthService.instance = new DemoAuthService();
    }
    return DemoAuthService.instance;
  }

  setCallbacks(callbacks: AuthCallbacks) {
    this.callbacks = callbacks;
  }

  async signIn(email: string, password: string): Promise<User> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const demoUser: User = {
      id: 'demo_user_001',
      email: email || 'demo@neoharbor.com',
      firstName: 'Demo',
      lastName: 'User',
      imageUrl: '/demo-avatar.png',
      isDemo: true,
    };

    this.authState = {
      isSignedIn: true,
      isLoaded: true,
      user: demoUser,
    };

    this.callbacks.onSignIn?.(demoUser);
    return demoUser;
  }

  async signOut(): Promise<void> {
    this.authState = {
      isSignedIn: false,
      isLoaded: true,
      user: null,
    };
    
    this.callbacks.onSignOut?.();
  }

  getAuthState(): AuthState {
    return { ...this.authState };
  }

  isAuthenticated(): boolean {
    return this.authState.isSignedIn;
  }

  getCurrentUser(): User | null {
    return this.authState.user;
  }
}

/**
 * Clerk Authentication Service
 * Production-ready authentication using Clerk
 */
export class ClerkAuthService {
  private static instance: ClerkAuthService;
  private callbacks: AuthCallbacks = {};

  static getInstance(): ClerkAuthService {
    if (!ClerkAuthService.instance) {
      ClerkAuthService.instance = new ClerkAuthService();
    }
    return ClerkAuthService.instance;
  }

  setCallbacks(callbacks: AuthCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Initialize Clerk authentication listeners
   * This should be called when the app starts
   */
  initialize() {
    // Note: In a real implementation, you would set up Clerk event listeners here
    // For now, this is a placeholder for future integration
    console.log('Clerk authentication service initialized');
  }

  /**
   * Check if user is currently authenticated
   * In production, this would integrate with useUser from @clerk/clerk-react
   */
  isAuthenticated(): boolean {
    // This would be replaced with actual Clerk authentication check
    return false;
  }

  /**
   * Get current user information
   * In production, this would get user data from Clerk
   */
  getCurrentUser(): User | null {
    // This would be replaced with actual Clerk user data
    return null;
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    try {
      // In production, this would call Clerk's signOut method
      console.log('Clerk sign out initiated');
      this.callbacks.onSignOut?.();
    } catch (error) {
      this.callbacks.onError?.('Failed to sign out');
      throw error;
    }
  }

  /**
   * Get Clerk configuration for production deployment
   */
  getClerkConfig() {
    return {
      publishableKey: envAuthConfig.clerkPublishableKey,
      appearance: {
        baseTheme: undefined,
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#1e293b',
          colorText: '#ffffff',
          colorTextSecondary: '#94a3b8',
          colorInputBackground: '#334155',
          colorInputText: '#ffffff',
        },
      },
      fallbackRedirectUrl: '/data-sources',
      signInFallbackRedirectUrl: '/data-sources',
      signUpFallbackRedirectUrl: '/data-sources',
    };
  }
}

/**
 * Unified Authentication Manager
 * Provides a single interface for all authentication operations
 */
export class AuthManager {
  private static instance: AuthManager;
  private currentMode: 'demo' | 'clerk' = 'demo';
  private demoService: DemoAuthService;
  private clerkService: ClerkAuthService;

  constructor() {
    this.demoService = DemoAuthService.getInstance();
    this.clerkService = ClerkAuthService.getInstance();
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  setMode(mode: 'demo' | 'clerk') {
    this.currentMode = mode;
  }

  getMode(): 'demo' | 'clerk' {
    return this.currentMode;
  }

  setCallbacks(callbacks: AuthCallbacks) {
    this.demoService.setCallbacks(callbacks);
    this.clerkService.setCallbacks(callbacks);
  }

  async signIn(email?: string, password?: string): Promise<User> {
    if (this.currentMode === 'demo') {
      return this.demoService.signIn(email || '', password || '');
    } else {
      // For Clerk mode, the sign-in is handled by Clerk components
      throw new Error('Clerk sign-in should be handled by Clerk components');
    }
  }

  async signOut(): Promise<void> {
    if (this.currentMode === 'demo') {
      await this.demoService.signOut();
    } else {
      await this.clerkService.signOut();
    }
  }

  isAuthenticated(): boolean {
    if (this.currentMode === 'demo') {
      return this.demoService.isAuthenticated();
    } else {
      return this.clerkService.isAuthenticated();
    }
  }

  getCurrentUser(): User | null {
    if (this.currentMode === 'demo') {
      return this.demoService.getCurrentUser();
    } else {
      return this.clerkService.getCurrentUser();
    }
  }

  getClerkConfig() {
    return this.clerkService.getClerkConfig();
  }
}

// Export singleton instance for easy use throughout the app
export const authManager = AuthManager.getInstance();

// Import simple environment configuration
import { authConfig as envAuthConfig } from '../config/simple-env';

// Environment configuration helper
export const getAuthConfig = () => {
  return {
    defaultMode: envAuthConfig.defaultMode as 'demo' | 'clerk',
    clerkPublishableKey: envAuthConfig.clerkPublishableKey,
    enableDemoMode: envAuthConfig.enableDemo,
    forceClerk: envAuthConfig.forceClerk,
  };
};