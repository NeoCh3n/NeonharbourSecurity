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
  Box,
  StatusIndicator,
  Table,
  Badge
} from '@cloudscape-design/components';

interface AWSService {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  region: string;
  lastChecked: string;
}

export function AWSServiceConfig() {
  const [config, setConfig] = useState({
    region: 'ap-southeast-1',
    accessKeyId: '',
    secretAccessKey: '',
    dynamodbTable: 'AsiaAgenticSocInvestigations',
    s3ArtifactsBucket: 'asia-agentic-soc-artifacts',
    s3AuditBucket: 'asia-agentic-soc-audit',
    kmsKeyId: '',
    enableEncryption: true
  });

  const [services] = useState<AWSService[]>([
    {
      id: '1',
      name: 'DynamoDB',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '2 minutes ago'
    },
    {
      id: '2',
      name: 'S3 (Artifacts)',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '1 minute ago'
    },
    {
      id: '3',
      name: 'S3 (Audit)',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '1 minute ago'
    },
    {
      id: '4',
      name: 'Lambda',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '3 minutes ago'
    },
    {
      id: '5',
      name: 'Step Functions',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '2 minutes ago'
    },
    {
      id: '6',
      name: 'EventBridge',
      status: 'connected',
      region: 'ap-southeast-1',
      lastChecked: '1 minute ago'
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 2000));
    setTesting(false);
  };

  const getStatusType = (status: string) => {
    switch (status) {
      case 'connected': return 'success';
      case 'disconnected': return 'warning';
      case 'error': return 'error';
      default: return 'info';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'green';
      case 'disconnected': return 'yellow';
      case 'error': return 'red';
      default: return 'grey';
    }
  };

  return (
    <SpaceBetween size="l">
      <Container
        header={<Header variant="h2">AWS Configuration</Header>}
      >
        <SpaceBetween size="m">
          <FormField label="AWS Region">
            <Select
              selectedOption={{ label: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' }}
              options={[
                { label: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
                { label: 'Asia Pacific (Hong Kong)', value: 'ap-east-1' },
                { label: 'US East (N. Virginia)', value: 'us-east-1' },
                { label: 'US West (Oregon)', value: 'us-west-2' }
              ]}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, region: detail.selectedOption.value || 'ap-southeast-1' }))
              }
            />
          </FormField>

          <FormField label="DynamoDB Table Name">
            <Input
              value={config.dynamodbTable}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, dynamodbTable: detail.value }))
              }
            />
          </FormField>

          <FormField label="S3 Artifacts Bucket">
            <Input
              value={config.s3ArtifactsBucket}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, s3ArtifactsBucket: detail.value }))
              }
            />
          </FormField>

          <FormField label="S3 Audit Bucket">
            <Input
              value={config.s3AuditBucket}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, s3AuditBucket: detail.value }))
              }
            />
          </FormField>

          <FormField label="KMS Key ID (optional)">
            <Input
              value={config.kmsKeyId}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, kmsKeyId: detail.value }))
              }
              placeholder="arn:aws:kms:region:account:key/key-id"
            />
          </FormField>

          <FormField label="Encryption">
            <Toggle
              checked={config.enableEncryption}
              onChange={({ detail }) => 
                setConfig(prev => ({ ...prev, enableEncryption: detail.checked }))
              }
            >
              Enable encryption at rest
            </Toggle>
          </FormField>

          <SpaceBetween direction="horizontal" size="s">
            <Button
              onClick={handleTestConnection}
              loading={testing}
            >
              Test Connection
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={loading}
            >
              Save Configuration
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </Container>

      <Container
        header={<Header variant="h2">Service Status</Header>}
      >
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
                <Badge color={getStatusColor(item.status)}>
                  {item.status.toUpperCase()}
                </Badge>
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
            }
          ]}
          trackBy="id"
          empty={<Box padding="s">No services configured</Box>}
          wrapLines
        />
      </Container>
    </SpaceBetween>
  );
}