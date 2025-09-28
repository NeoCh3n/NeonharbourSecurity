import { useState } from 'react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { 
  Shield, 
  BarChart3, 
  AlertTriangle, 
  Settings, 
  HelpCircle, 
  LogOut,
  Menu,
  X,
  List,
  Gavel
} from 'lucide-react';
import { Dashboard } from './Dashboard';
import { AlertAnalysis } from './AlertAnalysis';
import { AlertSummary } from './AlertSummary';
import { type User } from '../services/auth';

interface MainLayoutProps {
  selectedSources: string[];
  currentUser: User | null;
  onLogout: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onCompliance: () => void;
}

export function MainLayout({ selectedSources, currentUser, onLogout, onSettings, onHelp, onCompliance }: MainLayoutProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentAlertId, setCurrentAlertId] = useState<string | null>(null);

  const handleAlertClick = (alertId: string) => {
    setCurrentAlertId(alertId);
    setActiveTab('alerts');
  };

  const handleActiveAlertsClick = () => {
    setActiveTab('alert-summary');
  };

  const navigation = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: <BarChart3 className="h-5 w-5" />,
      component: <Dashboard onActiveAlertsClick={handleActiveAlertsClick} />
    },
    {
      id: 'alert-summary',
      name: 'Alert Summary',
      icon: <List className="h-5 w-5" />,
      component: <AlertSummary onAlertClick={handleAlertClick} />
    },
    {
      id: 'alerts',
      name: 'Alert Analysis',
      icon: <AlertTriangle className="h-5 w-5" />,
      component: <AlertAnalysis currentAlertId={currentAlertId} />
    }
  ];

  const getSourceName = (sourceId: string) => {
    const sourceNames: Record<string, string> = {
      'security-lake': 'Security Lake',
      'guardduty': 'GuardDuty',
      'security-hub': 'Security Hub',
      'cloudwatch-eventbridge': 'CloudWatch',
      'third-party-siem': 'Third-Party SIEM'
    };
    return sourceNames[sourceId] || sourceId;
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-slate-800/80 backdrop-blur-sm border-r border-slate-700 flex flex-col transition-all duration-200`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <Shield className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h1 className="font-bold text-white">NeoHarbor</h1>
                  <p className="text-xs text-slate-300">Security Platform</p>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700/50"
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Data Sources */}
        {sidebarOpen && selectedSources.length > 0 && (
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Active Data Sources</h3>
            <div className="space-y-1">
              {selectedSources.map(sourceId => (
                <Badge key={sourceId} variant="outline" className="text-xs border-slate-600 text-slate-300">
                  {getSourceName(sourceId)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            {navigation.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center transition-colors rounded-lg ${
                  sidebarOpen 
                    ? 'space-x-3 px-3 py-2 text-left' 
                    : 'justify-center p-3'
                } ${
                  activeTab === item.id
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
                title={!sidebarOpen ? item.name : undefined}
              >
                <div className={`flex-shrink-0 ${!sidebarOpen ? 'w-5 h-5' : ''}`}>
                  {item.icon}
                </div>
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* Settings and User */}
        <div className="p-4 border-t border-slate-700 space-y-2">
          {sidebarOpen ? (
            <>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700/50" 
                size="sm"
                onClick={onSettings}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700/50" 
                size="sm"
                onClick={onCompliance}
              >
                <Gavel className="h-4 w-4 mr-2" />
                Compliance Officer
              </Button>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700/50" 
                size="sm"
                onClick={onHelp}
              >
                <HelpCircle className="h-4 w-4 mr-2" />
                Help
              </Button>
              <div className="flex items-center space-x-3 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-blue-500/20 text-blue-400">
                    {currentUser?.firstName?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                    {currentUser?.lastName?.charAt(0) || ''}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {currentUser?.firstName && currentUser?.lastName 
                      ? `${currentUser.firstName} ${currentUser.lastName}`
                      : currentUser?.email || 'User'
                    }
                  </p>
                  <p className="text-xs text-slate-400">
                    {currentUser?.isDemo ? 'Demo Mode' : 'Security Analyst'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700/50"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" className="w-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/50">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="w-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/50">
                <HelpCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="w-full p-2 text-slate-300 hover:text-white hover:bg-slate-700/50"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {navigation.find(item => item.id === activeTab)?.name}
              </h2>
              <p className="text-sm text-slate-300">
                {activeTab === 'dashboard' 
                  ? 'Monitor your security posture and threat landscape'
                  : activeTab === 'alert-summary'
                  ? 'Overview of all current alerts with aggregated indicators'
                  : 'Multi-agent pipeline for intelligent threat analysis'
                }
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-700">
                {selectedSources.length} Sources Active
              </Badge>
              <Badge variant="outline" className="bg-blue-900/30 text-blue-400 border-blue-700">
                Pipeline Ready
              </Badge>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {navigation.find(item => item.id === activeTab)?.component}
        </div>
      </div>
    </div>
  );
}