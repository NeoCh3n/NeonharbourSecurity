import React, { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Grid,
  Box,
  StatusIndicator,
  Table,
  Button,
  Alert,
  ProgressBar,
  Cards,
  Badge,
  ColumnLayout,
  KeyValuePairs,
  Spinner,
  Modal,
  CodeEditor
} from '@cloudscape-design/components';

interface ServiceHealth {
  service_name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  response_time_ms: number | null;
  last_check: string;
  error_message?: string;
  metadata?: Record<string, any>;
}

interface SystemHealthReport {
  overall_status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  timestamp: string;
  services: ServiceHealth[];
  performance_metrics: {
    avg_response_time_ms: number;
    max_response_time_ms: number;
    min_response_time_ms: number;
    total_services_checked: number;
    healthy_services: number;
    degraded_services: number;
    unhealthy_services: number;
  };
  error_count: number;
  warnings: string[];
}

interface DiagnosticReport {
  timestamp: string;
  system_info: Record<string, any>;
  aws_info: Record<string, any>;
  performance_metrics: Record<string, any>;
  recent_errors: Array<{
    timestamp: string;
    level: string;
    component: string;
    message: string;
    details?: Record<string, any>;
    stack_trace?: string;
  }>;
  resource_usage: Record<string, any>;
}

