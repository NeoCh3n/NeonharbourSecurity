import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle2, Shield, Database, AlertTriangle, Activity, Cloud, ArrowRight } from 'lucide-react';

interface DataSource {
  id: string;
  name: string;
  description: string;
  functionality: string;
  value: string;
  icon: React.ReactNode;
  category: string;
  status: 'available' | 'premium' | 'enterprise';
}

interface DataSourceSelectionProps {
  onContinue: (selectedSources: string[]) => void;
}

export function DataSourceSelection({ onContinue }: DataSourceSelectionProps) {
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  const dataSources: DataSource[] = [
    {
      id: 'security-lake',
      name: 'Amazon Security Lake',
      description: 'AWS\'s managed secure data lake service launched in 2022.',
      functionality: 'Centralizes various security events like CloudTrail, VPC Flow Logs, GuardDuty findings, and Security Hub alerts into a single location (using the Open Cybersecurity Schema Framework, OCSF standard).',
      value: 'Provides unified data storage and standardized formats for SIEM systems, facilitating analysis and visualization.',
      icon: <Database className="h-6 w-6" />,
      category: 'Data Lake',
      status: 'available'
    },
    {
      id: 'guardduty',
      name: 'Amazon GuardDuty',
      description: 'A threat detection service.',
      functionality: 'Continuously analyzes logs (CloudTrail, VPC, DNS, EKS, S3, IAM, etc.) to detect malicious activity and potential threats.',
      value: 'Acts as AWS\'s built-in detection engine, generating alerts that can serve as data sources for SIEM systems.',
      icon: <Shield className="h-6 w-6" />,
      category: 'Threat Detection',
      status: 'available'
    },
    {
      id: 'security-hub',
      name: 'AWS Security Hub',
      description: 'Centralized dashboard for security alerts and compliance.',
      functionality: 'Aggregates findings from GuardDuty, Inspector, Macie, Firewall Manager, and third-party solutions (CrowdStrike, Splunk, Palo Alto, etc.).',
      value: 'Provides a unified alert collection layer, serving as a "mini SIEM" for AWS environments.',
      icon: <AlertTriangle className="h-6 w-6" />,
      category: 'Security Hub',
      status: 'available'
    },
    {
      id: 'cloudwatch-eventbridge',
      name: 'CloudWatch Logs + EventBridge',
      description: 'AWS native log and event bus.',
      functionality: 'CloudWatch centrally stores application and security logs; EventBridge distributes events to external systems (Splunk, Datadog, on-premises SIEM).',
      value: 'Acts as the log pipeline for SIEM.',
      icon: <Activity className="h-6 w-6" />,
      category: 'Log Management',
      status: 'available'
    },
    {
      id: 'third-party-siem',
      name: 'Third-Party SIEM Integration',
      description: 'Common integration patterns with external SIEM solutions.',
      functionality: 'Splunk on AWS: Deploy Splunk Enterprise on AWS to ingest CloudTrail, VPC Flow Logs, etc. Elastic (ELK/OpenSearch): Self-hosted Elasticsearch + Kibana for SIEM analysis. Microsoft Sentinel / IBM QRadar Cloud: Integrate AWS data with external SIEMs via connectors.',
      value: 'Enables integration with existing SIEM infrastructure and specialized security tools.',
      icon: <Cloud className="h-6 w-6" />,
      category: 'External Integration',
      status: 'premium'
    }
  ];

  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge variant="secondary" className="bg-green-900/30 text-green-400 border-green-700">Available</Badge>;
      case 'premium':
        return <Badge variant="secondary" className="bg-blue-900/30 text-blue-400 border-blue-700">Premium</Badge>;
      case 'enterprise':
        return <Badge variant="secondary" className="bg-purple-900/30 text-purple-400 border-purple-700">Enterprise</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Configure Data Sources</h1>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Select the AWS security services and integrations you want to connect to NeoHarbor Security. 
            Our multi-agent pipeline will analyze data from these sources to provide intelligent security insights.
          </p>
        </div>

        {/* Data Sources Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {dataSources.map((source) => (
            <Card 
              key={source.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-slate-700 ${
                selectedSources.includes(source.id) 
                  ? 'ring-2 ring-blue-400 bg-blue-900/40 border-blue-500' 
                  : 'bg-slate-800/50 hover:bg-slate-700/50 backdrop-blur-sm'
              }`}
              onClick={() => toggleSource(source.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg transition-all duration-200 ${
                      selectedSources.includes(source.id)
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-slate-700/50 text-slate-300'
                    }`}>
                      {source.icon}
                    </div>
                    <div>
                      <CardTitle className={`text-lg transition-all duration-200 ${
                        selectedSources.includes(source.id) ? 'text-white' : 'text-slate-200'
                      }`}>{source.name}</CardTitle>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className="border-slate-600 text-slate-300">{source.category}</Badge>
                        {getStatusBadge(source.status)}
                      </div>
                    </div>
                  </div>
                  <div className={`transition-all duration-200 ${
                    selectedSources.includes(source.id) ? 'text-blue-400' : 'text-slate-500'
                  }`}>
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                </div>
                <CardDescription className={`text-sm mt-2 transition-all duration-200 ${
                  selectedSources.includes(source.id) ? 'text-slate-300' : 'text-slate-400'
                }`}>
                  {source.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className={`font-medium text-sm mb-1 transition-all duration-200 ${
                      selectedSources.includes(source.id) ? 'text-slate-300' : 'text-slate-400'
                    }`}>Functionality</h4>
                    <p className={`text-sm transition-all duration-200 ${
                      selectedSources.includes(source.id) ? 'text-slate-400' : 'text-slate-500'
                    }`}>{source.functionality}</p>
                  </div>
                  <div>
                    <h4 className={`font-medium text-sm mb-1 transition-all duration-200 ${
                      selectedSources.includes(source.id) ? 'text-slate-300' : 'text-slate-400'
                    }`}>Value</h4>
                    <p className={`text-sm transition-all duration-200 ${
                      selectedSources.includes(source.id) ? 'text-slate-400' : 'text-slate-500'
                    }`}>{source.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Selection Summary and Continue */}
        <div className="sticky top-0 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-700 shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">Selected Data Sources</h3>
              <p className="text-sm text-slate-300">
                {selectedSources.length === 0 
                  ? 'No data sources selected' 
                  : `${selectedSources.length} data source${selectedSources.length > 1 ? 's' : ''} selected`
                }
              </p>
            </div>
            <Button 
              onClick={() => onContinue(selectedSources)}
              disabled={selectedSources.length === 0}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
            >
              <span>Continue to Dashboard</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          
          {selectedSources.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <div className="flex flex-wrap gap-2">
                {selectedSources.map(sourceId => {
                  const source = dataSources.find(s => s.id === sourceId);
                  return source ? (
                    <Badge key={sourceId} variant="secondary" className="flex items-center space-x-1 bg-blue-900/30 text-blue-300 border-blue-700">
                      {source.icon}
                      <span>{source.name}</span>
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}