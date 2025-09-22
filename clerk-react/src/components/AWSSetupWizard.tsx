import { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  FormField,
  Input,
  Button,
  Select,
  Box,
  Alert,
  Modal,
  CodeEditor,
  ProgressBar,
  Wizard,
  StatusIndicator,
  Badge,
  ExpandableSection
} from '@cloudscape-design/components';
import { useAuth } from '../hooks/useAuth';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  fields: Array<{
    name: string;
    type: string;
    label: string;
    required: boolean;
    options?: Array<{ value: string; label: string }>;
    dependsOn?: { field: string; value: string };
    placeholder?: string;
  }>;
}

interface StepValidation {
  valid: boolean;
  errors: Record<string, string>;
  warnings: string[];
  info?: any;
  remediation?: any;
}

export function AWSSetupWizard({ onComplete }: { onComplete?: () => void }) {
  const { getToken } = useAuth();
  
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepData, setStepData] = useState<Record<string, any>>({});
  const [stepValidations, setStepValidations] = useState<Record<string, StepValidation>>({});
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [setupResults, setSetupResults] = useState<any>(null);

  // Load setup steps on mount
  useEffect(() => {
    loadSetupSteps();
  }, []);

  const loadSetupSteps = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/setup/steps', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSteps(data.steps);
      }
    } catch (error) {
      console.error('Failed to load setup steps:', error);
    }
  };

  const validateStep = async (stepId: string, data: any) => {
    setLoading(true);
    
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/aws/setup/validate/${stepId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        const validation: StepValidation = await response.json();
        setStepValidations(prev => ({
          ...prev,
          [stepId]: validation
        }));
        return validation;
      }
    } catch (error) {
      console.error('Failed to validate step:', error);
    } finally {
      setLoading(false);
    }
    
    return { valid: false, errors: {}, warnings: [] };
  };

  const handleStepChange = (stepIndex: number) => {
    setCurrentStepIndex(stepIndex);
  };

  const handleFieldChange = (stepId: string, fieldName: string, value: any) => {
    setStepData(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        [fieldName]: value
      }
    }));
  };

  const handleNext = async () => {
    const currentStep = steps[currentStepIndex];
    const currentData = stepData[currentStep.id] || {};
    
    // Validate current step
    const validation = await validateStep(currentStep.id, currentData);
    
    if (validation.valid) {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1);
      } else {
        // Complete setup
        await completeSetup();
      }
    }
  };

  const completeSetup = async () => {
    setCompleting(true);
    
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/aws/setup/complete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(stepData)
      });
      
      if (response.ok) {
        const results = await response.json();
        setSetupResults(results);
        setShowResults(true);
        
        if (onComplete) {
          onComplete();
        }
      }
    } catch (error) {
      console.error('Failed to complete setup:', error);
    } finally {
      setCompleting(false);
    }
  };

  const renderField = (step: SetupStep, field: any) => {
    const stepId = step.id;
    const value = stepData[stepId]?.[field.name] || '';
    const error = stepValidations[stepId]?.errors[field.name];
    
    // Check if field should be shown based on dependencies
    if (field.dependsOn) {
      const dependentValue = stepData[stepId]?.[field.dependsOn.field];
      if (dependentValue !== field.dependsOn.value) {
        return null;
      }
    }

    switch (field.type) {
      case 'select':
        return (
          <FormField
            key={field.name}
            label={field.label}
            errorText={error}
          >
            <Select
              selectedOption={
                field.options?.find(opt => opt.value === value) || null
              }
              options={field.options || []}
              onChange={({ detail }) => 
                handleFieldChange(stepId, field.name, detail.selectedOption.value)
              }
              invalid={!!error}
            />
          </FormField>
        );
      
      case 'text':
      case 'number':
      default:
        return (
          <FormField
            key={field.name}
            label={field.label}
            errorText={error}
          >
            <Input
              value={value}
              onChange={({ detail }) => 
                handleFieldChange(stepId, field.name, detail.value)
              }
              type={field.type === 'number' ? 'number' : 'text'}
              placeholder={field.placeholder}
              invalid={!!error}
            />
          </FormField>
        );
    }
  };

  const renderStepContent = (step: SetupStep) => {
    const validation = stepValidations[step.id];
    
    return (
      <SpaceBetween size="m">
        <Box>
          <strong>{step.title}</strong>
          <Box variant="p" color="text-body-secondary">
            {step.description}
          </Box>
        </Box>

        {validation?.warnings && validation.warnings.length > 0 && (
          <Alert type="warning">
            <ul>
              {validation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Alert>
        )}

        {validation?.info && (
          <Alert type="success">
            <strong>Validation Successful</strong>
            {validation.info.account && (
              <Box>AWS Account: {validation.info.account}</Box>
            )}
            {validation.info.region && (
              <Box>Region: {validation.info.region}</Box>
            )}
          </Alert>
        )}

        {validation?.remediation && (
          <Alert type="error">
            <strong>{validation.remediation.title}</strong>
            <Box>
              <ul>
                {validation.remediation.steps.map((step: string, index: number) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </Box>
            
            {validation.remediation.iamPolicy && (
              <ExpandableSection headerText="Required IAM Policy">
                <CodeEditor
                  ace={undefined}
                  language="json"
                  value={JSON.stringify(validation.remediation.iamPolicy, null, 2)}
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
          </Alert>
        )}

        <SpaceBetween size="s">
          {step.fields.map(field => renderField(step, field))}
        </SpaceBetween>
      </SpaceBetween>
    );
  };

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStepIndex) {
      const step = steps[stepIndex];
      const validation = stepValidations[step.id];
      return validation?.valid ? 'success' : 'error';
    }
    if (stepIndex === currentStepIndex) {
      return 'in-progress';
    }
    return 'disabled';
  };

  if (steps.length === 0) {
    return (
      <Container>
        <Box textAlign="center">
          <StatusIndicator type="loading">Loading setup wizard...</StatusIndicator>
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      <Container
        header={<Header variant="h1">AWS Setup Wizard</Header>}
      >
        <Box>
          This wizard will guide you through configuring AWS services for NeoHarbour Security.
        </Box>
      </Container>

      <Container>
        <Wizard
          steps={steps.map((step, index) => ({
            title: step.title,
            description: step.description,
            content: renderStepContent(step),
            isOptional: !step.required
          }))}
          activeStepIndex={currentStepIndex}
          onNavigate={({ detail }) => handleStepChange(detail.requestedStepIndex)}
          onSubmit={handleNext}
          onCancel={() => {}}
          submitButtonText={
            currentStepIndex === steps.length - 1 ? 'Complete Setup' : 'Next'
          }
          isLoadingNextStep={loading || completing}
        />
      </Container>

      {/* Setup Results Modal */}
      <Modal
        visible={showResults}
        onDismiss={() => setShowResults(false)}
        header="Setup Complete"
        size="large"
      >
        {setupResults && (
          <SpaceBetween size="m">
            {setupResults.success ? (
              <Alert type="success">
                <strong>AWS configuration completed successfully!</strong>
                <Box>All services have been configured and validated.</Box>
              </Alert>
            ) : (
              <Alert type="error">
                <strong>Setup completed with issues</strong>
                <Box>Some services may require additional configuration.</Box>
              </Alert>
            )}

            {setupResults.validation && (
              <ExpandableSection headerText="Validation Results">
                <SpaceBetween size="s">
                  {Object.entries(setupResults.validation).map(([service, result]: [string, any]) => (
                    <Box key={service}>
                      <Badge color={result.success ? 'green' : 'red'}>
                        {service}: {result.success ? 'SUCCESS' : 'FAILED'}
                      </Badge>
                      {!result.success && result.message && (
                        <Box color="text-status-error">{result.message}</Box>
                      )}
                    </Box>
                  ))}
                </SpaceBetween>
              </ExpandableSection>
            )}

            {setupResults.iamPolicy && (
              <ExpandableSection headerText="Generated IAM Policy">
                <Box>
                  Use this IAM policy to grant the necessary permissions:
                </Box>
                <CodeEditor
                  ace={undefined}
                  language="json"
                  value={JSON.stringify(setupResults.iamPolicy, null, 2)}
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

            <Box float="right">
              <Button 
                variant="primary"
                onClick={() => setShowResults(false)}
              >
                Close
              </Button>
            </Box>
          </SpaceBetween>
        )}
      </Modal>
    </SpaceBetween>
  );
}