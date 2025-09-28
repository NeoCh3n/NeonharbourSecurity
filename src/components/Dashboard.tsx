import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  Activity,
  Target,
  Zap,
  FileText,
  Timer,
  Gavel
} from 'lucide-react';

interface DashboardProps {
  onActiveAlertsClick: () => void;
}

export function Dashboard({ onActiveAlertsClick }: DashboardProps) {
  const securityMetrics = [
    {
      title: 'Active Alerts',
      value: '23',
      change: '+12%',
      trend: 'up',
      icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
      description: 'Alerts requiring attention'
    },
    {
      title: 'Resolved Cases',
      value: '145',
      change: '+8%',
      trend: 'up',
      icon: <CheckCircle className="h-5 w-5 text-green-500" />,
      description: 'Cases closed this week'
    },
    {
      title: 'Mean Time to Response',
      value: '12.3m',
      change: '-15%',
      trend: 'down',
      icon: <Clock className="h-5 w-5 text-blue-500" />,
      description: 'Average response time'
    },
    {
      title: 'False Positive Rate',
      value: '3.2%',
      change: '-22%',
      trend: 'down',
      icon: <Target className="h-5 w-5 text-purple-500" />,
      description: 'ML accuracy improvement'
    }
  ];

  const pipelineStages = [
    { name: 'Plan', status: 'active', progress: 100, agent: 'Planner' },
    { name: 'Execute', status: 'active', progress: 85, agent: 'Context Executor' },
    { name: 'Analyze', status: 'active', progress: 72, agent: 'Analyst' },
    { name: 'Respond', status: 'pending', progress: 45, agent: 'Risk Orchestrator' },
    { name: 'Report', status: 'pending', progress: 0, agent: 'Learning Curator' }
  ];

  const recentAlerts = [
    {
      id: 'AL-2025-001',
      severity: 'high',
      source: 'GuardDuty',
      description: 'Suspicious API calls from unusual location',
      timestamp: '2 min ago',
      status: 'investigating'
    },
    {
      id: 'AL-2025-002',
      severity: 'medium',
      source: 'Security Hub',
      description: 'Multiple failed login attempts detected',
      timestamp: '15 min ago',
      status: 'analyzing'
    },
    {
      id: 'AL-2025-003',
      severity: 'low',
      source: 'CloudWatch',
      description: 'Unusual network traffic pattern',
      timestamp: '1 hour ago',
      status: 'resolved'
    }
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-900/30 text-red-400 border-red-700';
      case 'medium': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'low': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'investigating': return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'analyzing': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'resolved': return 'bg-green-900/30 text-green-400 border-green-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Security Dashboard</h1>
        <p className="text-slate-300">Real-time security intelligence and threat analysis</p>
      </div>

      {/* Security Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {securityMetrics.map((metric, index) => (
          <Card 
            key={index}
            className={`bg-slate-800/50 backdrop-blur-sm border-slate-700 ${
              metric.title === 'Active Alerts' 
                ? 'cursor-pointer hover:shadow-lg hover:bg-slate-700/50 transition-all duration-200' 
                : ''
            }`}
            onClick={metric.title === 'Active Alerts' ? onActiveAlertsClick : undefined}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-300">
                {metric.title}
              </CardTitle>
              {metric.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{metric.value}</div>
              <div className="flex items-center space-x-1 text-xs text-slate-400">
                <span className={`inline-flex items-center ${
                  metric.trend === 'up' ? 'text-green-400' : 'text-red-400'
                }`}>
                  <TrendingUp className={`h-3 w-3 mr-1 ${
                    metric.trend === 'down' ? 'rotate-180' : ''
                  }`} />
                  {metric.change}
                </span>
                <span>from last week</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {metric.description}
                {metric.title === 'Active Alerts' && (
                  <span className="block text-blue-400 mt-1">Click to view all alerts →</span>
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Multi-Agent Pipeline Status */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <span>Multi-Agent Pipeline Status</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-slate-300">Live</span>
              </div>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Real-time agent status and analysis pipeline monitoring
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pipelineStages.map((stage, index) => (
              <div key={index} className="space-y-3 p-3 rounded-lg bg-slate-900/30 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Agent Status Indicator */}
                    <div className="relative flex items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        stage.status === 'active' ? 'bg-green-500 animate-pulse' : 
                        stage.status === 'pending' ? 'bg-yellow-500' : 
                        'bg-slate-500'
                      }`} />
                      {stage.status === 'active' && (
                        <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-400 animate-ping opacity-75" />
                      )}
                    </div>
                    
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-sm text-slate-200">{stage.name}</span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs border-slate-600 ${
                            stage.status === 'active' ? 'text-green-400 border-green-500/50' :
                            stage.status === 'pending' ? 'text-yellow-400 border-yellow-500/50' :
                            'text-slate-400 border-slate-600'
                          }`}
                        >
                          {stage.agent}
                        </Badge>
                      </div>
                      
                      {/* Current Action/Status */}
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-slate-400">
                          {stage.status === 'active' ? 'Processing: ' : 
                           stage.status === 'pending' ? 'Queued: ' : 
                           'Completed: '}
                        </span>
                        <span className="text-xs text-slate-300">
                          {stage.status === 'active' ? `Analyzing threat pattern #${Math.floor(Math.random() * 100) + 1}` :
                           stage.status === 'pending' ? 'Waiting for upstream completion' :
                           'Analysis complete'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end space-y-1">
                    <span className="text-sm text-slate-400">{stage.progress}%</span>
                    <div className="flex items-center space-x-1">
                      {stage.status === 'active' && <Timer className="h-3 w-3 text-green-500" />}
                      <span className="text-xs text-slate-500">
                        {stage.status === 'active' ? '2m 15s' :
                         stage.status === 'pending' ? 'ETA 5m' :
                         'Completed'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced Progress Bar with Stage Indicators */}
                <div className="space-y-2">
                  <Progress 
                    value={stage.progress} 
                    className={`h-2 ${
                      stage.status === 'active' ? 'bg-slate-700' : 'bg-slate-800'
                    }`}
                  />
                  
                  {/* Agent Connection Status */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          stage.status !== 'idle' ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <span className="text-slate-400">
                          {stage.status !== 'idle' ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <Zap className="h-3 w-3 text-blue-400" />
                        <span className="text-slate-400">
                          {stage.status === 'active' ? 'High Load' :
                           stage.status === 'pending' ? 'Standby' :
                           'Idle'}
                        </span>
                      </div>
                      
                      {stage.status === 'active' && (
                        <div className="flex items-center space-x-1">
                          <Target className="h-3 w-3 text-orange-400" />
                          <span className="text-slate-400">
                            Processing {Math.floor(Math.random() * 15) + 1} alerts
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <span className="text-slate-500">
                      Last update: {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Pipeline Summary */}
            <div className="mt-4 p-3 rounded-lg bg-blue-900/20 border border-blue-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-blue-200">Pipeline Health: Optimal</span>
                </div>
                <div className="flex items-center space-x-4 text-xs text-slate-400">
                  <span>Agents Online: {pipelineStages.filter(s => s.status !== 'idle').length}/6</span>
                  <span>Avg Response: 1.2s</span>
                  <span>Throughput: 847 alerts/hr</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white">
              <Shield className="h-5 w-5 text-orange-500" />
              <span>Recent Alerts</span>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Latest security alerts from connected data sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentAlerts.map((alert, index) => (
              <div key={index} className="border border-slate-600 bg-slate-700/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge className={getSeverityColor(alert.severity)}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="font-medium text-sm text-slate-200">{alert.id}</span>
                  </div>
                  <Badge variant="outline" className={getStatusColor(alert.status)}>
                    {alert.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-300">{alert.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Source: {alert.source}</span>
                  <span>{alert.timestamp}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Autonomous Compliance Officer Status */}
      <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-white">
            <Gavel className="h-5 w-5 text-blue-400" />
            <span>Autonomous Compliance Officer</span>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 ml-2">
              Active 24/7
            </Badge>
          </CardTitle>
          <CardDescription className="text-slate-300">
            Real-time HKMA Critical Infrastructure Ordinance compliance monitoring
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Core Compliance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
              <div className="text-2xl font-bold text-green-400">98.5%</div>
              <div className="text-sm text-green-300">Reporting Compliance</div>
              <div className="text-xs text-slate-400 mt-1">12/48 hour deadlines</div>
            </div>
            <div className="text-center p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">2.3min</div>
              <div className="text-sm text-blue-300">OGCIO Response Time</div>
              <div className="text-xs text-slate-400 mt-1">Auto-notification</div>
            </div>
            <div className="text-center p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">100%</div>
              <div className="text-sm text-purple-300">Audit Trail Coverage</div>
              <div className="text-xs text-slate-400 mt-1">AI + Human actions</div>
            </div>
          </div>

          {/* Active Compliance Features */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-medium text-slate-300 flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-400" />
                <span>Instant Reporting</span>
              </h4>
              <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Critical Incidents</span>
                  <span className="text-sm text-orange-400">12h deadline</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">High Severity</span>
                  <span className="text-sm text-blue-400">48h deadline</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Reports This Month</span>
                  <span className="text-sm text-green-400">12 generated</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-slate-300 flex items-center space-x-2">
                <Timer className="h-4 w-4 text-purple-400" />
                <span>Drill Compliance</span>
              </h4>
              <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Bi-annual Drills</span>
                  <span className="text-sm text-green-400">On Schedule</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Next Drill</span>
                  <span className="text-sm text-blue-400">15 Feb 2025</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Completion Rate</span>
                  <span className="text-sm text-green-400">100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Compliance Activities */}
          <div className="space-y-3">
            <h4 className="font-medium text-slate-300">Recent Compliance Activities</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm text-slate-300">Auto-generated OGCIO report for incident INC-2025-001</span>
                <span className="text-xs text-slate-500 ml-auto">2 hours ago</span>
              </div>
              <div className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-sm text-slate-300">Continuous audit trail updated with 847 new entries</span>
                <span className="text-xs text-slate-500 ml-auto">15 minutes ago</span>
              </div>
              <div className="flex items-center space-x-3 p-2 bg-slate-700/30 rounded">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="text-sm text-slate-300">Scheduled drill reminder sent for Cyber Incident Response</span>
                <span className="text-xs text-slate-500 ml-auto">1 day ago</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}