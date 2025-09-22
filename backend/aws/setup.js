const { AWSValidator } = require('./validator');
const { EnvironmentManager } = require('./environment');

class SetupWizard {
  constructor() {
    this.envManager = new EnvironmentManager();
  }

  /**
   * Get setup wizard steps
   */
  getSetupSteps() {
    return [
      {
        id: 'credentials',
        title: 'AWS Credentials',
        description: 'Configure AWS access credentials',
        required: true,
        fields: [
          {
            name: 'credentialMethod',
            type: 'select',
            label: 'Credential Method',
            required: true,
            options: [
              { value: 'profile', label: 'AWS Profile' },
              { value: 'environment', label: 'Environment Variables' },
              { value: 'iam_role', label: 'IAM Role (EC2/ECS/Lambda)' }
            ]
          },
          {
            name: 'awsProfile',
            type: 'text',
            label: 'AWS Profile Name',
            required: false,
            dependsOn: { field: 'credentialMethod', value: 'profile' },
            placeholder: 'default'
          },
          {
            name: 'awsRegion',
            type: 'select',
            label: 'AWS Region',
            required: true,
            options: [
              { value: 'us-east-1', label: 'US East (N. Virginia)' },
              { value: 'us-west-2', label: 'US West (Oregon)' },
              { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
              { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
              { value: 'eu-west-1', label: 'Europe (Ireland)' }
            ]
          }
        ]
      },
      {
        id: 'resources',
        title: 'AWS Resources',
        description: 'Configure DynamoDB tables and S3 buckets',
        required: true,
        fields: [
          {
            name: 'dynamodbTable',
            type: 'text',
            label: 'DynamoDB Investigations Table',
            required: true,
            placeholder: 'AsiaAgenticSocInvestigations-dev'
          },
          {
            name: 'metricsTable',
            type: 'text',
            label: 'DynamoDB Metrics Table',
            required: true,
            placeholder: 'AsiaAgenticSocMetrics-dev'
          },
          {
            name: 'artifactsBucket',
            type: 'text',
            label: 'S3 Artifacts Bucket',
            required: true,
            placeholder: 'asia-agentic-soc-artifacts-dev'
          },
          {
            name: 'auditBucket',
            type: 'text',
            label: 'S3 Audit Bucket',
            required: true,
            placeholder: 'asia-agentic-soc-audit-dev'
          }
        ]
      },
      {
        id: 'ai',
        title: 'AI Configuration',
        description: 'Configure AI provider settings',
        required: true,
        fields: [
          {
            name: 'aiProvider',
            type: 'select',
            label: 'AI Provider',
            required: true,
            options: [
              { value: 'bedrock', label: 'Amazon Bedrock' },
              { value: 'kiro', label: 'Kiro' },
              { value: 'amazonq', label: 'Amazon Q' }
            ]
          },
          {
            name: 'bedrockRegion',
            type: 'select',
            label: 'Bedrock Region',
            required: false,
            dependsOn: { field: 'aiProvider', value: 'bedrock' },
            options: [
              { value: 'us-east-1', label: 'US East (N. Virginia)' },
              { value: 'us-west-2', label: 'US West (Oregon)' },
              { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' }
            ]
          },
          {
            name: 'textModel',
            type: 'select',
            label: 'Text Model',
            required: false,
            dependsOn: { field: 'aiProvider', value: 'bedrock' },
            options: [
              { value: 'anthropic.claude-3-haiku-20240307-v1:0', label: 'Claude 3 Haiku' },
              { value: 'anthropic.claude-3-sonnet-20240229-v1:0', label: 'Claude 3 Sonnet' }
            ]
          }
        ]
      },
      {
        id: 'optional',
        title: 'Optional Services',
        description: 'Configure optional AWS services',
        required: false,
        fields: [
          {
            name: 'kmsKeyId',
            type: 'text',
            label: 'KMS Key ID (optional)',
            required: false,
            placeholder: 'arn:aws:kms:region:account:key/key-id'
          },
          {
            name: 'stateMachineArn',
            type: 'text',
            label: 'Step Functions State Machine ARN (optional)',
            required: false,
            placeholder: 'arn:aws:states:region:account:stateMachine:name'
          },
          {
            name: 'eventBusName',
            type: 'text',
            label: 'EventBridge Bus Name (optional)',
            required: false,
            placeholder: 'default'
          }
        ]
      }
    ];
  }

  /**
   * Validate setup step
   */
  async validateStep(stepId, data) {
    const steps = this.getSetupSteps();
    const step = steps.find(s => s.id === stepId);
    
    if (!step) {
      throw new Error(`Unknown setup step: ${stepId}`);
    }

    const errors = {};
    
    // Validate required fields
    for (const field of step.fields) {
      if (field.required && !data[field.name]) {
        errors[field.name] = `${field.label} is required`;
      }
      
      // Check dependencies
      if (field.dependsOn && data[field.dependsOn.field] === field.dependsOn.value) {
        if (field.required && !data[field.name]) {
          errors[field.name] = `${field.label} is required when ${field.dependsOn.field} is ${field.dependsOn.value}`;
        }
      }
    }

    // Step-specific validation
    if (stepId === 'credentials' && Object.keys(errors).length === 0) {
      return await this.validateCredentialsStep(data);
    }
    
    if (stepId === 'resources' && Object.keys(errors).length === 0) {
      return await this.validateResourcesStep(data);
    }
    
    if (stepId === 'ai' && Object.keys(errors).length === 0) {
      return await this.validateAIStep(data);
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Validate credentials step
   */
  async validateCredentialsStep(data) {
    const validator = new AWSValidator({
      region: data.awsRegion
    });
    
    // Set AWS profile if specified
    if (data.credentialMethod === 'profile' && data.awsProfile) {
      process.env.AWS_PROFILE = data.awsProfile;
    }
    
    const result = await validator.validateCredentials();
    
    if (result.success) {
      return {
        valid: true,
        errors: {},
        warnings: [],
        info: {
          account: result.identity.account,
          arn: result.identity.arn,
          region: data.awsRegion
        }
      };
    } else {
      return {
        valid: false,
        errors: {
          credentials: result.message
        },
        warnings: [],
        remediation: result.remediation
      };
    }
  }

  /**
   * Validate resources step
   */
  async validateResourcesStep(data) {
    const validator = new AWSValidator();
    const errors = {};
    const warnings = [];
    const info = {};

    // Validate DynamoDB table
    if (data.dynamodbTable) {
      const dynamoResult = await validator.validateDynamoDB(data.dynamodbTable);
      if (!dynamoResult.success) {
        errors.dynamodbTable = dynamoResult.message;
      } else {
        info.dynamodb = dynamoResult.table;
        if (dynamoResult.table.encryption === 'DISABLED') {
          warnings.push('DynamoDB table encryption is not enabled');
        }
      }
    }

    // Validate S3 buckets
    if (data.artifactsBucket) {
      const s3Result = await validator.validateS3Bucket(data.artifactsBucket);
      if (!s3Result.success) {
        errors.artifactsBucket = s3Result.message;
      } else {
        info.artifactsBucket = s3Result.bucket;
        if (s3Result.bucket.encryption === 'DISABLED') {
          warnings.push('S3 artifacts bucket encryption is not enabled');
        }
      }
    }

    if (data.auditBucket) {
      const s3Result = await validator.validateS3Bucket(data.auditBucket);
      if (!s3Result.success) {
        errors.auditBucket = s3Result.message;
      } else {
        info.auditBucket = s3Result.bucket;
        if (s3Result.bucket.encryption === 'DISABLED') {
          warnings.push('S3 audit bucket encryption is not enabled');
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      warnings,
      info
    };
  }

  /**
   * Validate AI step
   */
  async validateAIStep(data) {
    const errors = {};
    const warnings = [];
    const info = {};

    if (data.aiProvider === 'bedrock') {
      const validator = new AWSValidator({
        region: data.bedrockRegion || data.awsRegion
      });
      
      const bedrockResult = await validator.validateBedrock();
      if (!bedrockResult.success) {
        errors.aiProvider = bedrockResult.message;
      } else {
        info.bedrock = bedrockResult.bedrock;
        if (bedrockResult.bedrock.claudeModels === 0) {
          warnings.push('No Claude models available in this region');
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      warnings,
      info
    };
  }

  /**
   * Complete setup wizard
   */
  async completeSetup(allData) {
    // Combine all step data
    const config = {
      AWS_REGION: allData.credentials?.awsRegion,
      AWS_DEFAULT_REGION: allData.credentials?.awsRegion,
      DDB_INVESTIGATIONS_TABLE: allData.resources?.dynamodbTable,
      DDB_METRICS_TABLE: allData.resources?.metricsTable,
      ARTIFACTS_BUCKET: allData.resources?.artifactsBucket,
      AUDIT_BUCKET: allData.resources?.auditBucket,
      AI_PROVIDER: allData.ai?.aiProvider,
      DEFAULT_TENANT_ID: 'demo-tenant'
    };

    // Add optional fields
    if (allData.credentials?.awsProfile) {
      config.AWS_PROFILE = allData.credentials.awsProfile;
    }
    
    if (allData.ai?.bedrockRegion) {
      config.BEDROCK_REGION = allData.ai.bedrockRegion;
    }
    
    if (allData.ai?.textModel) {
      config.BEDROCK_TEXT_MODEL = allData.ai.textModel;
    }
    
    if (allData.optional?.kmsKeyId) {
      config.KMS_KEY_ID = allData.optional.kmsKeyId;
    }
    
    if (allData.optional?.stateMachineArn) {
      config.STATE_MACHINE_ARN = allData.optional.stateMachineArn;
    }
    
    if (allData.optional?.eventBusName) {
      config.EVENT_BUS_NAME = allData.optional.eventBusName;
    }

    // Update environment configuration
    await this.envManager.updateConfig(config);
    
    // Validate the complete configuration
    const validation = await this.envManager.validateEnvironment();
    
    return {
      success: validation.overall.success,
      config,
      validation,
      iamPolicy: await this.envManager.generateIAMPolicy()
    };
  }

  /**
   * Get deployment instructions
   */
  getDeploymentInstructions() {
    return {
      sam: {
        title: 'Deploy with AWS SAM',
        steps: [
          'Install AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html',
          'Build the application: sam build',
          'Deploy: sam deploy --guided',
          'Follow the prompts to configure stack parameters'
        ],
        commands: [
          'sam build',
          'sam deploy --guided'
        ]
      },
      manual: {
        title: 'Manual Resource Creation',
        steps: [
          'Create DynamoDB tables with the configured names',
          'Create S3 buckets with the configured names',
          'Enable encryption on all resources',
          'Configure IAM permissions using the generated policy'
        ]
      }
    };
  }
}

module.exports = { SetupWizard };