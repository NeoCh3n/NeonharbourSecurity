import { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  ColumnLayout,
  StatusIndicator,
  ProgressBar,
  Table,
  Badge,
  Button
} from '@cloudscape-design/components';

interface SystemMetric {
  id: string;
  name: string;
  value: string;
  status: 'success' | 'warning' | 'error';
  lastUpdated: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  component: string;
}

export function SystemMonitoring() {
  const [metrics, setMetrics] = useState<SystemMetric[]>([
    {
      id: '1',
      name: 'CPU Usage',
      value: '45%',
      status: 'success',
      lastUpdated: '2 minutes ago'
    },
    {
      id: '2',
      name: 'Memory Usage',
      value: '67%',
      status: 'warning',
      lastUpdated: '1 minute ago'
    },
    {
      id: '3',
      name: 'Active Investigations',
      value: '12',
      status: 'success',
      lastUpdated: '30 seconds ago'
    },
    {
      id: '4',
      name: 'API Response Time',
      value: '245ms',
      status: 'success',
      lastUpdated: '1 minute ago'
    }
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: '2024-02-12T10:30:00Z',
      level: 'info',
      message: 'Investigation pipeline started successfully',
      component: 'Pipeline'
    },
    {
      id: '2',
      timestamp: '2024-02-12T10:25:00Z',
      level: 'warning',
      message: 'High memory usage detected',
      component: 'System'
    },
    {
      id: '3',
      timestamp: '2024-02-12T10:20:00Z',
      level: 'info',
      message: 'User authentication successful',
      component: 'Auth'
    }
  ]);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const getStatusType = (status: string) => {
    switch (status) {
      case 'success': return 'success';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  const getBadgeColor = (level: string) => {
    switch (level) {
      case 'error': return 'red';
      case 'warning': return 'yellow';
      case 'info': return 'blue';
      default: return 'grey';
    }
  };

  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header 
            variant="h2"
            actions={
              <Button
                iconName="refresh"
                onClick={handleRefresh}
                loading={refreshing}
              >
                Refresh
              </Button>
            }
          >
            System Health
          </Header>
        }
      >
        <ColumnLayout columns={4} variant="text-grid">
          {metrics.map((metric) => (
            <Box key={metric.id}>
              <Box variant="awsui-key-label">{metric.name}</Box>
              <Box variant="h2">{metric.value}</Box>
              <StatusIndicator type={getStatusType(metric.status)}>
                {metric.lastUpdated}
              </StatusIndicator>
            </Box>
          ))}
        </ColumnLayout>
      </Container>

      <Container
        header={<Header variant="h2">Performance Metrics</Header>}
      >
        <SpaceBetween size="m">
          <Box>
            <Box variant="awsui-key-label">CPU Usage</Box>
            <ProgressBar value={45} />
          </Box>
          <Box>
            <Box variant="awsui-key-label">Memory Usage</Box>
            <ProgressBar value={67} />
          </Box>
          <Box>
            <Box variant="awsui-key-label">Disk Usage</Box>
            <ProgressBar value={23} />
          </Box>
        </SpaceBetween>
      </Container>

      <Container
        header={<Header variant="h2">Recent System Logs</Header>}
      >
        <Table
          items={logs}
          columnDefinitions={[
            {
              id: 'timestamp',
              header: 'Timestamp',
              cell: (item) => new Date(item.timestamp).toLocaleString()
            },
            {
              id: 'level',
              header: 'Level',
              cell: (item) => (
                <Badge color={getBadgeColor(item.level)}>
                  {item.level.toUpperCase()}
                </Badge>
              )
            },
            {
              id: 'component',
              header: 'Component',
              cell: (item) => item.component
            },
            {
              id: 'message',
              header: 'Message',
              cell: (item) => item.message
            }
          ]}
          trackBy="id"
          empty={<Box padding="s">No logs available</Box>}
          wrapLines
        />
      </Container>
    </SpaceBetween>
  );
}