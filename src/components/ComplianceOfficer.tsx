import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { 
  ArrowLeft,
  Shield,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  Target,
  Download,
  Send,
  Calendar,
  Activity,
  Database,
  Settings,
  Zap,
  Timer,
  Users,
  BookOpen,
  Eye,
  Gavel,
  MessageSquare,
  Bell,
  PlayCircle,
  BarChart3
} from 'lucide-react';

interface ComplianceOfficerProps {
  onBack: () => void;
}

interface ComplianceIncident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  detectedAt: string;
  status: 'detected' | 'analyzing' | 'reporting' | 'reported' | 'closed';
  reportDeadline: string;
  reportProgress: number;
  ogcioNotified: boolean;
}

interface AuditTrailEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorType: 'ai' | 'human';
  action: string;
  details: string;
  incidentId?: string;
  complianceImpact: 'none' | 'low' | 'medium' | 'high';
}

interface DrillSchedule {
  id: string;
  name: string;
  type: 'cyber-incident' | 'data-breach' | 'system-failure' | 'compliance-audit';
  nextDue: string;
  frequency: 'bi-annual' | 'quarterly' | 'monthly';
  status: 'upcoming' | 'overdue' | 'completed';
  lastCompleted?: string;
}

export function ComplianceOfficer({ onBack }: ComplianceOfficerProps) {
  const [activeIncidents, setActiveIncidents] = useState<ComplianceIncident[]>([
    {
      id: 'INC-2025-001',
      title: 'Critical Infrastructure Data Breach',
      severity: 'critical',
      detectedAt: '2025-01-15T14:30:00Z',
      status: 'reporting',
      reportDeadline: '2025-01-16T02:30:00Z', // 12 hours for critical
      reportProgress: 85,
      ogcioNotified: true
    },
    {
      id: 'INC-2025-002',
      title: 'Unauthorized Access Attempt',
      severity: 'high',
      detectedAt: '2025-01-15T16:45:00Z',
      status: 'analyzing',
      reportDeadline: '2025-01-17T16:45:00Z', // 48 hours for high
      reportProgress: 35,
      ogcioNotified: false
    }
  ]);

  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([
    {
      id: 'AUDIT-001',
      timestamp: '2025-01-15T14:31:15Z',
      actor: 'Autonomous Compliance Officer',
      actorType: 'ai',
      action: 'Incident Classification',
      details: 'Classified incident INC-2025-001 as Critical Infrastructure breach requiring 12-hour OGCIO reporting',
      incidentId: 'INC-2025-001',
      complianceImpact: 'high'
    },
    {
      id: 'AUDIT-002',
      timestamp: '2025-01-15T14:32:00Z',
      actor: 'Autonomous Compliance Officer',
      actorType: 'ai',
      action: 'OGCIO Notification',
      details: 'Automatically generated and sent preliminary incident notification to OGCIO within 1 minute of detection',
      incidentId: 'INC-2025-001',
      complianceImpact: 'high'
    },
    {
      id: 'AUDIT-003',
      timestamp: '2025-01-15T15:15:30Z',
      actor: 'Security Analyst: Wong Ka Ming',
      actorType: 'human',
      action: 'Evidence Collection',
      details: 'Collected additional forensic evidence for incident report. Verified AI classification accuracy.',
      incidentId: 'INC-2025-001',
      complianceImpact: 'medium'
    }
  ]);

  const [drillSchedule, setDrillSchedule] = useState<DrillSchedule[]>([
    {
      id: 'DRILL-001',
      name: 'Cyber Incident Response Drill',
      type: 'cyber-incident',
      nextDue: '2025-02-15T09:00:00Z',
      frequency: 'bi-annual',
      status: 'upcoming',
      lastCompleted: '2024-08-15T09:00:00Z'
    },
    {
      id: 'DRILL-002',
      name: 'Data Breach Simulation',
      type: 'data-breach',
      nextDue: '2025-01-20T14:00:00Z',
      frequency: 'quarterly',
      status: 'overdue',
      lastCompleted: '2024-10-20T14:00:00Z'
    },
    {
      id: 'DRILL-003',
      name: 'Critical System Failure Exercise',
      type: 'system-failure',
      nextDue: '2025-03-01T10:30:00Z',
      frequency: 'bi-annual',
      status: 'upcoming',
      lastCompleted: '2024-09-01T10:30:00Z'
    }
  ]);

  const [complianceMetrics, setComplianceMetrics] = useState({
    reportingCompliance: 98.5,
    auditReadiness: 95.2,
    drillCompletionRate: 100,
    deadlineAdherence: 97.8,
    ogcioResponseTime: '2.3',
    annualAuditScore: 'A+'
  });

  // Calculate time remaining for deadlines
  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'OVERDUE', color: 'text-red-400', urgent: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours < 6) {
      return { text: `${hours}h ${minutes}m`, color: 'text-red-400', urgent: true };
    } else if (hours < 24) {
      return { text: `${hours}h ${minutes}m`, color: 'text-orange-400', urgent: false };
    } else {
      const days = Math.floor(hours / 24);
      return { text: `${days}d ${hours % 24}h`, color: 'text-green-400', urgent: false };
    }
  };

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
      case 'completed': return 'bg-green-900/30 text-green-400 border-green-700';
      case 'reporting': return 'bg-blue-900/30 text-blue-400 border-blue-700';
      case 'analyzing': return 'bg-purple-900/30 text-purple-400 border-purple-700';
      case 'detected': return 'bg-orange-900/30 text-orange-400 border-orange-700';
      case 'overdue': return 'bg-red-900/30 text-red-400 border-red-700';
      default: return 'bg-slate-700/30 text-slate-300 border-slate-600';
    }
  };

  const generateComplianceReport = (incidentId: string) => {
    // Simulate report generation
    console.log(`Generating compliance report for incident: ${incidentId}`);
  };

  const runDrill = (drillId: string) => {
    // Simulate drill execution
    console.log(`Starting drill: ${drillId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
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
            <Shield className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Autonomous Compliance Officer</h1>
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              Active 24/7
            </Badge>
          </div>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border-blue-700/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-300">Reporting Compliance</p>
                  <p className="text-2xl font-bold text-blue-400">{complianceMetrics.reportingCompliance}%</p>
                </div>
                <FileText className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-300">Audit Readiness</p>
                  <p className="text-2xl font-bold text-green-400">{complianceMetrics.auditReadiness}%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border-purple-700/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-300">OGCIO Response</p>
                  <p className="text-2xl font-bold text-purple-400">{complianceMetrics.ogcioResponseTime}min</p>
                </div>
                <Timer className="h-8 w-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border-orange-700/30">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-300">Annual Audit</p>
                  <p className="text-2xl font-bold text-orange-400">{complianceMetrics.annualAuditScore}</p>
                </div>
                <Gavel className="h-8 w-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="incidents" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border-slate-700">
            <TabsTrigger value="incidents" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Active Incidents
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Audit Trail
            </TabsTrigger>
            <TabsTrigger value="drills" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Mandatory Drills
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Compliance Reports
            </TabsTrigger>
          </TabsList>

          {/* Active Incidents Tab */}
          <TabsContent value="incidents" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-400" />
                  <span>Incident Reporting & OGCIO Compliance</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Autonomous incident classification and mandatory reporting within compliance deadlines
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeIncidents.map((incident) => {
                    const timeRemaining = getTimeRemaining(incident.reportDeadline);
                    return (
                      <Card key={incident.id} className={`bg-slate-700/30 border-slate-600 ${timeRemaining.urgent ? 'border-l-4 border-l-red-500' : ''}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <h3 className="font-medium text-white">{incident.title}</h3>
                                <Badge className={getSeverityColor(incident.severity)}>
                                  {incident.severity.toUpperCase()}
                                </Badge>
                                <Badge className={getStatusColor(incident.status)}>
                                  {incident.status.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-400">
                                {incident.id} • Detected: {new Date(incident.detectedAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right space-y-1">
                              <div className={`text-sm font-medium ${timeRemaining.color}`}>
                                {timeRemaining.text} remaining
                              </div>
                              <div className="text-xs text-slate-500">
                                Deadline: {new Date(incident.reportDeadline).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-slate-300">Report Progress</span>
                                <span className="text-sm text-blue-400">{incident.reportProgress}%</span>
                              </div>
                              <Progress value={incident.reportProgress} className="h-2" />
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                  <div className={`w-2 h-2 rounded-full ${incident.ogcioNotified ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                  <span className="text-sm text-slate-300">
                                    OGCIO {incident.ogcioNotified ? 'Notified' : 'Pending'}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Clock className="h-4 w-4 text-blue-400" />
                                  <span className="text-sm text-slate-300">
                                    {incident.severity === 'critical' ? '12' : '48'} hour deadline
                                  </span>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                                  <Eye className="h-4 w-4 mr-1" />
                                  View Details
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                                  onClick={() => generateComplianceReport(incident.id)}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Generate Report
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audit Trail Tab */}
          <TabsContent value="audit" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Database className="h-5 w-5 text-green-400" />
                  <span>Continuous Audit Trail</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Permanent, regulator-ready logging of all AI and human actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {auditTrail.map((entry) => (
                    <div key={entry.id} className="flex items-start space-x-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex-shrink-0 mt-1">
                        {entry.actorType === 'ai' ? (
                          <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                            <Zap className="h-4 w-4 text-blue-400" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                            <Users className="h-4 w-4 text-green-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-white">{entry.action}</h4>
                          <div className="flex items-center space-x-2">
                            <Badge className={
                              entry.complianceImpact === 'high' ? 'bg-red-900/30 text-red-400 border-red-700' :
                              entry.complianceImpact === 'medium' ? 'bg-orange-900/30 text-orange-400 border-orange-700' :
                              entry.complianceImpact === 'low' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700' :
                              'bg-slate-700/30 text-slate-300 border-slate-600'
                            }>
                              {entry.complianceImpact.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mb-2">{entry.details}</p>
                        <div className="flex items-center space-x-4 text-xs text-slate-500">
                          <span>Actor: {entry.actor}</span>
                          {entry.incidentId && <span>Incident: {entry.incidentId}</span>}
                          <span>ID: {entry.id}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Drills Tab */}
          <TabsContent value="drills" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <Target className="h-5 w-5 text-purple-400" />
                  <span>Mandatory Security Drills</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Bi-annual drills with automated after-action reports for regulatory compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {drillSchedule.map((drill) => (
                    <Card key={drill.id} className={`bg-slate-700/30 border-slate-600 ${drill.status === 'overdue' ? 'border-l-4 border-l-red-500' : ''}`}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h3 className="font-medium text-white">{drill.name}</h3>
                              <Badge className={getStatusColor(drill.status)}>
                                {drill.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-sm text-slate-400 space-y-1">
                              <p>Type: {drill.type.replace('-', ' ').toUpperCase()}</p>
                              <p>Frequency: {drill.frequency}</p>
                              <p>Next Due: {new Date(drill.nextDue).toLocaleDateString()}</p>
                              {drill.lastCompleted && (
                                <p>Last Completed: {new Date(drill.lastCompleted).toLocaleDateString()}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                              <BookOpen className="h-4 w-4 mr-1" />
                              View History
                            </Button>
                            <Button 
                              size="sm" 
                              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                              onClick={() => runDrill(drill.id)}
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              Run Drill
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-cyan-400" />
                  <span>Compliance Reports & Analytics</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Automated report generation and compliance analytics dashboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-medium text-white">Available Reports</h3>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <FileText className="h-4 w-4 mr-2" />
                        OGCIO Incident Reports (Q4 2024)
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Database className="h-4 w-4 mr-2" />
                        Audit Trail Export (Full Year)
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Target className="h-4 w-4 mr-2" />
                        Security Drill Compliance Report
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Gavel className="h-4 w-4 mr-2" />
                        Annual Regulatory Compliance Summary
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="font-medium text-white">Compliance Metrics</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Deadline Adherence</span>
                        <span className="text-sm font-medium text-green-400">{complianceMetrics.deadlineAdherence}%</span>
                      </div>
                      <Progress value={complianceMetrics.deadlineAdherence} className="h-2" />
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">Drill Completion Rate</span>
                        <span className="text-sm font-medium text-green-400">{complianceMetrics.drillCompletionRate}%</span>
                      </div>
                      <Progress value={complianceMetrics.drillCompletionRate} className="h-2" />
                      
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="text-center p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
                          <div className="text-lg font-bold text-blue-400">12</div>
                          <div className="text-xs text-slate-400">Reports This Quarter</div>
                        </div>
                        <div className="text-center p-3 bg-green-900/20 border border-green-700/30 rounded-lg">
                          <div className="text-lg font-bold text-green-400">100%</div>
                          <div className="text-xs text-slate-400">On-Time Submissions</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}