import { useState } from 'react';
import {
  Container,
  Header,
  // Box,
  SpaceBetween,
  FormField,
  Input,
  Button,
  StatusIndicator,
  Alert
} from '@cloudscape-design/components';

export function AuthConfig() {
  const [clerkKey, setClerkKey] = useState(
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''
  );
  const [apiUrl, setApiUrl] = useState(
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
  );
  const [demoToken, setDemoToken] = useState(
    import.meta.env.VITE_DEMO_AUTH_TOKEN || 'change-me'
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const testConfiguration = async () => {
    setIsLoading(true);
    setTestResult(null);
    
    try {
      // Test API connectivity
      const response = await fetch(`${apiUrl}/healthz`);
      if (response.ok) {
        setTestResult('Configuration test successful');
      } else {
        setTestResult(`API test failed: ${response.status}`);
      }
    } catch (error) {
      setTestResult(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container 
      header={
        <Header 
          variant="h3"
          actions={
            <Button 
              onClick={testConfiguration}
              loading={isLoading}
              disabled={isLoading}
            >
              Test Configuration
            </Button>
          }
        >
          Authentication Configuration
        </Header>
      }
    >
      <SpaceBetween size="m">
        <Alert type="info">
          These are the current environment variables used for authentication.
          Changes here are for display only and don't modify the actual configuration.
        </Alert>
        
        <FormField label="Clerk Publishable Key">
          <Input
            value={clerkKey}
            onChange={({ detail }) => setClerkKey(detail.value)}
            placeholder="pk_test_..."
            type="password"
          />
        </FormField>
        
        <FormField label="API Base URL">
          <Input
            value={apiUrl}
            onChange={({ detail }) => setApiUrl(detail.value)}
            placeholder="http://localhost:4000"
          />
        </FormField>
        
        <FormField label="Demo Auth Token">
          <Input
            value={demoToken}
            onChange={({ detail }) => setDemoToken(detail.value)}
            placeholder="change-me"
            type="password"
          />
        </FormField>
        
        {testResult && (
          <StatusIndicator 
            type={testResult.includes('successful') ? 'success' : 'error'}
          >
            {testResult}
          </StatusIndicator>
        )}
      </SpaceBetween>
    </Container>
  );
}