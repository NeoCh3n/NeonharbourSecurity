const fs = require('fs').promises;
const path = require('path');
const { AWSValidator } = require('./validator');

class EnvironmentManager {
  constructor() {
    // Look for .env file in the project root (parent directory of backend)
    const projectRoot = path.resolve(__dirname, '..', '..');
    this.configPath = path.join(projectRoot, '.env');
    this.examplePath = path.join(projectRoot, '.env.example');
  }

  /**
   * Get current environment configuration
   */
  async getCurrentConfig() {
    try {
      const envContent = await fs.readFile(this.configPath, 'utf8');
      return this.parseEnvFile(envContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {}; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Get example configuration template
   */
  async getExampleConfig() {
    try {
      const exampleContent = await fs.readFile(this.examplePath, 'utf8');
      return this.parseEnvFile(exampleContent);
    } catch (error) {
      return {}; // Example file doesn't exist
    }
  }

  /**
   * Parse .env file content into key-value pairs
   */
  parseEnvFile(content) {
    const config = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          config[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
    
    return config;
  }

  /**
   * Update environment configuration
   */
  async updateConfig(updates) {
    const currentConfig = await this.getCurrentConfig();
    const newConfig = { ...currentConfig, ...updates };
    
    // Generate new .env content
    const envLines = [];
    
    // Add header
    envLines.push('############################################################');
    envLines.push('# NeoHarbour Security - Environment Configuration');
    envLines.push('# Updated: ' + new Date().toISOString());
    envLines.push('############################################################');
    envLines.push('');
    
    // AWS Configuration
    envLines.push('# AWS Configuration');
    envLines.push(`AWS_REGION=${newConfig.AWS_REGION || 'ap-southeast-1'}`);
    envLines.push(`AWS_DEFAULT_REGION=${newConfig.AWS_DEFAULT_REGION || newConfig.AWS_REGION || 'ap-southeast-1'}`);
    envLines.push(`BEDROCK_REGION=${newConfig.BEDROCK_REGION || newConfig.AWS_REGION || 'ap-southeast-1'}`);
    if (newConfig.AWS_PROFILE) {
      envLines.push(`AWS_PROFILE=${newConfig.AWS_PROFILE}`);
    }
    envLines.push('AWS_SDK_LOAD_CONFIG=1');
    envLines.push('');
    
    // AWS Resources
    envLines.push('# AWS Resources');
    envLines.push(`DDB_INVESTIGATIONS_TABLE=${newConfig.DDB_INVESTIGATIONS_TABLE || 'AsiaAgenticSocInvestigations-dev'}`);
    envLines.push(`DDB_METRICS_TABLE=${newConfig.DDB_METRICS_TABLE || 'AsiaAgenticSocMetrics-dev'}`);
    envLines.push(`ARTIFACTS_BUCKET=${newConfig.ARTIFACTS_BUCKET || 'asia-agentic-soc-artifacts-dev'}`);
    envLines.push(`AUDIT_BUCKET=${newConfig.AUDIT_BUCKET || 'asia-agentic-soc-audit-dev'}`);
    if (newConfig.KMS_KEY_ID) {
      envLines.push(`KMS_KEY_ID=${newConfig.KMS_KEY_ID}`);
    }
    if (newConfig.STATE_MACHINE_ARN) {
      envLines.push(`STATE_MACHINE_ARN=${newConfig.STATE_MACHINE_ARN}`);
    }
    if (newConfig.EVENT_BUS_NAME) {
      envLines.push(`EVENT_BUS_NAME=${newConfig.EVENT_BUS_NAME}`);
    }
    envLines.push('');
    
    // AI Provider
    envLines.push('# AI Provider');
    envLines.push(`AI_PROVIDER=${newConfig.AI_PROVIDER || 'bedrock'}`);
    if (newConfig.BEDROCK_TEXT_MODEL) {
      envLines.push(`BEDROCK_TEXT_MODEL=${newConfig.BEDROCK_TEXT_MODEL}`);
    }
    if (newConfig.BEDROCK_EMBED_MODEL) {
      envLines.push(`BEDROCK_EMBED_MODEL=${newConfig.BEDROCK_EMBED_MODEL}`);
    }
    envLines.push('');
    
    // Demo Configuration
    envLines.push('# Demo Configuration');
    envLines.push(`DEFAULT_TENANT_ID=${newConfig.DEFAULT_TENANT_ID || 'demo-tenant'}`);
    envLines.push('');
    
    // Preserve other existing configuration
    const preserveKeys = [
      'JWT_SECRET', 'DATABASE_URL', 'ENABLE_RLS',
      'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
      'VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY',
      'SPLUNK_BASE_URL', 'SPLUNK_SEARCH',
      'PUBLIC_BASE_URL', 'FRONTEND_BASE_URL'
    ];
    
    const otherConfig = {};
    for (const key of preserveKeys) {
      if (newConfig[key]) {
        otherConfig[key] = newConfig[key];
      }
    }
    
    if (Object.keys(otherConfig).length > 0) {
      envLines.push('# Other Configuration');
      for (const [key, value] of Object.entries(otherConfig)) {
        envLines.push(`${key}=${value}`);
      }
    }
    
    const envContent = envLines.join('\n') + '\n';
    await fs.writeFile(this.configPath, envContent, 'utf8');
    
    return newConfig;
  }

  /**
   * Validate current environment configuration
   */
  async validateEnvironment() {
    const config = await this.getCurrentConfig();
    const validator = new AWSValidator({
      region: config.AWS_REGION || config.AWS_DEFAULT_REGION
    });
    
    const validationConfig = {
      dynamodbTable: config.DDB_INVESTIGATIONS_TABLE,
      s3ArtifactsBucket: config.ARTIFACTS_BUCKET,
      s3AuditBucket: config.AUDIT_BUCKET,
      stateMachineArn: config.STATE_MACHINE_ARN,
      eventBusName: config.EVENT_BUS_NAME || 'default'
    };
    
    return await validator.validateAllServices(validationConfig);
  }

  /**
   * Get environment presets for different deployment scenarios
   */
  getEnvironmentPresets() {
    return {
      development: {
        name: 'Development',
        description: 'Local development environment with demo data',
        config: {
          AWS_REGION: 'us-east-1',
          DDB_INVESTIGATIONS_TABLE: 'AsiaAgenticSocInvestigations-dev',
          DDB_METRICS_TABLE: 'AsiaAgenticSocMetrics-dev',
          ARTIFACTS_BUCKET: 'asia-agentic-soc-artifacts-dev',
          AUDIT_BUCKET: 'asia-agentic-soc-audit-dev',
          AI_PROVIDER: 'bedrock',
          DEFAULT_TENANT_ID: 'demo-tenant'
        }
      },
      staging: {
        name: 'Staging',
        description: 'Pre-production environment for testing',
        config: {
          AWS_REGION: 'us-east-1',
          DDB_INVESTIGATIONS_TABLE: 'AsiaAgenticSocInvestigations-staging',
          DDB_METRICS_TABLE: 'AsiaAgenticSocMetrics-staging',
          ARTIFACTS_BUCKET: 'asia-agentic-soc-artifacts-staging',
          AUDIT_BUCKET: 'asia-agentic-soc-audit-staging',
          AI_PROVIDER: 'bedrock',
          DEFAULT_TENANT_ID: 'staging-tenant'
        }
      },
      production: {
        name: 'Production',
        description: 'Production environment with full security',
        config: {
          AWS_REGION: 'us-east-1',
          DDB_INVESTIGATIONS_TABLE: 'AsiaAgenticSocInvestigations-prod',
          DDB_METRICS_TABLE: 'AsiaAgenticSocMetrics-prod',
          ARTIFACTS_BUCKET: 'asia-agentic-soc-artifacts-prod',
          AUDIT_BUCKET: 'asia-agentic-soc-audit-prod',
          AI_PROVIDER: 'bedrock',
          DEFAULT_TENANT_ID: 'production'
        }
      },
      hongkong: {
        name: 'Hong Kong',
        description: 'Hong Kong region deployment for HKMA compliance',
        config: {
          AWS_REGION: 'ap-east-1',
          DDB_INVESTIGATIONS_TABLE: 'AsiaAgenticSocInvestigations-hk',
          DDB_METRICS_TABLE: 'AsiaAgenticSocMetrics-hk',
          ARTIFACTS_BUCKET: 'asia-agentic-soc-artifacts-hk',
          AUDIT_BUCKET: 'asia-agentic-soc-audit-hk',
          AI_PROVIDER: 'bedrock',
          BEDROCK_REGION: 'us-east-1', // Use us-east-1 for Bedrock
          DEFAULT_TENANT_ID: 'hkma-tenant'
        }
      }
    };
  }

  /**
   * Apply environment preset
   */
  async applyPreset(presetName) {
    const presets = this.getEnvironmentPresets();
    const preset = presets[presetName];
    
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    
    return await this.updateConfig(preset.config);
  }

  /**
   * Generate IAM policy for current configuration
   */
  async generateIAMPolicy() {
    const config = await this.getCurrentConfig();
    
    const statements = [];
    
    // Basic STS permissions
    statements.push({
      Sid: 'BasicAWSAccess',
      Effect: 'Allow',
      Action: ['sts:GetCallerIdentity'],
      Resource: '*'
    });
    
    // DynamoDB permissions
    if (config.DDB_INVESTIGATIONS_TABLE || config.DDB_METRICS_TABLE) {
      const tableResources = [];
      if (config.DDB_INVESTIGATIONS_TABLE) {
        tableResources.push(`arn:aws:dynamodb:${config.AWS_REGION || '*'}:*:table/${config.DDB_INVESTIGATIONS_TABLE}`);
        tableResources.push(`arn:aws:dynamodb:${config.AWS_REGION || '*'}:*:table/${config.DDB_INVESTIGATIONS_TABLE}/*`);
      }
      if (config.DDB_METRICS_TABLE) {
        tableResources.push(`arn:aws:dynamodb:${config.AWS_REGION || '*'}:*:table/${config.DDB_METRICS_TABLE}`);
        tableResources.push(`arn:aws:dynamodb:${config.AWS_REGION || '*'}:*:table/${config.DDB_METRICS_TABLE}/*`);
      }
      
      statements.push({
        Sid: 'DynamoDBAccess',
        Effect: 'Allow',
        Action: [
          'dynamodb:DescribeTable',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan'
        ],
        Resource: tableResources
      });
    }
    
    // S3 permissions
    const s3Resources = [];
    if (config.ARTIFACTS_BUCKET) {
      s3Resources.push(`arn:aws:s3:::${config.ARTIFACTS_BUCKET}`);
      s3Resources.push(`arn:aws:s3:::${config.ARTIFACTS_BUCKET}/*`);
    }
    if (config.AUDIT_BUCKET) {
      s3Resources.push(`arn:aws:s3:::${config.AUDIT_BUCKET}`);
      s3Resources.push(`arn:aws:s3:::${config.AUDIT_BUCKET}/*`);
    }
    
    if (s3Resources.length > 0) {
      statements.push({
        Sid: 'S3Access',
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetBucketLocation',
          's3:GetBucketEncryption'
        ],
        Resource: s3Resources
      });
    }
    
    // Bedrock permissions
    if (config.AI_PROVIDER === 'bedrock') {
      statements.push({
        Sid: 'BedrockAccess',
        Effect: 'Allow',
        Action: [
          'bedrock:ListFoundationModels',
          'bedrock:InvokeModel'
        ],
        Resource: '*'
      });
    }
    
    // Step Functions permissions
    if (config.STATE_MACHINE_ARN) {
      statements.push({
        Sid: 'StepFunctionsAccess',
        Effect: 'Allow',
        Action: [
          'states:DescribeStateMachine',
          'states:StartExecution',
          'states:DescribeExecution',
          'states:GetExecutionHistory'
        ],
        Resource: config.STATE_MACHINE_ARN
      });
    }
    
    // EventBridge permissions
    statements.push({
      Sid: 'EventBridgeAccess',
      Effect: 'Allow',
      Action: [
        'events:DescribeEventBus',
        'events:PutEvents'
      ],
      Resource: '*'
    });
    
    // KMS permissions
    if (config.KMS_KEY_ID) {
      statements.push({
        Sid: 'KMSAccess',
        Effect: 'Allow',
        Action: [
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey'
        ],
        Resource: config.KMS_KEY_ID
      });
    }
    
    return {
      Version: '2012-10-17',
      Statement: statements
    };
  }

  /**
   * Check if configuration is complete
   */
  async isConfigurationComplete() {
    const config = await this.getCurrentConfig();
    
    const requiredKeys = [
      'AWS_REGION',
      'DDB_INVESTIGATIONS_TABLE',
      'ARTIFACTS_BUCKET',
      'AUDIT_BUCKET',
      'AI_PROVIDER'
    ];
    
    const missing = requiredKeys.filter(key => !config[key]);
    
    return {
      complete: missing.length === 0,
      missing,
      config
    };
  }
}

module.exports = { EnvironmentManager };