const {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand
} = require('@aws-sdk/client-sts');
const {
  DynamoDBClient,
  DescribeTableCommand,
  ListTablesCommand
} = require('@aws-sdk/client-dynamodb');
const {
  S3Client,
  HeadBucketCommand,
  GetBucketLocationCommand,
  GetBucketEncryptionCommand
} = require('@aws-sdk/client-s3');
const {
  BedrockClient,
  ListFoundationModelsCommand
} = require('@aws-sdk/client-bedrock');
const {
  SFNClient,
  DescribeStateMachineCommand,
  ListStateMachinesCommand
} = require('@aws-sdk/client-sfn');
const {
  EventBridgeClient,
  DescribeEventBusCommand
} = require('@aws-sdk/client-eventbridge');
const {
  LambdaClient,
  GetFunctionCommand
} = require('@aws-sdk/client-lambda');

class AWSValidator {
  constructor(config = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.clientConfig = {
      region: this.region,
      maxAttempts: 3,
      ...config
    };
  }

  /**
   * Test basic AWS credentials and identity
   */
  async validateCredentials() {
    try {
      const sts = new STSClient(this.clientConfig);
      const command = new GetCallerIdentityCommand({});
      const result = await sts.send(command);

      return {
        success: true,
        identity: {
          account: result.Account,
          arn: result.Arn,
          userId: result.UserId
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getCredentialsRemediation(error)
      };
    }
  }

  /**
   * Validate DynamoDB table access
   */
  async validateDynamoDB(tableName) {
    try {
      const client = new DynamoDBClient(this.clientConfig);
      const command = new DescribeTableCommand({ TableName: tableName });
      const result = await client.send(command);

      return {
        success: true,
        table: {
          name: result.Table.TableName,
          status: result.Table.TableStatus,
          itemCount: result.Table.ItemCount,
          encryption: result.Table.SSEDescription?.Status || 'DISABLED'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getDynamoDBRemediation(error, tableName)
      };
    }
  }

  /**
   * Validate S3 bucket access
   */
  async validateS3Bucket(bucketName) {
    try {
      const client = new S3Client(this.clientConfig);

      // Check bucket exists and we have access
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));

      // Get bucket location
      const locationResult = await client.send(
        new GetBucketLocationCommand({ Bucket: bucketName })
      );

      // Check encryption
      let encryption = null;
      try {
        const encryptionResult = await client.send(
          new GetBucketEncryptionCommand({ Bucket: bucketName })
        );
        encryption = encryptionResult.ServerSideEncryptionConfiguration;
      } catch (encError) {
        // Encryption not configured
        encryption = null;
      }

      return {
        success: true,
        bucket: {
          name: bucketName,
          region: locationResult.LocationConstraint || 'us-east-1',
          encryption: encryption ? 'ENABLED' : 'DISABLED'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getS3Remediation(error, bucketName)
      };
    }
  }

  /**
   * Validate Bedrock access
   */
  async validateBedrock() {
    try {
      const client = new BedrockClient(this.clientConfig);
      const command = new ListFoundationModelsCommand({});
      const result = await client.send(command);

      const claudeModels = result.modelSummaries?.filter(
        model => model.modelId.includes('claude')
      ) || [];

      return {
        success: true,
        bedrock: {
          modelsAvailable: result.modelSummaries?.length || 0,
          claudeModels: claudeModels.length,
          region: this.region
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getBedrockRemediation(error)
      };
    }
  }

  /**
   * Validate Step Functions access
   */
  async validateStepFunctions(stateMachineArn) {
    try {
      const client = new SFNClient(this.clientConfig);
      const command = new DescribeStateMachineCommand({
        stateMachineArn
      });
      const result = await client.send(command);

      return {
        success: true,
        stateMachine: {
          name: result.name,
          status: result.status,
          roleArn: result.roleArn,
          creationDate: result.creationDate
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getStepFunctionsRemediation(error, stateMachineArn)
      };
    }
  }

  /**
   * Validate EventBridge access
   */
  async validateEventBridge(eventBusName = 'default') {
    try {
      const client = new EventBridgeClient(this.clientConfig);
      const command = new DescribeEventBusCommand({ Name: eventBusName });
      const result = await client.send(command);

      return {
        success: true,
        eventBus: {
          name: result.Name,
          arn: result.Arn,
          policy: result.Policy ? 'CONFIGURED' : 'DEFAULT'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
        remediation: this.getEventBridgeRemediation(error, eventBusName)
      };
    }
  }

  /**
   * Validate all AWS services
   */
  async validateAllServices(config) {
    const results = {
      timestamp: new Date().toISOString(),
      overall: { success: true, errors: [] }
    };

    // Test credentials first
    results.credentials = await this.validateCredentials();
    if (!results.credentials.success) {
      results.overall.success = false;
      results.overall.errors.push('Invalid AWS credentials');
      return results; // Stop here if credentials fail
    }

    // Test DynamoDB
    if (config.dynamodbTable) {
      results.dynamodb = await this.validateDynamoDB(config.dynamodbTable);
      if (!results.dynamodb.success) {
        results.overall.success = false;
        results.overall.errors.push('DynamoDB access failed');
      }
    }

    // Test S3 buckets
    if (config.s3ArtifactsBucket) {
      results.s3Artifacts = await this.validateS3Bucket(config.s3ArtifactsBucket);
      if (!results.s3Artifacts.success) {
        results.overall.success = false;
        results.overall.errors.push('S3 artifacts bucket access failed');
      }
    }

    if (config.s3AuditBucket) {
      results.s3Audit = await this.validateS3Bucket(config.s3AuditBucket);
      if (!results.s3Audit.success) {
        results.overall.success = false;
        results.overall.errors.push('S3 audit bucket access failed');
      }
    }

    // Test Bedrock
    results.bedrock = await this.validateBedrock();
    if (!results.bedrock.success) {
      results.overall.success = false;
      results.overall.errors.push('Bedrock access failed');
    }

    // Test Step Functions
    if (config.stateMachineArn) {
      results.stepFunctions = await this.validateStepFunctions(config.stateMachineArn);
      if (!results.stepFunctions.success) {
        results.overall.success = false;
        results.overall.errors.push('Step Functions access failed');
      }
    }

    // Test EventBridge
    results.eventBridge = await this.validateEventBridge(config.eventBusName);
    if (!results.eventBridge.success) {
      results.overall.success = false;
      results.overall.errors.push('EventBridge access failed');
    }

    return results;
  }

  // Remediation helpers
  getCredentialsRemediation(error) {
    const remediations = {
      'CredentialsError': {
        title: 'AWS Credentials Not Found',
        steps: [
          'Configure AWS credentials using one of these methods:',
          '1. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables',
          '2. Configure AWS CLI: aws configure',
          '3. Use IAM roles if running on EC2/ECS/Lambda',
          '4. Set AWS_PROFILE environment variable to use a specific profile'
        ],
        documentation: 'https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html'
      },
      'UnauthorizedOperation': {
        title: 'Insufficient AWS Permissions',
        steps: [
          'The current AWS credentials lack necessary permissions.',
          'Required IAM permissions:',
          '- sts:GetCallerIdentity',
          'Contact your AWS administrator to grant these permissions.'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: ['sts:GetCallerIdentity'],
            Resource: '*'
          }]
        }
      }
    };

    return remediations[error.name] || {
      title: 'AWS Credentials Error',
      steps: [`Error: ${error.message}`, 'Please check your AWS configuration.'],
      documentation: 'https://docs.aws.amazon.com/cli/latest/userguide/troubleshooting.html'
    };
  }

  getDynamoDBRemediation(error, tableName) {
    const remediations = {
      'ResourceNotFoundException': {
        title: 'DynamoDB Table Not Found',
        steps: [
          `Table "${tableName}" does not exist in region ${this.region}.`,
          'Options:',
          '1. Create the table using AWS CLI or Console',
          '2. Deploy the SAM template: sam deploy',
          '3. Verify the table name and region are correct'
        ],
        awsCli: `aws dynamodb describe-table --table-name ${tableName} --region ${this.region}`
      },
      'AccessDeniedException': {
        title: 'DynamoDB Access Denied',
        steps: [
          'Insufficient permissions to access DynamoDB table.',
          'Required IAM permissions:',
          '- dynamodb:DescribeTable',
          '- dynamodb:GetItem',
          '- dynamodb:PutItem',
          '- dynamodb:UpdateItem',
          '- dynamodb:Query',
          '- dynamodb:Scan'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'dynamodb:DescribeTable',
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:Query',
              'dynamodb:Scan'
            ],
            Resource: `arn:aws:dynamodb:${this.region}:*:table/${tableName}`
          }]
        }
      }
    };

