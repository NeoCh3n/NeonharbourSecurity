import { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  FormField,
  Input,
  Button,
  Toggle,
  Select,
  Box,
  StatusIndicator,
  Table,
  Badge,
  Alert,
  Modal,
  CodeEditor,
  ExpandableSection,
  Spinner
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';

interface AWSService {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'loading';
  region: string;
  lastChecked: string;
  error?: string;
  remediation?: {
    title: string;
    steps: string[];
    iamPolicy?: any;
    documentation?: string;
  };
}

interface ValidationResult {
  overall: { success: boolean; errors: string[] };
  credentials?: any;
  dynamodb?: any;
  s3Artifacts?: any;
  s3Audit?: any;
  bedrock?: any;
  stepFunctions?: any;
  eventBridge?: any;
}

export function AWSServiceConfig() {
  const { getToken } = useAuth();
  
  const [config, setConfig] = useState({
    AWS_REGION: 'us-east-1',
    DDB_INVESTIGATIONS_TABLE: '',
    DDB_METRICS_TABLE: '',
    ARTIFACTS_BUCKET: '',
    AUDIT_BUCKET: '',
    KMS_KEY_ID: '',
    STATE_MACHINE_ARN: '',
    EVENT_BUS_NAME: '',
    AI_PROVIDER: 'bedrock'
  });

  const [services, setServices] = useState<AWSService[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [alerts, setAlerts] = useState<Array<{type: 'error' | 'warning' | 'success' | 'info', message: string}>>([]);
  const [showIAMPolicy, setShowIAMPolicy] = useState(false);
  const [iamPolicy, setIamPolicy] = useState<any>(null);
  const [selectedRemediation, setSelectedRemediation] = useState<AWSService | null>(null);

  // Load current configuration on mount
  useEffect(() => {
    loadCurrentConfig();
  }, []);

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
        setConfig(data.config);
        
        if (!data.completeness.complete) {
          setAlerts([{
            type: 'warning',
            message: `Configuration incomplete. Missing: ${data.completeness.missing.join(', ')}`
          }]);
        }
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to load AWS configuration'
      }]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setAlerts([]);
    
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        setAlerts([{
          type: 'success',
          message: 'AWS configuration saved successfully'
        }]);
        
        // Automatically test connection after save
        await handleTestConnection();
      } else {
        const error = await response.json();
        setAlerts([{
          type: 'error',
          message: error.message || 'Failed to save configuration'
        }]);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to save AWS configuration'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setAlerts([]);
    
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/validate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config })
      });
      
      if (response.ok) {
        const result: ValidationResult = await response.json();
        setValidationResult(result);
        
        // Update services status based on validation
        const updatedServices: AWSService[] = [
          {
            id: 'credentials',
            name: 'AWS Credentials',
            status: result.credentials?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.credentials?.success ? undefined : result.credentials?.message,
            remediation: result.credentials?.remediation
          },
          {
            id: 'dynamodb',
            name: 'DynamoDB',
            status: result.dynamodb?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.dynamodb?.success ? undefined : result.dynamodb?.message,
            remediation: result.dynamodb?.remediation
          },
          {
            id: 's3-artifacts',
            name: 'S3 (Artifacts)',
            status: result.s3Artifacts?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.s3Artifacts?.success ? undefined : result.s3Artifacts?.message,
            remediation: result.s3Artifacts?.remediation
          },
          {
            id: 's3-audit',
            name: 'S3 (Audit)',
            status: result.s3Audit?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.s3Audit?.success ? undefined : result.s3Audit?.message,
            remediation: result.s3Audit?.remediation
          },
          {
            id: 'bedrock',
            name: 'Amazon Bedrock',
            status: result.bedrock?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.bedrock?.success ? undefined : result.bedrock?.message,
            remediation: result.bedrock?.remediation
          },
          {
            id: 'stepfunctions',
            name: 'Step Functions',
            status: result.stepFunctions?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.stepFunctions?.success ? undefined : result.stepFunctions?.message,
            remediation: result.stepFunctions?.remediation
          },
          {
            id: 'eventbridge',
            name: 'EventBridge',
            status: result.eventBridge?.success ? 'connected' : 'error',
            region: config.AWS_REGION,
            lastChecked: 'Just now',
            error: result.eventBridge?.success ? undefined : result.eventBridge?.message,
            remediation: result.eventBridge?.remediation
          }
        ];
        
        setServices(updatedServices);
        
        if (result.overall.success) {
          setAlerts([{
            type: 'success',
            message: 'All AWS services validated successfully'
          }]);
        } else {
          setAlerts([{
            type: 'error',
            message: `Validation failed: ${result.overall.errors.join(', ')}`
          }]);
        }
      } else {
        const error = await response.json();
        setAlerts([{
          type: 'error',
          message: error.message || 'Failed to validate AWS services'
        }]);
      }
    } catch (error) {
      console.error('Failed to validate services:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to validate AWS services'
      }]);
    } finally {
      setTesting(false);
    }
  };

  const generateIAMPolicy = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/iam-policy', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setIamPolicy(data.policy);
        setShowIAMPolicy(true);
      }
    } catch (error) {
      console.error('Failed to generate IAM policy:', error);
      setAlerts([{
        type: 'error',
        message: 'Failed to generate IAM policy'
      }]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'green';
      case 'disconnected': return 'blue';
      case 'error': return 'red';
      case 'loading': return 'grey';
      default: return 'grey';
    }
  };

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

      <Container
        header={
          <Header 
            variant="h2"
            actions={
              <SpaceBetween direction="horizontal" size="s">
                <Button onClick={generateIAMPolicy}>
                  Generate IAM Policy
                </Button>
                <Button
                  onClick={handleTestConnection}
                  loading={testing}
                  iconName="refresh"
                >
                  Test All Services
                </Button>
              </SpaceBetween>
            }
          >
            AWS Configuration
          </Header>
        }
      >
        <SpaceBetween size="m">
          <FormField label="AWS Region">
            <Select
              selectedOption={{ 
                label: config.AWS_REGION === 'us-east-1' ? 'US East (N. Virginia)' :
                       config.AWS_REGION === 'us-west-2' ? 'US West (Oregon)' :
                       config.AWS_REGION === 'ap-southeast-1' ? 'Asia Pacific (Singapore)' :
                       config.AWS_REGION === 'ap-east-1' ? 'Asia Pacific (Hong Kong)' : 'Custom',
                value: config.AWS_REGION 
              }}
              options={[
                { label: 'US East (N. Virginia)', value: 'us-east-1' },
                { label: 'US West (Oregon)', value: 'us-west-2' },
                { label: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
                { label: 'Asia Pacific (Hong Kong)', value: 'ap-east-1' }
              ]}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, AWS_REGION: detail.selectedOption.value || 'us-east-1' }))
              }
            />
          </FormField>

          <FormField label="DynamoDB Investigations Table">
            <Input
              value={config.DDB_INVESTIGATIONS_TABLE}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, DDB_INVESTIGATIONS_TABLE: detail.value }))
              }
              placeholder="AsiaAgenticSocInvestigations-dev"
            />
          </FormField>

          <FormField label="DynamoDB Metrics Table">
            <Input
              value={config.DDB_METRICS_TABLE}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, DDB_METRICS_TABLE: detail.value }))
              }
              placeholder="AsiaAgenticSocMetrics-dev"
            />
          </FormField>

          <FormField label="S3 Artifacts Bucket">
            <Input
              value={config.ARTIFACTS_BUCKET}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, ARTIFACTS_BUCKET: detail.value }))
              }
              placeholder="asia-agentic-soc-artifacts-dev"
            />
          </FormField>

          <FormField label="S3 Audit Bucket">
            <Input
              value={config.AUDIT_BUCKET}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, AUDIT_BUCKET: detail.value }))
              }
              placeholder="asia-agentic-soc-audit-dev"
            />
          </FormField>

          <ExpandableSection headerText="Optional Configuration">
            <SpaceBetween size="m">
              <FormField label="KMS Key ID (optional)">
                <Input
                  value={config.KMS_KEY_ID}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, KMS_KEY_ID: detail.value }))
                  }
                  placeholder="arn:aws:kms:region:account:key/key-id"
                />
              </FormField>

              <FormField label="Step Functions State Machine ARN (optional)">
                <Input
                  value={config.STATE_MACHINE_ARN}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, STATE_MACHINE_ARN: detail.value }))
                  }
                  placeholder="arn:aws:states:region:account:stateMachine:name"
                />
              </FormField>

              <FormField label="EventBridge Bus Name (optional)">
                <Input
                  value={config.EVENT_BUS_NAME}
                  onChange={({ detail }) => 
                    setConfig(prev => ({ ...prev, EVENT_BUS_NAME: detail.value }))
                  }
                  placeholder="default"
                />
              </FormField>
            </SpaceBetween>
          </ExpandableSection>

          <Box float="right">
            <SpaceBetween direction="horizontal" size="s">
              <Button
                onClick={handleSave}
                loading={loading}
                variant="primary"
              >
                Save Configuration
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </Container>

      <Container
        header={<Header variant="h2">Service Status</Header>}
      >
        {testing && (
          <Box>
            <Spinner /> Testing AWS service connections...
          </Box>
        )}
        
        <Table
          items={services}
          columnDefinitions={[
            {
              id: 'name',
              header: 'Service',
              cell: (item) => item.name
            },
            {
              id: 'status',
              header: 'Status',
              cell: (item) => (
                <StatusIndicator type={
                  item.status === 'connected' ? 'success' :
                  item.status === 'error' ? 'error' :
                  item.status === 'loading' ? 'loading' : 'warning'
                }>
                  {item.status.toUpperCase()}
                </StatusIndicator>
              )
            },
            {
              id: 'region',
              header: 'Region',
              cell: (item) => item.region
            },
            {
              id: 'lastChecked',
              header: 'Last Checked',
              cell: (item) => item.lastChecked
            },
            {
              id: 'actions',
              header: 'Actions',
              cell: (item) => (
                item.status === 'error' && item.remediation ? (
                  <Button
                    variant="link"
                    onClick={() => setSelectedRemediation(item)}
                  >
                    View Fix
                  </Button>
                ) : null
              )
            }
          ]}
          trackBy="id"
          empty={
            <Box textAlign="center" color="inherit">
              <b>No services tested</b>
              <Box variant="p" color="inherit">
                Click "Test All Services" to validate your AWS configuration.
              </Box>
            </Box>
          }
          wrapLines
        />
      </Container>

      {/* IAM Policy Modal */}
      <Modal
        visible={showIAMPolicy}
        onDismiss={() => setShowIAMPolicy(false)}
        header="Required IAM Policy"
        size="large"
      >
        <SpaceBetween size="m">
          <Box>
            Copy this IAM policy and attach it to your AWS user or role to grant the necessary permissions.
          </Box>
          
          {iamPolicy && (
            <CodeEditor
              ace={undefined}
              language="json"
              value={JSON.stringify(iamPolicy, null, 2)}
              preferences={{
                wrapLines: true,
                showLineNumbers: true,
                showGutter: true
              }}
              loading={false}
              readOnly
            />
          )}
          
          <Box float="right">
            <Button onClick={() => setShowIAMPolicy(false)}>
              Close
            </Button>
          </Box>
        </SpaceBetween>
      </Modal>

      {/* Remediation Modal */}
      <Modal
        visible={!!selectedRemediation}
        onDismiss={() => setSelectedRemediation(null)}
        header={selectedRemediation?.remediation?.title || 'Error Details'}
        size="medium"
      >
        {selectedRemediation && (
          <SpaceBetween size="m">
            <Alert type="error">
              <strong>Service:</strong> {selectedRemediation.name}<br/>
              <strong>Error:</strong> {selectedRemediation.error}
            </Alert>
            
            {selectedRemediation.remediation && (
              <>
                <Box>
                  <strong>Remediation Steps:</strong>
                </Box>
                <Box>
                  <ul>
                    {selectedRemediation.remediation.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </Box>
                
                {selectedRemediation.remediation.iamPolicy && (
                  <ExpandableSection headerText="Required IAM Policy">
                    <CodeEditor
                      ace={undefined}
                      language="json"
                      value={JSON.stringify(selectedRemediation.remediation.iamPolicy, null, 2)}
                      preferences={{
                        wrapLines: true,
                        showLineNumbers: true,
                        showGutter: true
                      }}
                      loading={false}
                      readOnly
                    />
                  </ExpandableSection>
                )}
                
                {selectedRemediation.remediation.documentation && (
                  <Box>
                    <strong>Documentation:</strong>{' '}
                    <a 
                      href={selectedRemediation.remediation.documentation} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      {selectedRemediation.remediation.documentation}
                    </a>
                  </Box>
                )}
              </>
            )}
            
            <Box float="right">
              <Button onClick={() => setSelectedRemediation(null)}>
                Close
              </Button>
            </Box>
          </SpaceBetween>
        )}
      </Modal>
    </SpaceBetween>
  );
}