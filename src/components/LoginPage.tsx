import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Shield, Lock, User, Play } from 'lucide-react';
import { SignIn } from '@clerk/clerk-react';
import { authManager, getAuthConfig, type User } from '../services/auth';

interface LoginPageProps {
  onLogin: (user?: User) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const authConfig = getAuthConfig();
  const [authMode, setAuthMode] = useState<'demo' | 'clerk'>(authConfig.defaultMode);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('demo@neoharbor.com');
  const [password, setPassword] = useState('demo123');

  const handleDemoLogin = async () => {
    setIsLoading(true);
    
    try {
      authManager.setMode('demo');
      const user = await authManager.signIn(email, password);
      onLogin(user);
    } catch (error) {
      console.error('Demo login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (mode: 'demo' | 'clerk') => {
    setAuthMode(mode);
    authManager.setMode(mode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-2xl flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">NeoHarbor Security</h1>
          <p className="text-slate-300 mt-2">Multi-Agent Security Intelligence Platform</p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center text-white">Welcome Back</CardTitle>
            <CardDescription className="text-center text-slate-300">
              Sign in to access your security dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Auth Mode Toggle */}
            {authConfig.enableDemoMode && (
              <div className="flex gap-2 p-1 bg-slate-700/30 rounded-lg mb-6">
                <Button
                  type="button"
                  variant={authMode === 'demo' ? 'default' : 'ghost'}
                  size="sm"
                  className={`flex-1 ${authMode === 'demo' 
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-600/50'
                  }`}
                  onClick={() => handleModeChange('demo')}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Demo Mode
                </Button>
                <Button
                  type="button"
                  variant={authMode === 'clerk' ? 'default' : 'ghost'}
                  size="sm"
                  className={`flex-1 ${authMode === 'clerk' 
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' 
                    : 'text-slate-300 hover:text-white hover:bg-slate-600/50'
                  }`}
                  onClick={() => handleModeChange('clerk')}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Clerk Auth
                </Button>
              </div>
            )}

            {authMode === 'demo' ? (
              <div className="space-y-4">
                {/* Demo Login Form */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="demo-email" className="text-slate-200">Email</Label>
                    <Input
                      id="demo-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      placeholder="Enter demo email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-password" className="text-slate-200">Password</Label>
                    <Input
                      id="demo-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                      placeholder="Enter demo password"
                    />
                  </div>
                </div>

                <div className="text-center p-4 bg-slate-700/20 rounded-lg border border-slate-600/50">
                  <Play className="h-8 w-8 text-blue-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-300 mb-3">
                    Demo Mode - Experience NeoHarbor Security with sample data
                  </p>
                  <Button 
                    onClick={handleDemoLogin}
                    className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading Demo...' : 'Enter Demo'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="clerk-signin-container">
                  <SignIn
                    appearance={{
                      elements: {
                        formButtonPrimary: 
                          'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium',
                        card: 'bg-transparent shadow-none',
                        headerTitle: 'text-white',
                        headerSubtitle: 'text-slate-300',
                        socialButtonsBlockButton: 
                          'bg-slate-700/50 border-slate-600 text-white hover:bg-slate-600/50',
                        socialButtonsBlockButtonText: 'text-white',
                        dividerLine: 'bg-slate-600',
                        dividerText: 'text-slate-400',
                        formFieldLabel: 'text-slate-200',
                        formFieldInput: 
                          'bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400',
                        footerActionLink: 'text-blue-400 hover:text-blue-300',
                        footerActionText: 'text-slate-400',
                        identityPreviewText: 'text-slate-300',
                        identityPreviewEditButton: 'text-blue-400',
                      },
                      layout: {
                        socialButtonsVariant: 'blockButton',
                      },
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-400">
                {authMode === 'demo' ? 'Demo Mode - No registration required' : 'Powered by'}{' '}
                <span className="text-blue-400 font-medium">
                  {authMode === 'demo' ? 'NeoHarbor Security' : 'Clerk Authentication'}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Info Note */}
        <div className="text-center text-xs text-slate-400 bg-slate-800/30 rounded-lg p-3">
          {authMode === 'demo' ? (
            <p>Demo Mode: Use demo@neoharbor.com / demo123 or any credentials</p>
          ) : (
            <p>Production Mode: Use your registered Clerk credentials</p>
          )}
        </div>
      </div>
    </div>
  );
}