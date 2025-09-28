import { useState, useEffect } from 'react';
import { ClerkProvider } from '@clerk/clerk-react';
import { LoginPage } from './components/LoginPage';
import { DataSourceSelection } from './components/DataSourceSelection';
import { MainLayout } from './components/MainLayout';
import { Settings } from './components/Settings';
import { Help } from './components/Help';
import { ComplianceOfficer } from './components/ComplianceOfficer';
import { authManager, getAuthConfig, type User } from './services/auth';

// Get authentication configuration
const authConfig = getAuthConfig();

// Suppress Clerk development warnings for demo purposes
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && (
    message.includes('Clerk has been loaded with development keys') ||
    message.includes('is deprecated and should be replaced') ||
    message.includes('has priority over the legacy') ||
    message.includes('afterSignInUrl') ||
    message.includes('afterSignUpUrl') ||
    message.includes('redirectUrl')
  )) {
    return; // Suppress these specific warnings
  }
  originalConsoleWarn.apply(console, args);
};

type AppState = 'login' | 'data-sources' | 'main' | 'settings' | 'help' | 'compliance';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppState>('login');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // Initialize authentication manager
    authManager.setCallbacks({
      onSignIn: (user: User) => {
        setCurrentUser(user);
        setCurrentPage('data-sources');
      },
      onSignOut: () => {
        setCurrentUser(null);
        setCurrentPage('login');
        setSelectedSources([]);
      },
      onError: (error: string) => {
        console.error('Authentication error:', error);
      },
    });

    // Check if user is already authenticated (for page refresh scenarios)
    if (authManager.isAuthenticated()) {
      const user = authManager.getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setCurrentPage('main'); // Go directly to main if sources were already selected
      }
    }
  }, []);

  const handleLogin = (user?: User) => {
    if (user) {
      setCurrentUser(user);
    }
    setCurrentPage('data-sources');
  };

  const handleDataSourcesSelected = (sources: string[]) => {
    setSelectedSources(sources);
    setCurrentPage('main');
  };

  const handleLogout = async () => {
    try {
      await authManager.signOut();
      // The onSignOut callback will handle state updates
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback: force logout locally
      setCurrentUser(null);
      setCurrentPage('login');
      setSelectedSources([]);
    }
  };

  const handleSettings = () => {
    setCurrentPage('settings');
  };

  const handleHelp = () => {
    setCurrentPage('help');
  };

  const handleCompliance = () => {
    setCurrentPage('compliance');
  };

  const handleBackToMain = () => {
    setCurrentPage('main');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage onLogin={handleLogin} />;
      
      case 'data-sources':
        return <DataSourceSelection onContinue={handleDataSourcesSelected} />;
      
      case 'main':
        return (
          <MainLayout 
            selectedSources={selectedSources}
            currentUser={currentUser}
            onLogout={handleLogout}
            onSettings={handleSettings}
            onHelp={handleHelp}
            onCompliance={handleCompliance}
          />
        );
      
      case 'settings':
        return (
          <Settings 
            selectedSources={selectedSources}
            onBack={handleBackToMain}
          />
        );
      
      case 'help':
        return (
          <Help 
            onBack={handleBackToMain}
          />
        );
      
      case 'compliance':
        return (
          <ComplianceOfficer 
            onBack={handleBackToMain}
          />
        );
      
      default:
        return <LoginPage onLogin={handleLogin} />;
    }
  };

  return (
    <ClerkProvider 
      publishableKey={authConfig.clerkPublishableKey}
      appearance={authManager.getClerkConfig().appearance}
      fallbackRedirectUrl={authManager.getClerkConfig().fallbackRedirectUrl}
      signInFallbackRedirectUrl={authManager.getClerkConfig().signInFallbackRedirectUrl}
      signUpFallbackRedirectUrl={authManager.getClerkConfig().signUpFallbackRedirectUrl}
    >
      <div className="dark">
        {renderPage()}
      </div>
    </ClerkProvider>
  );
}