const SystemHealthDashboard: React.FC = () => {
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceHealth | null>(null);

  const fetchHealthData = async () => {
    try {
      const response = await fetch('/api/system/health');
      const data = await response.json();
      setHealthReport(data);
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const response = await fetch('/api/system/diagnostics');
      const data = await response.json();
      setDiagnosticReport(data);
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    }
  };

  const runHealthCheck = async () => {
    setLoading(true);
    await fetchHealthData();
    setLoading(false);
  };

  const runDiagnostics = async () => {
    setLoading(true);
    await fetchDiagnostics();
    setLoading(false);
  };

  useEffect(() => {
    fetchHealthData().then(() => setLoading(false));
    
    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'healthy':
        return <StatusIndicator type="success">Healthy</StatusIndicator>;
      case 'degraded':
        return <StatusIndicator type="warning">Degraded</StatusIndicator>;
      case 'unhealthy':
        return <StatusIndicator type="error">Unhealthy</StatusIndicator>;
      default:
        return <StatusIndicator type="info">Unknown</StatusIndicator>;
    }
  };

  const formatResponseTime = (timeMs: number | null) => {
    if (timeMs === null) return 'N/A';
    if (timeMs < 1000) return `${Math.round(timeMs)}ms`;
    return `${(timeMs / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading && !healthReport) {
    return (
      <Container>
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
          <Box variant="p" padding={{ top: 's' }}>
            Loading system health data...
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            description="Monitor system health, performance metrics, and AWS service status"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="refresh"
                  onClick={runHealthCheck}
                  loading={loading}
                >
                  Refresh
                </Button>
                <Button
                  iconName="settings"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  variant={autoRefresh ? "primary" : "normal"}
                >
                  Auto-refresh: {autoRefresh ? 'On' : 'Off'}
                </Button>
                <Button
                  iconName="search"
                  onClick={() => {
                    runDiagnostics();
                    setShowDiagnostics(true);
                  }}
                >
                  Run Diagnostics
                </Button>
              </SpaceBetween>
            }
          >
            System Health Dashboard
          </Header>
        }
      >
        {healthReport && (
          <SpaceBetween size="l">
            {/* Overall Status */}
            <Grid gridDefinition={[{ colspan: 4 }, { colspan: 4 }, { colspan: 4 }]}>
              <Box>
                <Box variant="h3" padding={{ bottom: 's' }}>
                  Overall Status
                </Box>
                <Box fontSize="display-l">
                  {getStatusIndicator(healthReport.overall_status)}
                </Box>
                <Box variant="small" color="text-status-info">
                  Last updated: {formatTimestamp(healthReport.timestamp)}
                </Box>
              </Box>
              
              <Box>
                <Box variant="h3" padding={{ bottom: 's' }}>
                  Service Summary
                </Box>
                <ColumnLayout columns={1} variant="text-grid">
                  <KeyValuePairs
                    columns={1}
                    items={[
                      {
                        label: 'Total Services',
                        value: healthReport.performance_metrics.total_services_checked
                      },
                      {
                        label: 'Healthy',
                        value: (
                          <Badge color="green">
                            {healthReport.performance_metrics.healthy_services}
                          </Badge>
                        )
                      },
                      {
                        label: 'Degraded',
                        value: (
                          <Badge color="blue">
                            {healthReport.performance_metrics.degraded_services}
                          </Badge>
                        )
                      },
                      {
                        label: 'Unhealthy',
                        value: (
                          <Badge color="red">
                            {healthReport.performance_metrics.unhealthy_services}
                          </Badge>
                        )
                      }
                    ]}
                  />
                </ColumnLayout>
              </Box>
              
              <Box>
                <Box variant="h3" padding={{ bottom: 's' }}>
                  Performance
                </Box>
                <ColumnLayout columns={1} variant="text-grid">
                  <KeyValuePairs
                    columns={1}
                    items={[
                      {
                        label: 'Avg Response Time',
                        value: formatResponseTime(healthReport.performance_metrics.avg_response_time_ms)
                      },
                      {
                        label: 'Max Response Time',
                        value: formatResponseTime(healthReport.performance_metrics.max_response_time_ms)
                      },
                      {
                        label: 'Min Response Time',
                        value: formatResponseTime(healthReport.performance_metrics.min_response_time_ms)
                      }
                    ]}
                  />
                </ColumnLayout>
              </Box>
            </Grid>

            {/* Warnings */}
            {healthReport.warnings.length > 0 && (
              <Alert type="warning" header="System Warnings">
                <ul>
                  {healthReport.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* Service Details Table */}
            <Table
              columnDefinitions={[
                {
                  id: 'service_name',
                  header: 'Service',
                  cell: (item: ServiceHealth) => item.service_name,
                  sortingField: 'service_name'
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (item: ServiceHealth) => getStatusIndicator(item.status),
                  sortingField: 'status'
                },
                {
                  id: 'response_time',
                  header: 'Response Time',
                  cell: (item: ServiceHealth) => formatResponseTime(item.response_time_ms),
                  sortingField: 'response_time_ms'
                },
                {
                  id: 'last_check',
                  header: 'Last Check',
                  cell: (item: ServiceHealth) => formatTimestamp(item.last_check),
                  sortingField: 'last_check'
                },
                {
                  id: 'actions',
                  header: 'Actions',
                  cell: (item: ServiceHealth) => (
                    <Button
                      variant="inline-link"
                      onClick={() => setSelectedService(item)}
                    >
                      View Details
                    </Button>
                  )
                }
              ]}
              items={healthReport.services}
              loadingText="Loading services..."
              sortingDisabled={false}
              empty={
                <Box textAlign="center" color="inherit">
                  <b>No services found</b>
                  <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                    No services are currently being monitored.
                  </Box>
                </Box>
              }
              header={
                <Header
                  counter={`(${healthReport.services.length})`}
                  description="AWS services and their current health status"
                >
                  Service Health Details
                </Header>
              }
            />
          </SpaceBetween>
        )}
      </Container>

      {/* Service Details Modal */}
      {selectedService && (
        <Modal
          onDismiss={() => setSelectedService(null)}
          visible={!!selectedService}
          size="large"
          header={`Service Details: ${selectedService.service_name}`}
        >
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <KeyValuePairs
                columns={1}
                items={[
                  {
                    label: 'Status',
                    value: getStatusIndicator(selectedService.status)
                  },
                  {
                    label: 'Response Time',
                    value: formatResponseTime(selectedService.response_time_ms)
                  },
                  {
                    label: 'Last Check',
                    value: formatTimestamp(selectedService.last_check)
                  }
                ]}
              />
              
              {selectedService.error_message && (
                <Alert type="error" header="Error Details">
                  {selectedService.error_message}
                </Alert>
              )}
            </ColumnLayout>
            
            {selectedService.metadata && (
              <Box>
                <Box variant="h3" padding={{ bottom: 's' }}>
                  Service Metadata
                </Box>
                <CodeEditor
                  ace={undefined}
                  language="json"
                  value={JSON.stringify(selectedService.metadata, null, 2)}
                  readOnly
                  preferences={{
                    fontSize: 14,
                    tabSize: 2
                  }}
                />
              </Box>
            )}
          </SpaceBetween>
        </Modal>
      )}

      {/* Diagnostics Modal */}
      {showDiagnostics && (
        <Modal
          onDismiss={() => setShowDiagnostics(false)}
          visible={showDiagnostics}
          size="max"
          header="System Diagnostics Report"
        >
          {diagnosticReport ? (
            <SpaceBetween size="l">
              <Alert type="info" header="Diagnostic Report Generated">
                Report generated at: {formatTimestamp(diagnosticReport.timestamp)}
              </Alert>
              
              <ColumnLayout columns={2}>
                <Box>
                  <Box variant="h3" padding={{ bottom: 's' }}>
                    System Information
                  </Box>
                  <CodeEditor
                    ace={undefined}
                    language="json"
                    value={JSON.stringify(diagnosticReport.system_info, null, 2)}
                    readOnly
                    preferences={{
                      fontSize: 12,
                      tabSize: 2
                    }}
                  />
                </Box>
                
                <Box>
                  <Box variant="h3" padding={{ bottom: 's' }}>
                    AWS Information
                  </Box>
                  <CodeEditor
                    ace={undefined}
                    language="json"
                    value={JSON.stringify(diagnosticReport.aws_info, null, 2)}
                    readOnly
                    preferences={{
                      fontSize: 12,
                      tabSize: 2
                    }}
                  />
                </Box>
              </ColumnLayout>
              
              <Box>
                <Box variant="h3" padding={{ bottom: 's' }}>
                  Performance Metrics
                </Box>
                <CodeEditor
                  ace={undefined}
                  language="json"
                  value={JSON.stringify(diagnosticReport.performance_metrics, null, 2)}
                  readOnly
                  preferences={{
                    fontSize: 12,
                    tabSize: 2
                  }}
                />
              </Box>
              
              {diagnosticReport.recent_errors.length > 0 && (
                <Box>
                  <Box variant="h3" padding={{ bottom: 's' }}>
                    Recent Errors
                  </Box>
                  <Table
                    columnDefinitions={[
                      {
                        id: 'timestamp',
                        header: 'Timestamp',
                        cell: (item: any) => formatTimestamp(item.timestamp)
                      },
                      {
                        id: 'level',
                        header: 'Level',
                        cell: (item: any) => (
                          <Badge color={item.level === 'error' ? 'red' : 'blue'}>
                            {item.level.toUpperCase()}
                          </Badge>
                        )
                      },
                      {
                        id: 'component',
                        header: 'Component',
                        cell: (item: any) => item.component
                      },
                      {
                        id: 'message',
                        header: 'Message',
                        cell: (item: any) => item.message
                      }
                    ]}
                    items={diagnosticReport.recent_errors}
                    empty={
                      <Box textAlign="center">
                        <b>No recent errors</b>
                      </Box>
                    }
                  />
                </Box>
              )}
            </SpaceBetween>
          ) : (
            <Box textAlign="center" padding="xxl">
              <Spinner size="large" />
              <Box variant="p" padding={{ top: 's' }}>
                Generating diagnostic report...
              </Box>
            </Box>
          )}
        </Modal>
      )}
    </SpaceBetween>
  );
};

export default SystemHealthDashboard;