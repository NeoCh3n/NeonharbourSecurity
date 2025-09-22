import { useState } from 'react';
import {
  Container,
  Header,
  Tabs,
  SpaceBetween,
  Box,
  ColumnLayout,
  StatusIndicator,
  Badge,
  Button
} from '@cloudscape-design/components';
import { RequirePermission } from './ProtectedComponent';
import { PERMISSIONS } from '../hooks/useAuth';
import { AdminUserManagement } from './AdminUserManagement';
import { SystemConfiguration } from './SystemConfiguration';
import { SystemMonitoring } from './SystemMonitoring';
import { AWSServiceConfig } from './AWSServiceConfig';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: <AdminOverview />
    },
    {
      id: 'users',
      label: 'User Management',
      content: <AdminUserManagement />
    },
    {
      id: 'system',
      label: 'System Configuration',
      content: <SystemConfiguration />
    },
    {
      id: 'aws',
      label: 'AWS Services',
      content: <AWSServiceConfig />
    },
    {
      id: 'monitoring',
      label: 'System Health',
      content: <SystemMonitoring />
    }
  ];

  return (
    <RequirePermission permission={PERMISSIONS.CONFIGURE_SYSTEM} showFallback>
      <Container
        header={
          <Header variant="h1">
            System Administration
          </Header>
        }
      >
        <Tabs
          tabs={tabs}
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
        />
      </Container>
    </RequirePermission>
  );
}

function AdminOverview() {
  return (
    <SpaceBetween size="l">
      <Container
        header={<Header variant="h2">System Status</Header>}
      >
        <ColumnLayout columns={4} variant="text-grid">
          <Box>
            <Box variant="awsui-key-label">System Status</Box>
            <StatusIndicator type="success">Operational</StatusIndicator>
          </Box>
          <Box>
            <Box variant="awsui-key-label">AWS Services</Box>
            <StatusIndicator type="success">Connected</StatusIndicator>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Active Users</Box>
            <Box variant="h2">12</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Demo Sessions</Box>
            <Box variant="h2">3</Box>
          </Box>
        </ColumnLayout>
      </Container>

      <Container
        header={<Header variant="h2">Quick Actions</Header>}
      >
        <SpaceBetween direction="horizontal" size="s">
          <Button variant="primary">Test AWS Connection</Button>
          <Button>View System Logs</Button>
          <Button>Generate Health Report</Button>
          <Button>Backup Configuration</Button>
        </SpaceBetween>
      </Container>

      <Container
        header={<Header variant="h2">Recent Activity</Header>}
      >
        <Box>
          <SpaceBetween size="s">
            <Box>
              <Badge color="blue">INFO</Badge> System configuration updated by admin@example.com
            </Box>
            <Box>
              <Badge color="green">SUCCESS</Badge> AWS services health check completed
            </Box>
            <Box>
              <Badge color="blue">INFO</Badge> New user registered: analyst@example.com
            </Box>
          </SpaceBetween>
        </Box>
      </Container>
    </SpaceBetween>
  );
}