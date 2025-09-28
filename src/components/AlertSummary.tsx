import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { 
  Search, 
  Filter, 
  AlertTriangle, 
  Shield, 
  Activity, 
  Database,
  ExternalLink,
  Clock,
  MapPin,
  Hash,
  Globe
} from 'lucide-react';

interface IOC {
  type: 'ip' | 'domain' | 'hash' | 'url';
  value: string;
  confidence: number;
}

interface Alert {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  timestamp: string;
  status: 'new' | 'investigating' | 'analyzing' | 'responded' | 'resolved';
  description: string;
  iocs: IOC[];
  affectedAssets: string[];
  location: string;
  tags: string[];
}

interface AlertSummaryProps {
  onAlertClick: (alertId: string) => void;
}

export function AlertSummary({ onAlertClick }: AlertSummaryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const alerts: Alert[] = [
    {
      id: 'AL-2025-HK-001',
      title: 'Suspicious API calls from unusual geographic location',
      severity: 'critical',
      source: 'Amazon GuardDuty',
      timestamp: '2025-01-15T10:30:00Z',
      status: 'investigating',
      description: 'Multiple high-privilege API calls detected from IP addresses in regions not typically accessed by this account.',
      iocs: [
        { type: 'ip', value: '198.51.100.42', confidence: 95 },
        { type: 'ip', value: '203.0.113.15', confidence: 87 },
        { type: 'domain', value: 'suspicious-domain.example', confidence: 78 }
      ],
      affectedAssets: ['EC2 Instance i-1234567890abcdef0', 'S3 Bucket prod-data-bucket'],
      location: 'Eastern Europe',
      tags: ['api-abuse', 'geo-anomaly', 'privilege-escalation']
    },
    {
      id: 'AL-2025-HK-002',
      title: 'Multiple failed authentication attempts detected',
      severity: 'high',
      source: 'AWS Security Hub',
      timestamp: '2025-01-15T09:45:00Z',
      status: 'analyzing',
      description: 'Brute force attack attempt detected against multiple user accounts from distributed IP addresses.',
      iocs: [
        { type: 'ip', value: '192.0.2.100', confidence: 92 },
        { type: 'ip', value: '198.51.100.200', confidence: 88 },
        { type: 'hash', value: 'a1b2c3d4e5f6...', confidence: 85 }
      ],
      affectedAssets: ['IAM Users', 'Login Portal'],
      location: 'Multiple Regions',
      tags: ['brute-force', 'authentication', 'distributed-attack']
    },
    {
      id: 'AL-2025-HK-003',
      title: 'Unusual network traffic pattern detected',
      severity: 'medium',
      source: 'CloudWatch Logs',
      timestamp: '2025-01-15T08:20:00Z',
      status: 'new',
      description: 'Abnormal data transfer volumes detected during off-hours, suggesting potential data exfiltration.',
      iocs: [
        { type: 'ip', value: '203.0.113.75', confidence: 76 },
        { type: 'domain', value: 'data-transfer.suspicious.com', confidence: 82 }
      ],
      affectedAssets: ['VPC vpc-12345678', 'Database RDS-prod-01'],
      location: 'Asia Pacific',
      tags: ['data-exfiltration', 'network-anomaly', 'off-hours']
    },
    {
      id: 'AL-2025-HK-004',
      title: 'Malware signature detected in S3 upload',
      severity: 'high',
      source: 'Amazon Security Lake',
      timestamp: '2025-01-15T07:15:00Z',
      status: 'responded',
      description: 'Known malware hash detected in file uploaded to S3 bucket. File quarantined automatically.',
      iocs: [
        { type: 'hash', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', confidence: 99 },
        { type: 'ip', value: '192.0.2.50', confidence: 94 }
      ],
      affectedAssets: ['S3 Bucket uploads-bucket', 'Lambda Function file-scanner'],
      location: 'Singapore',
      tags: ['malware', 's3-upload', 'quarantined']
    },
    {
      id: 'AL-2025-HK-005',
      title: 'Privilege escalation attempt via IAM policy modification',
      severity: 'critical',
      source: 'AWS CloudTrail',
      timestamp: '2025-01-15T06:30:00Z',
      status: 'resolved',
      description: 'Unauthorized attempt to modify IAM policies to grant excessive permissions. Action blocked by guardrails.',
      iocs: [
        { type: 'ip', value: '198.51.100.123', confidence: 91 },
        { type: 'hash', value: 'f4a5b6c7d8e9...', confidence: 87 }
      ],
      affectedAssets: ['IAM Role admin-role', 'IAM Policy SecurityPolicy'],
      location: 'Hong Kong',
      tags: ['privilege-escalation', 'iam-abuse', 'blocked']
    }
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-900/30 text-red-400 border-red-700';
      case 'high': return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'medium': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'low': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-purple-900/30 text-purple-400 border-purple-700';
      case 'investigating': return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'analyzing': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'responded': return 'bg-yellow-900/30 text-yellow-400 border-yellow-700';
      case 'resolved': return 'bg-green-900/30 text-green-400 border-green-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  const getIOCIcon = (type: string) => {
    switch (type) {
      case 'ip': return <Globe className="h-3 w-3" />;
      case 'domain': return <Globe className="h-3 w-3" />;
      case 'hash': return <Hash className="h-3 w-3" />;
      case 'url': return <ExternalLink className="h-3 w-3" />;
      default: return <Shield className="h-3 w-3" />;
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         alert.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
    
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  // Aggregate IOCs
  const allIOCs = alerts.flatMap(alert => alert.iocs);
  const iocCounts = allIOCs.reduce((acc, ioc) => {
    const key = `${ioc.type}:${ioc.value}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topIOCs = Object.entries(iocCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([key, count]) => {
      const [type, value] = key.split(':');
      const originalIOC = allIOCs.find(ioc => ioc.type === type && ioc.value === value);
      return { type, value, count, confidence: originalIOC?.confidence || 0 };
    });

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 min-h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Alert Summary</h1>
        <p className="text-slate-300">Overview of all current security alerts with aggregated IOCs</p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search alerts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-slate-700/50 border-slate-600 text-white">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48 bg-slate-700/50 border-slate-600 text-white">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="analyzing">Analyzing</SelectItem>
            <SelectItem value="responded">Responded</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Active Alerts ({filteredAlerts.length})
          </h2>
          
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <Card 
                key={alert.id} 
                className="cursor-pointer hover:shadow-lg transition-all duration-200 bg-slate-800/50 backdrop-blur-sm border-slate-700 hover:bg-slate-700/50"
                onClick={() => onAlertClick(alert.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      <div>
                        <CardTitle className="text-base text-white">{alert.title}</CardTitle>
                        <CardDescription className="text-sm text-slate-300">
                          {alert.id} • {alert.source}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getSeverityColor(alert.severity)}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className={getStatusColor(alert.status)}>
                        {alert.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-300">{alert.description}</p>
                  
                  <div className="flex items-center space-x-4 text-xs text-slate-400">
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MapPin className="h-3 w-3" />
                      <span>{alert.location}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Database className="h-3 w-3 text-slate-400" />
                      <span className="text-xs text-slate-400">
                        {alert.affectedAssets.length} affected asset{alert.affectedAssets.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {alert.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs border-slate-600 text-slate-300">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {alert.iocs.length > 0 && (
                      <div className="pt-2 border-t border-slate-600">
                        <div className="flex items-center space-x-2 mb-1">
                          <Shield className="h-3 w-3 text-blue-500" />
                          <span className="text-xs font-medium text-slate-300">IOCs:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {alert.iocs.slice(0, 3).map((ioc, index) => (
                            <div key={index} className="flex items-center space-x-1 bg-slate-700/50 rounded px-2 py-1">
                              {getIOCIcon(ioc.type)}
                              <span className="text-xs font-mono text-slate-300">{ioc.value.substring(0, 20)}...</span>
                              <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                                {ioc.confidence}%
                              </Badge>
                            </div>
                          ))}
                          {alert.iocs.length > 3 && (
                            <span className="text-xs text-slate-400">+{alert.iocs.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* IOC Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Top IOCs</h2>
          
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Aggregated Indicators</CardTitle>
              <CardDescription className="text-slate-300">
                Most frequently observed IOCs across all alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {topIOCs.map((ioc, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <div className="text-slate-300">{getIOCIcon(ioc.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate text-slate-200">{ioc.value}</div>
                      <div className="text-xs text-slate-400 uppercase">{ioc.type}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                      {ioc.count}x
                    </Badge>
                    <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                      {ioc.confidence}%
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
            <CardHeader>
              <CardTitle className="text-base text-white">Alert Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-red-900/20 border border-red-700/30 rounded">
                  <div className="text-lg font-bold text-red-400">
                    {alerts.filter(a => a.severity === 'critical').length}
                  </div>
                  <div className="text-xs text-red-300">Critical</div>
                </div>
                <div className="p-2 bg-orange-900/20 border border-orange-700/30 rounded">
                  <div className="text-lg font-bold text-orange-400">
                    {alerts.filter(a => a.severity === 'high').length}
                  </div>
                  <div className="text-xs text-orange-300">High</div>
                </div>
                <div className="p-2 bg-blue-900/20 border border-blue-700/30 rounded">
                  <div className="text-lg font-bold text-blue-400">
                    {alerts.filter(a => a.status === 'investigating' || a.status === 'analyzing').length}
                  </div>
                  <div className="text-xs text-blue-300">Active</div>
                </div>
                <div className="p-2 bg-green-900/20 border border-green-700/30 rounded">
                  <div className="text-lg font-bold text-green-400">
                    {alerts.filter(a => a.status === 'resolved').length}
                  </div>
                  <div className="text-xs text-green-300">Resolved</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}