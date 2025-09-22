import { useState } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  FormField,
  Input,
  Button,
  Toggle,
  Select,
  Textarea,
  Box,
  StatusIndicator,
  Tabs,
  TabsProps
} from '@cloudscape-design/components';
import { AWSServiceConfig } from './AWSServiceConfig';
import { AWSSetupWizard } from './AWSSetupWizard';
import { EnvironmentManager } from './EnvironmentManager';

export function SystemConfiguration() {
  const [config, setConfig] = useState({
    aiProvider: 'bedrock',
    debugMode: false,
    logLevel: 'info',
    maxConcurrentInvestigations: '10',
    apiTimeout: '30',
    description: 'NeoHarbour Security SOC Platform'
  });

  const [loading, setLoading] = useState(false);
  const [activeTabId, setActiveTabId] = useState('aws-config');

  const handleSave = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  const tabs: TabsProps.Tab[] = [
    {
      id: 'aws-config',
      label: 'AWS Configuration',
      content: <AWSServiceConfig />
    },
    {
      id: 'environment',
      label: 'Environment Management',
      content: <EnvironmentManager />
    },
    {
      id: 'setup-wizard',
      label: 'Setup Wizard',
      content: <AWSSetupWizard onComplete={() => setActiveTabId('aws-config')} />
    },
    {
      id: 'system-settings',
      label: 'System Settings',
      content: (
        <SpaceBetween size="l">
          <Container
            header={<Header variant="h2">System Configuration</Header>}
          >
            <SpaceBetween size="m">
              <FormField label="AI Provider">
                <Select
                  selectedOption={{ label: 'Amazon Bedrock', value: 'bedrock' }}
                  options={[
                    { label: 'Amazon Bedrock', value: 'bedrock' },
                    { label: 'Kiro', value: 'kiro' },
                    { label: 'Amazon Q', value: 'amazonq' }
                  ]}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, aiProvider: detail.selectedOption.value || 'bedrock' }))
                  }
                />
              </FormField>

              <FormField label="Log Level">
                <Select
                  selectedOption={{ label: 'Info', value: 'info' }}
                  options={[
                    { label: 'Debug', value: 'debug' },
                    { label: 'Info', value: 'info' },
                    { label: 'Warning', value: 'warning' },
                    { label: 'Error', value: 'error' }
                  ]}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, logLevel: detail.selectedOption.value || 'info' }))
                  }
                />
              </FormField>

              <FormField label="Max Concurrent Investigations">
                <Input
                  value={config.maxConcurrentInvestigations}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, maxConcurrentInvestigations: detail.value }))
                  }
                  type="number"
                />
              </FormField>

              <FormField label="API Timeout (seconds)">
                <Input
                  value={config.apiTimeout}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, apiTimeout: detail.value }))
                  }
                  type="number"
                />
              </FormField>

              <FormField label="Debug Mode">
                <Toggle
                  checked={config.debugMode}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, debugMode: detail.checked }))
                  }
                >
                  Enable debug logging
                </Toggle>
              </FormField>

              <FormField label="System Description">
                <Textarea
                  value={config.description}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, description: detail.value }))
                  }
                  rows={3}
                />
              </FormField>

              <Box float="right">
                <Button
                  variant="primary"
                  onClick={handleSave}
                  loading={loading}
                >
                  Save Configuration
                </Button>
              </Box>
            </SpaceBetween>
          </Container>

          <Container
            header={<Header variant="h2">Current Status</Header>}
          >
            <SpaceBetween size="s">
              <Box>
                <StatusIndicator type="success">Configuration Valid</StatusIndicator>
              </Box>
              <Box>
                <StatusIndicator type="success">AI Provider Connected</StatusIndicator>
              </Box>
              <Box>
                <StatusIndicator type="info">Last Updated: Just now</StatusIndicator>
              </Box>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      )
    }
  ];

  return (
    <Tabs
      tabs={tabs}
      activeTabId={activeTabId}
      onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
    />
  );
}