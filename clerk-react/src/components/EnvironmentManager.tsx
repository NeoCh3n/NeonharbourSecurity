import { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Button,
  Box,
  Alert,
  Modal,
  Cards,
  Badge,
  StatusIndicator,
  Table,
  ColumnLayout
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';

interface EnvironmentPreset {
  name: string;
  description: string;
  config: Record<string, string>;
}

interface EnvironmentConfig {
  config: Record<string, string>;
  completeness: {
    complete: boolean;
    missing: string[];
  };
}

export function EnvironmentManager() {
  const { getToken } = useAuth();
  
  const [presets, setPresets] = useState<Record<string, EnvironmentPreset>>({});
  const [currentConfig, setCurrentConfig] = useState<EnvironmentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<Array<{type: 'error' | 'warning' | 'success' | 'info', message: string}>>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
    loadCurrentConfig();
  }, []);

  const loadPresets = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/presets', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPresets(data.presets);
      }
    } catch (error) {
      console.error('Failed to load presets:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to load environment presets'
      }]);
    }
  };

  const loadCurrentConfig = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentConfig(data);
      }
    } catch (error) {
      console.error('Failed to load current config:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to load current configuration'
      }]);
    }
  };

  const applyPreset = async (presetName: string) => {
    setLoading(true);
    setAlerts([]);
    
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/aws/presets/${presetName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAlerts([{
          type: 'success',
          message: `Applied ${presetName} environment preset successfully`
        }]);
        
        // Reload current config
        await loadCurrentConfig();
        setShowPresetModal(false);
      } else {
        const error = await response.json();
        setAlerts([{
          type: 'error',
          message: error.message || 'Failed to apply preset'
        }]);
      }
    } catch (error) {
      console.error('Failed to apply preset:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to apply environment preset'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const getEnvironmentStatus = () => {
    if (!currentConfig) return 'loading';
    if (currentConfig.completeness.complete) return 'success';
    return 'warning';
  };

  const getEnvironmentStatusText = () => {
    if (!currentConfig) return 'Loading...';
    if (currentConfig.completeness.complete) return 'Complete';
    return `Incomplete (${currentConfig.completeness.missing.length} missing)`;
  };

  const getCurrentEnvironmentType = () => {
    if (!currentConfig) return 'Unknown';
    
    const config = currentConfig.config;
    
    // Try to determine environment type from resource names
    if (config.DDB_INVESTIGATIONS_TABLE?.includes('-dev') || 
        config.ARTIFACTS_BUCKET?.includes('-dev')) {
      return 'Development';
    }
    if (config.DDB_INVESTIGATIONS_TABLE?.includes('-staging') || 
        config.ARTIFACTS_BUCKET?.includes('-staging')) {
      return 'Staging';
    }
    if (config.DDB_INVESTIGATIONS_TABLE?.includes('-prod') || 
        config.ARTIFACTS_BUCKET?.includes('-prod')) {
      return 'Production';
    }
    if (config.DDB_INVESTIGATIONS_TABLE?.includes('-hk') || 
        config.ARTIFACTS_BUCKET?.includes('-hk')) {
      return 'Hong Kong';
    }
    
    return 'Custom';
  };

  const configItems = currentConfig ? [
    {
      key: 'AWS_REGION',
      label: 'AWS Region',
      value: currentConfig.config.AWS_REGION || 'Not set'
    },
    {
      key: 'DDB_INVESTIGATIONS_TABLE',
      label: 'DynamoDB Investigations Table',
      value: currentConfig.config.DDB_INVESTIGATIONS_TABLE || 'Not set'
    },
    {
      key: 'DDB_METRICS_TABLE',
      label: 'DynamoDB Metrics Table',
      value: currentConfig.config.DDB_METRICS_TABLE || 'Not set'
    },
    {
      key: 'ARTIFACTS_BUCKET',
      label: 'S3 Artifacts Bucket',
      value: currentConfig.config.ARTIFACTS_BUCKET || 'Not set'
    },
    {
      key: 'AUDIT_BUCKET',
      label: 'S3 Audit Bucket',
      value: currentConfig.config.AUDIT_BUCKET || 'Not set'
    },
    {
      key: 'AI_PROVIDER',
      label: 'AI Provider',
      value: currentConfig.config.AI_PROVIDER || 'Not set'
    }
  ] : [];

  return (
    <SpaceBetween size="l">
      {/* Alerts */}
      {alerts.map((alert, index) => (
        <Alert
          key={index}
          type={alert.type}
          dismissible
          onDismiss={() => setAlerts(alerts.filter((_, i) => i !== index))}
        >
          {alert.message}
        </Alert>
      ))}

      {/* Current Environment Status */}
      <Container
        header={
          <Header 
            variant="h2"
            actions={
              <Button
                onClick={() => setShowPresetModal(true)}
                iconName="settings"
              >
                Switch Environment
              </Button>
            }
          >
            Current Environment
          </Header>
        }
      >
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Environment Type</Box>
            <Badge color="blue">{getCurrentEnvironmentType()}</Badge>
          </div>
          <div>
            <Box variant="awsui-key-label">Configuration Status</Box>
            <StatusIndicator type={getEnvironmentStatus()}>
              {getEnvironmentStatusText()}
            </StatusIndicator>
          </div>
          <div>
            <Box variant="awsui-key-label">Region</Box>
            <Box>{currentConfig?.config.AWS_REGION || 'Not configured'}</Box>
          </div>
        </ColumnLayout>

        {currentConfig && !currentConfig.completeness.complete && (
          <Alert type="warning">
            <strong>Configuration Incomplete</strong>
            <Box>Missing configuration: {currentConfig.completeness.missing.join(', ')}</Box>
          </Alert>
        )}
      </Container>

      {/* Configuration Details */}
      <Container
        header={<Header variant="h2">Configuration Details</Header>}
      >
        <Table
          items={configItems}
          columnDefinitions={[
            {
              id: 'label',
              header: 'Setting',
              cell: (item) => item.label
            },
            {
              id: 'value',
              header: 'Value',
              cell: (item) => (
                <Box color={item.value === 'Not set' ? 'text-status-error' : 'inherit'}>
                  {item.value}
                </Box>
              )
            }
          ]}
          trackBy="key"
          empty={
            <Box textAlign="center" color="inherit">
              <StatusIndicator type="loading">Loading configuration...</StatusIndicator>
            </Box>
          }
          wrapLines
        />
      </Container>

      {/* Environment Presets Modal */}
      <Modal
        visible={showPresetModal}
        onDismiss={() => setShowPresetModal(false)}
        header="Switch Environment"
        size="large"
      >
        <SpaceBetween size="m">
          <Box>
            Select an environment preset to quickly configure AWS resources for different deployment scenarios.
          </Box>

          <Alert type="warning">
            <strong>Warning:</strong> Switching environments will overwrite your current AWS configuration. 
            Make sure you have backed up any custom settings.
          </Alert>

          <Cards
            items={Object.entries(presets).map(([key, preset]) => ({
              key,
              ...preset
            }))}
            cardDefinition={{
              header: (item) => item.name,
              sections: [
                {
                  id: 'description',
                  content: (item) => item.description
                },
                {
                  id: 'region',
                  header: 'Region',
                  content: (item) => item.config.AWS_REGION
                },
                {
                  id: 'resources',
                  header: 'Sample Resources',
                  content: (item) => (
                    <SpaceBetween size="xs">
                      <Box fontSize="body-s">
                        Table: {item.config.DDB_INVESTIGATIONS_TABLE}
                      </Box>
                      <Box fontSize="body-s">
                        Bucket: {item.config.ARTIFACTS_BUCKET}
                      </Box>
                    </SpaceBetween>
                  )
                }
              ]
            }}
            cardsPerRow={[
              { cards: 1 },
              { minWidth: 500, cards: 2 }
            ]}
            selectionType="single"
            selectedItems={selectedPreset ? [{ key: selectedPreset }] : []}
            onSelectionChange={({ detail }) => 
              setSelectedPreset(detail.selectedItems[0]?.key || null)
            }
            trackBy="key"
          />

          <Box float="right">
            <SpaceBetween direction="horizontal" size="s">
              <Button onClick={() => setShowPresetModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => selectedPreset && applyPreset(selectedPreset)}
                disabled={!selectedPreset}
                loading={loading}
              >
                Apply Environment
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Modal>
    </SpaceBetween>
  );
}