    return remediations[error.name] || {
      title: 'DynamoDB Error',
      steps: [`Error: ${error.message}`, 'Please check your DynamoDB configuration.']
    };
  }

  getS3Remediation(error, bucketName) {
    const remediations = {
      'NoSuchBucket': {
        title: 'S3 Bucket Not Found',
        steps: [
          `Bucket "${bucketName}" does not exist or is not accessible.`,
          'Options:',
          '1. Create the bucket using AWS CLI or Console',
          '2. Deploy the SAM template: sam deploy',
          '3. Verify the bucket name and region are correct'
        ],
        awsCli: `aws s3 ls s3://${bucketName}`
      },
      'AccessDenied': {
        title: 'S3 Access Denied',
        steps: [
          'Insufficient permissions to access S3 bucket.',
          'Required IAM permissions:',
          '- s3:GetObject',
          '- s3:PutObject',
          '- s3:DeleteObject',
          '- s3:ListBucket'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              's3:GetObject',
              's3:PutObject',
              's3:DeleteObject'
            ],
            Resource: `arn:aws:s3:::${bucketName}/*`
          }, {
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: `arn:aws:s3:::${bucketName}`
          }]
        }
      }
    };

    return remediations[error.name] || {
      title: 'S3 Error',
      steps: [`Error: ${error.message}`, 'Please check your S3 configuration.']
    };
  }

  getBedrockRemediation(error) {
    const remediations = {
      'AccessDeniedException': {
        title: 'Bedrock Access Denied',
        steps: [
          'Insufficient permissions to access Amazon Bedrock.',
          'Required IAM permissions:',
          '- bedrock:ListFoundationModels',
          '- bedrock:InvokeModel',
          'Note: Bedrock may not be available in all regions.'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'bedrock:ListFoundationModels',
              'bedrock:InvokeModel'
            ],
            Resource: '*'
          }]
        }
      },
      'ValidationException': {
        title: 'Bedrock Not Available',
        steps: [
          'Amazon Bedrock is not available in this region.',
          'Available regions: us-east-1, us-west-2, ap-southeast-1, eu-west-1',
          'Update your AWS_REGION or BEDROCK_REGION configuration.'
        ]
      }
    };

    return remediations[error.name] || {
      title: 'Bedrock Error',
      steps: [`Error: ${error.message}`, 'Please check your Bedrock configuration.']
    };
  }

  getStepFunctionsRemediation(error, stateMachineArn) {
    const remediations = {
      'StateMachineDoesNotExist': {
        title: 'Step Functions State Machine Not Found',
        steps: [
          `State machine "${stateMachineArn}" does not exist.`,
          'Options:',
          '1. Deploy the SAM template: sam deploy',
          '2. Verify the ARN is correct',
          '3. Check the region matches your configuration'
        ]
      },
      'AccessDeniedException': {
        title: 'Step Functions Access Denied',
        steps: [
          'Insufficient permissions to access Step Functions.',
          'Required IAM permissions:',
          '- states:DescribeStateMachine',
          '- states:StartExecution',
          '- states:DescribeExecution'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'states:DescribeStateMachine',
              'states:StartExecution',
              'states:DescribeExecution'
            ],
            Resource: stateMachineArn
          }]
        }
      }
    };

    return remediations[error.name] || {
      title: 'Step Functions Error',
      steps: [`Error: ${error.message}`, 'Please check your Step Functions configuration.']
    };
  }

  getEventBridgeRemediation(error, eventBusName) {
    const remediations = {
      'ResourceNotFoundException': {
        title: 'EventBridge Bus Not Found',
        steps: [
          `Event bus "${eventBusName}" does not exist.`,
          'Options:',
          '1. Use "default" for the default event bus',
          '2. Create a custom event bus if needed',
          '3. Deploy the SAM template: sam deploy'
        ]
      },
      'AccessDeniedException': {
        title: 'EventBridge Access Denied',
        steps: [
          'Insufficient permissions to access EventBridge.',
          'Required IAM permissions:',
          '- events:DescribeEventBus',
          '- events:PutEvents'
        ],
        iamPolicy: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'events:DescribeEventBus',
              'events:PutEvents'
            ],
            Resource: '*'
          }]
        }
      }
    };

    return remediations[error.name] || {
      title: 'EventBridge Error',
      steps: [`Error: ${error.message}`, 'Please check your EventBridge configuration.']
    };
  }
}

module.exports = { AWSValidator };