import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  ArrowLeft,
  Settings as SettingsIcon,
  Shield,
  Bell,
  Database,
  Globe,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { loadRuntimeSettings, runtimeService, useRuntimeStore } from '../services/runtime';
import { features, isDevelopment } from '../config/environment';

interface SettingsProps {
  onBack: () => void;
  selectedSources: string[];
}

export function Settings({ onBack, selectedSources }: SettingsProps) {
  const [notifications, setNotifications] = useState({
    email: true,
    slack: false,
    sms: false,
    realTime: true
  });

  const [security, setSecurity] = useState({
    twoFactor: true,
    autoLogout: true,
    sessionTimeout: 30,
    apiAccess: false
  });

  const [analysis, setAnalysis] = useState({
    autoAnalysis: true,
    confidenceThreshold: 75,
    riskThreshold: 'medium',
    humanApproval: true
  });

  const [runtimeSettings, setRuntimeSettings] = useState(() => loadRuntimeSettings());
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const runtimeConnection = useRuntimeStore((state) => state.connection);
  const activeRun = useRuntimeStore((state) => (
    state.activeRunId ? state.runs[state.activeRunId] : undefined
  ));

  const allowDirectRuntime = isDevelopment();
  const runtimeModeLabel = runtimeSettings.mode === 'gateway' ? 'SaaS Gateway' : 'Direct Runtime';
  const sequenceGapCount = activeRun?.sequenceGaps.length ?? 0;
  const sequenceReplayCount = activeRun?.sequenceReplays.length ?? 0;

  const runtimeStatusBadge = runtimeConnection.status === 'connected'
    ? 'bg-green-900/30 text-green-400 border-green-700'
    : runtimeConnection.status === 'connecting'
      ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700'
      : 'bg-red-900/30 text-red-400 border-red-700';

  const handleRuntimeSave = () => {
    runtimeService.setConnectionSettings(runtimeSettings);
    setRuntimeError(null);
  };

  const handleRuntimeConnect = async () => {
    try {
      setRuntimeError(null);
      await runtimeService.connect(runtimeSettings);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Failed to connect to runtime.');
    }
  };

  const handleRuntimeDisconnect = () => {
    runtimeService.disconnect();
    setRuntimeError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-slate-300 hover:text-white hover:bg-slate-700/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center space-x-2">
            <SettingsIcon className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Settings</h1>
          </div>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 bg-slate-800/50 border-slate-700">
            <TabsTrigger value="general" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              General
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="analysis" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Analysis
            </TabsTrigger>
            <TabsTrigger value="datasources" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Data Sources
            </TabsTrigger>
            <TabsTrigger value="compliance" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Compliance
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <span>General Settings</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Configure your platform preferences and display options
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="organization" className="text-slate-300">Organization Name</Label>
                    <Input 
                      id="organization"
                      defaultValue="NeoHarbor Security"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-slate-300">Timezone</Label>
                    <Input 
                      id="timezone"
                      defaultValue="Asia/Hong_Kong"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language" className="text-slate-300">Language</Label>
                    <Input 
                      id="language"
                      defaultValue="English"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency" className="text-slate-300">Currency</Label>
                    <Input 
                      id="currency"
                      defaultValue="HKD"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-green-400" />
                  <span>Security Settings</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Manage authentication and access control settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Two-Factor Authentication</Label>
                    <p className="text-sm text-slate-400">Add an extra layer of security to your account</p>
                  </div>
                  <Switch
                    checked={security.twoFactor}
                    onCheckedChange={(checked) => setSecurity(prev => ({ ...prev, twoFactor: checked }))}
                  />
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Auto Logout</Label>
                    <p className="text-sm text-slate-400">Automatically log out after period of inactivity</p>
                  </div>
                  <Switch
                    checked={security.autoLogout}
                    onCheckedChange={(checked) => setSecurity(prev => ({ ...prev, autoLogout: checked }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout" className="text-slate-300">Session Timeout (minutes)</Label>
                  <Input 
                    id="timeout"
                    type="number"
                    value={security.sessionTimeout}
                    onChange={(e) => setSecurity(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                    className="bg-slate-700/50 border-slate-600 text-white max-w-32"
                  />
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">API Access</Label>
                    <p className="text-sm text-slate-400">Enable API access for external integrations</p>
                  </div>
                  <Switch
                    checked={security.apiAccess}
                    onCheckedChange={(checked) => setSecurity(prev => ({ ...prev, apiAccess: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Settings */}
          <TabsContent value="notifications" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Bell className="h-5 w-5 text-yellow-400" />
                  <span>Notification Settings</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Configure how and when you receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Email Notifications</Label>
                    <p className="text-sm text-slate-400">Receive alerts and updates via email</p>
                  </div>
                  <Switch
                    checked={notifications.email}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, email: checked }))}
                  />
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Slack Integration</Label>
                    <p className="text-sm text-slate-400">Send notifications to Slack channels</p>
                  </div>
                  <Switch
                    checked={notifications.slack}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, slack: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">SMS Alerts</Label>
                    <p className="text-sm text-slate-400">Receive critical alerts via SMS</p>
                  </div>
                  <Switch
                    checked={notifications.sms}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, sms: checked }))}
                  />
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Real-time Notifications</Label>
                    <p className="text-sm text-slate-400">Show live notifications in the platform</p>
                  </div>
                  <Switch
                    checked={notifications.realTime}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, realTime: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Settings */}
          <TabsContent value="analysis" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-purple-400" />
                  <span>Analysis Settings</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Configure automated analysis and agent behavior
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Automatic Analysis</Label>
                    <p className="text-sm text-slate-400">Automatically analyze new alerts</p>
                  </div>
                  <Switch
                    checked={analysis.autoAnalysis}
                    onCheckedChange={(checked) => setAnalysis(prev => ({ ...prev, autoAnalysis: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Multi-Agent Pipeline</Label>
                    <p className="text-sm text-slate-400">Feature flag for runtime agent orchestration</p>
                  </div>
                  <Badge variant="outline" className={features.multiAgentPipeline ? 'border-green-600 text-green-400' : 'border-slate-600 text-slate-400'}>
                    {features.multiAgentPipeline ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confidence" className="text-slate-300">Confidence Threshold (%)</Label>
                  <Input 
                    id="confidence"
                    type="number"
                    value={analysis.confidenceThreshold}
                    onChange={(e) => setAnalysis(prev => ({ ...prev, confidenceThreshold: parseInt(e.target.value) }))}
                    className="bg-slate-700/50 border-slate-600 text-white max-w-32"
                  />
                </div>
                <Separator className="bg-slate-700" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Human Approval Required</Label>
                    <p className="text-sm text-slate-400">Require human approval for high-risk actions</p>
                  </div>
                  <Switch
                    checked={analysis.humanApproval}
                    onCheckedChange={(checked) => setAnalysis(prev => ({ ...prev, humanApproval: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  <span>Runtime Connection</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Configure the customer runtime endpoint for event streaming and approvals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Connection Status</Label>
                    <p className="text-sm text-slate-400">Live status of the JSON-RPC runtime stream</p>
                  </div>
                  <Badge variant="outline" className={runtimeStatusBadge}>
                    {runtimeConnection.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Runtime Mode</Label>
                    <p className="text-sm text-slate-400">Gateway (default) or direct runtime for dev</p>
                  </div>
                  <Badge variant="outline" className="border-slate-600 text-slate-300">
                    {runtimeModeLabel}
                  </Badge>
                </div>

                {(sequenceGapCount > 0 || sequenceReplayCount > 0) && (
                  <div className="rounded border border-orange-700/40 bg-orange-900/20 p-3 text-sm text-orange-200">
                    Sequence issues detected: {sequenceGapCount} gap{sequenceGapCount === 1 ? '' : 's'} ·
                    {sequenceReplayCount} replay{sequenceReplayCount === 1 ? '' : 's'}
                  </div>
                )}

                {runtimeConnection.lastError && (
                  <div className="text-sm text-red-400">
                    Last error: {runtimeConnection.lastError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="runtime-endpoint" className="text-slate-300">Runtime Endpoint</Label>
                    <Input
                      id="runtime-endpoint"
                      value={runtimeSettings.endpoint}
                      onChange={(event) => setRuntimeSettings((prev) => ({
                        ...prev,
                        endpoint: event.target.value,
                      }))}
                      placeholder="wss://runtime.neoharbor.local/ws"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtime-token" className="text-slate-300">Auth Token</Label>
                    <Input
                      id="runtime-token"
                      type="password"
                      value={runtimeSettings.authToken}
                      onChange={(event) => setRuntimeSettings((prev) => ({
                        ...prev,
                        authToken: event.target.value,
                      }))}
                      placeholder="runtime access token"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtime-mode" className="text-slate-300">Connection Mode</Label>
                    <Select
                      value={runtimeSettings.mode}
                      onValueChange={(value) => setRuntimeSettings((prev) => ({
                        ...prev,
                        mode: value === 'direct' ? 'direct' : 'gateway',
                      }))}
                    >
                      <SelectTrigger id="runtime-mode" className="bg-slate-700/50 border-slate-600 text-white">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gateway">SaaS Gateway (recommended)</SelectItem>
                        <SelectItem value="direct" disabled={!allowDirectRuntime}>Direct Runtime (dev only)</SelectItem>
                      </SelectContent>
                    </Select>
                    {!allowDirectRuntime && (
                      <p className="text-xs text-slate-500">Direct runtime mode is available in development only.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtime-org" className="text-slate-300">Org ID</Label>
                    <Input
                      id="runtime-org"
                      value={runtimeSettings.orgId}
                      onChange={(event) => setRuntimeSettings((prev) => ({
                        ...prev,
                        orgId: event.target.value,
                      }))}
                      placeholder="org_123"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtime-env" className="text-slate-300">Environment</Label>
                    <Input
                      id="runtime-env"
                      value={runtimeSettings.environment}
                      onChange={(event) => setRuntimeSettings((prev) => ({
                        ...prev,
                        environment: event.target.value,
                      }))}
                      placeholder="production"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="runtime-id" className="text-slate-300">Runtime ID</Label>
                    <Input
                      id="runtime-id"
                      value={runtimeSettings.runtimeId}
                      onChange={(event) => setRuntimeSettings((prev) => ({
                        ...prev,
                        runtimeId: event.target.value,
                      }))}
                      placeholder="runtime-east-1"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-slate-300">Auto-connect</Label>
                    <p className="text-sm text-slate-400">Reconnect on refresh or reconnect attempts</p>
                  </div>
                  <Switch
                    checked={runtimeSettings.autoConnect}
                    onCheckedChange={(checked) => setRuntimeSettings((prev) => ({
                      ...prev,
                      autoConnect: checked,
                    }))}
                  />
                </div>

                {runtimeError && (
                  <div className="text-sm text-red-400">
                    {runtimeError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRuntimeSave}
                    className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50"
                  >
                    Save Settings
                  </Button>
                  {runtimeConnection.status === 'connected' ? (
                    <Button
                      onClick={handleRuntimeDisconnect}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={handleRuntimeConnect}
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Sources Settings */}
          <TabsContent value="datasources" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Database className="h-5 w-5 text-cyan-400" />
                  <span>Connected Data Sources</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Manage your connected security data sources
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSources.map((source, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-white font-medium">{source}</p>
                        <p className="text-sm text-slate-400">Connected and active</p>
                      </div>
                    </div>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      Active
                    </Badge>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50"
                >
                  Add New Data Source
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compliance Settings */}
          <TabsContent value="compliance" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                  <span>HKMA Compliance Settings</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Configure Hong Kong financial regulations compliance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium text-white">Data Retention</span>
                    </div>
                    <p className="text-xs text-slate-400">7 years retention policy active</p>
                  </div>
                  <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium text-white">Audit Logging</span>
                    </div>
                    <p className="text-xs text-slate-400">All actions logged and monitored</p>
                  </div>
                  <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <Clock className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm font-medium text-white">Incident Reporting</span>
                    </div>
                    <p className="text-xs text-slate-400">Auto-generated compliance reports</p>
                  </div>
                  <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium text-white">Privacy Controls</span>
                    </div>
                    <p className="text-xs text-slate-400">GDPR and local privacy laws</p>
                  </div>
                </div>
                <Separator className="bg-slate-700" />
                <Button className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                  Download Compliance Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
