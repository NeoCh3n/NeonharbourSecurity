# AWS Configuration Management System

This document describes the AWS configuration management and validation system implemented for NeoHarbour Security.

## Overview

The AWS configuration management system provides:

1. **Service Validation**: Test connectivity and permissions for all required AWS services
2. **Guided Setup Wizard**: Step-by-step configuration for new deployments
3. **Environment Management**: Quick switching between development, staging, and production environments
4. **Error Remediation**: Specific troubleshooting guidance with IAM policies and setup instructions

## Components

### Backend Services

#### AWSValidator (`backend/aws/validator.js`)
- Validates AWS credentials and service access
- Tests connectivity to DynamoDB, S3, Bedrock, Step Functions, EventBridge
- Provides detailed error messages and remediation steps
- Generates specific IAM policies for missing permissions

#### EnvironmentManager (`backend/aws/environment.js`)
- Manages `.env` file configuration
- Provides environment presets (development, staging, production, Hong Kong)
- Validates configuration completeness
- Generates IAM policies based on current configuration

#### SetupWizard (`backend/aws/setup.js`)
- Provides guided setup workflow with validation
- Four-step configuration process:
  1. AWS Credentials
  2. AWS Resources (DynamoDB, S3)
  3. AI Configuration (Bedrock)
  4. Optional Services (KMS, Step Functions, EventBridge)

### Frontend Components

#### AWSServiceConfig (`clerk-react/src/components/AWSServiceConfig.tsx`)
- Main AWS configuration interface
- Real-time service status validation
- Error remediation with specific guidance
- IAM policy generation and display

#### AWSSetupWizard (`clerk-react/src/components/AWSSetupWizard.tsx`)
- Guided setup wizard interface
- Step-by-step validation with progress tracking
- Real-time error feedback and remediation

#### EnvironmentManager (`clerk-react/src/components/EnvironmentManager.tsx`)
- Environment preset management
- Quick switching between deployment environments
- Configuration status overview

#### SystemConfiguration (`clerk-react/src/components/SystemConfiguration.tsx`)
- Tabbed interface combining all AWS management features
- Integration with existing system settings

## API Endpoints

### Configuration Management
- `GET /admin/aws/config` - Get current AWS configuration
- `PUT /admin/aws/config` - Update AWS configuration
- `POST /admin/aws/validate` - Validate AWS services
- `GET /admin/aws/iam-policy` - Generate IAM policy

### Environment Management
- `GET /admin/aws/presets` - Get environment presets
- `POST /admin/aws/presets/:presetName` - Apply environment preset

### Setup Wizard
- `GET /admin/aws/setup/steps` - Get setup wizard steps
- `POST /admin/aws/setup/validate/:stepId` - Validate setup step
- `POST /admin/aws/setup/complete` - Complete setup wizard
- `GET /admin/aws/setup/deployment` - Get deployment instructions

## Environment Presets

### Development
- Region: `us-east-1`
- Resources: `*-dev` suffix
- AI Provider: `bedrock`

### Staging
- Region: `us-east-1`
- Resources: `*-staging` suffix
- AI Provider: `bedrock`

### Production
- Region: `us-east-1`
- Resources: `*-prod` suffix
- AI Provider: `bedrock`

### Hong Kong
- Region: `ap-east-1` (with Bedrock in `us-east-1`)
- Resources: `*-hk` suffix
- AI Provider: `bedrock`

## Error Handling and Remediation

The system provides specific remediation guidance for common AWS configuration issues:

### Credentials Errors
- Missing AWS credentials
- Invalid credentials
- Insufficient permissions

### Service-Specific Errors
- DynamoDB table not found or access denied
- S3 bucket not found or access denied
- Bedrock not available in region
- Step Functions state machine not found
- EventBridge access issues

### Remediation Features
- Specific error messages with context
- Step-by-step remediation instructions
- Generated IAM policies for missing permissions
- Links to AWS documentation
- AWS CLI commands for troubleshooting

## Security Considerations

- Sensitive credentials are never stored in frontend state
- IAM policies follow least-privilege principles
- All API endpoints require admin permissions
- Configuration validation happens server-side
- Error messages don't expose sensitive information

## Usage

### Initial Setup
1. Access the admin interface
2. Navigate to System Configuration → Setup Wizard
3. Follow the guided setup process
4. Validate all services before proceeding

### Environment Switching
1. Navigate to System Configuration → Environment Management
2. Select desired environment preset
3. Confirm configuration changes
4. Validate services after switching

### Troubleshooting
1. Navigate to System Configuration → AWS Configuration
2. Click "Test All Services"
3. Review any failed services
4. Click "View Fix" for specific remediation steps
5. Apply suggested IAM policies or configuration changes

## Requirements Fulfilled

This implementation fulfills the following requirements:

- **Requirement 9.2**: Display specific error messages and remediation steps through Cloudscape Alert components when AWS credentials are invalid
- **Requirement 9.4**: Provide environment management tools with clear configuration validation when switching AWS environments
- **Requirement 9.5**: Generate specific IAM policy requirements and installation instructions if AWS permissions are insufficient