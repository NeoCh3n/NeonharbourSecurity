# NeoHarbour Security - Deployment Automation Guide

## Overview

This document describes the comprehensive deployment automation system for NeoHarbour Security, including environment-specific configuration management, automated deployment validation, and rollback mechanisms.

## Architecture

The deployment automation system consists of:

- **Environment Configuration**: YAML-based configuration files for dev, staging, and production
- **SAM Configuration**: Environment-specific SAM deployment configurations
- **Deployment Scripts**: Automated deployment with validation and rollback capabilities
- **Validation Scripts**: Pre and post-deployment validation
- **Rollback System**: Automated rollback with backup and restore capabilities

## Directory Structure

```
├── config/
│   ├── environments/           # Environment-specific configurations
│   │   ├── dev.yaml
│   │   ├── staging.yaml
│   │   └── prod.yaml
│   └── sam-configs/           # SAM deployment configurations
│       ├── samconfig-dev.toml
│       ├── samconfig-staging.toml
│       └── samconfig-prod.toml
├── scripts/
│   ├── deploy.sh              # Main deployment script
│   ├── rollback.sh            # Rollback script
│   └── deployment/            # Deployment utilities
│       ├── functions.sh       # Shared deployment functions
│       ├── validate_config.py # Configuration validation
│       ├── check_secrets.py   # Secrets validation
│       └── test_endpoints.py  # Post-deployment testing
├── logs/
│   └── deployment/            # Deployment logs and metrics
└── backups/                   # Environment-specific backups
    ├── dev/
    ├── staging/
    └── prod/
```

## Environment Configuration

### Configuration Files

Each environment has a dedicated YAML configuration file in `config/environments/`:

- `dev.yaml` - Development environment (simplified, local-friendly)
- `staging.yaml` - Staging environment (production-like for testing)
- `prod.yaml` - Production environment (full security and compliance)

### Configuration Structure

```yaml
environment: dev
description: "Development environment for NeoHarbour Security"

aws:
  account_id: "123456789012"
  region: "us-east-1"
  dynamodb:
    investigations_table: "AsiaAgenticSocInvestigations-dev"
    # ... other DynamoDB tables
  s3:
    artifacts_bucket: "asia-agentic-soc-artifacts-123456789012-dev"
    # ... other S3 buckets
  # ... other AWS services

ai:
  provider: "bedrock"
  bedrock:
    region: "us-east-1"
    text_model: "anthropic.claude-3-haiku-20240307-v1:0"
    # ... other AI configuration

demo:
  default_tenant_id: "dev-demo"
  max_concurrent_sessions: 5
  # ... other demo configuration

# ... other sections
```

## Deployment Process

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **SAM CLI** installed and configured
3. **Python 3.12+** with required dependencies
4. **yq** for YAML processing
5. **Git** for version control (optional)

### Basic Deployment

```bash
# Deploy to development
./scripts/deploy.sh dev

# Deploy to staging with validation only
./scripts/deploy.sh staging --validate-only

# Deploy to production with force flag
./scripts/deploy.sh prod --force

# Dry run deployment
./scripts/deploy.sh staging --dry-run
```

### Deployment Options

| Option | Description |
|--------|-------------|
| `--validate-only` | Only run validation, don't deploy |
| `--force` | Force deployment without confirmation |
| `--skip-tests` | Skip pre-deployment tests |
| `--dry-run` | Show deployment plan without executing |

### Deployment Steps

1. **Pre-deployment Checks**
   - Verify AWS CLI and SAM CLI
   - Check AWS credentials and permissions
   - Validate account and region

2. **Configuration Validation**
   - Validate YAML configuration files
   - Check SAM template syntax
   - Verify required secrets exist

3. **Pre-deployment Testing**
   - Run unit tests
   - Run integration tests
   - Run demo system tests

4. **Infrastructure Deployment**
   - Build SAM application
   - Deploy CloudFormation stack
   - Store deployment metadata

5. **Application Deployment**
   - Deploy React frontend (staging/prod)
   - Deploy backend API
   - Update Lambda functions

6. **Post-deployment Validation**
   - Health checks
   - AWS service integration tests
   - Demo system validation
   - API endpoint testing

## Validation System

### Configuration Validation

The `validate_config.py` script validates:

- AWS configuration (account, region, resources)
- AI provider configuration
- Demo system configuration
- Security settings
- Monitoring configuration
- Compliance requirements

```bash
python scripts/deployment/validate_config.py dev
```

### Secrets Validation

The `check_secrets.py` script validates:

- AWS credentials and permissions
- Bedrock model access
- Secrets Manager secrets
- SSL certificates
- Notification endpoints

```bash
python scripts/deployment/check_secrets.py staging
```

### Endpoint Testing

The `test_endpoints.py` script tests:

- Health endpoints
- Demo API endpoints
- CORS headers
- Response times
- Security headers

```bash
python scripts/deployment/test_endpoints.py prod
```

## Rollback System

### Rollback Capabilities

The rollback system supports:

- **CloudFormation Stack Rollback**: Revert to previous stack version
- **Application Rollback**: Restore frontend and backend components
- **Git-based Rollback**: Checkout and redeploy specific versions
- **Backup-based Rollback**: Restore from automated backups

### Rollback Usage

```bash
# List available versions for rollback
./scripts/rollback.sh staging --list-versions

# Rollback to specific version
./scripts/rollback.sh staging --target v1.2.3

# Rollback to latest backup
./scripts/rollback.sh dev --target latest-backup

# Force rollback production
./scripts/rollback.sh prod --target v1.2.3 --force

# Dry run rollback
./scripts/rollback.sh staging --target v1.2.3 --dry-run
```

### Rollback Options

| Option | Description |
|--------|-------------|
| `--target VERSION` | Target version to rollback to |
| `--list-versions` | List available versions |
| `--force` | Force rollback without confirmation |
| `--dry-run` | Show rollback plan without executing |
| `--backup-first` | Create backup before rollback |

## Backup System

### Automated Backups

Backups are automatically created before deployments and include:

- CloudFormation stack templates and descriptions
- DynamoDB table schemas
- S3 bucket policies and configurations
- Deployment metadata and Git information

### Backup Structure

```
backups/staging/backup_20241224_143022/
├── metadata.json                    # Backup metadata
├── cloudformation-template.json     # Stack template
├── stack-description.json          # Stack description
├── investigations-table-schema.json # DynamoDB schema
├── artifacts-bucket-policy.json    # S3 bucket policy
└── artifacts-bucket-encryption.json # S3 encryption config
```

### Manual Backup

```bash
# Create manual backup
python scripts/deployment/functions.sh backup_deployment staging
```

## Environment-Specific Features

### Development Environment

- Simplified configuration
- Local development server support
- Debug logging enabled
- Minimal security requirements
- No custom domains or SSL

### Staging Environment

- Production-like configuration
- CloudFront distribution
- Custom domains with SSL
- Monitoring and alerting
- HKMA compliance enabled

### Production Environment

- Full security configuration
- VPC and WAF enabled
- Multi-region KMS keys
- 7-year data retention
- Comprehensive monitoring
- Disaster recovery enabled

## Monitoring and Logging

### Deployment Logs

All deployment activities are logged to `logs/deployment/` with:

- Deployment ID and timestamp
- Environment and configuration details
- Step-by-step execution logs
- Error and warning messages
- Performance metrics

### CloudWatch Integration

Production deployments include:

- CloudWatch dashboards
- Custom metrics and alarms
- Log aggregation
- Performance monitoring

### Notifications

Deployment status notifications via:

- Slack webhooks
- SNS email notifications
- PagerDuty integration (production)

## Security Considerations

### Secrets Management

- AWS Secrets Manager for sensitive data
- Environment-specific secret paths
- Automatic secret rotation support
- Least-privilege access policies

### Encryption

- KMS encryption for all data at rest
- TLS encryption for data in transit
- S3 Object Lock for compliance
- Encrypted CloudWatch logs

### Access Control

- IAM least-privilege policies
- Role-based deployment access
- Multi-factor authentication required
- Audit logging for all operations

## Troubleshooting

### Common Issues

1. **AWS Credentials**
   ```bash
   aws sts get-caller-identity
   aws configure list
   ```

2. **SAM Build Failures**
   ```bash
   sam build --debug
   sam validate --template infra/sam-template.yaml
   ```

3. **Configuration Errors**
   ```bash
   python scripts/deployment/validate_config.py dev
   yq eval . config/environments/dev.yaml
   ```

4. **Deployment Failures**
   ```bash
   # Check CloudFormation events
   aws cloudformation describe-stack-events --stack-name AsiaAgenticSoc-dev
   
   # Check deployment logs
   tail -f logs/deployment/deploy_*.log
   ```

### Recovery Procedures

1. **Failed Deployment Recovery**
   ```bash
   # Rollback to previous version
   ./scripts/rollback.sh staging --target latest-backup
   
   # Or rollback to specific version
   ./scripts/rollback.sh staging --target v1.2.3
   ```

2. **Configuration Issues**
   ```bash
   # Validate configuration
   python scripts/deployment/validate_config.py staging
   
   # Check secrets
   python scripts/deployment/check_secrets.py staging
   ```

3. **Service Health Issues**
   ```bash
   # Run health checks
   python tools/health_check.py health --environment staging
   
   # Test endpoints
   python scripts/deployment/test_endpoints.py staging
   ```

## Best Practices

### Deployment Workflow

1. **Development**
   - Test locally with `make demo`
   - Deploy to dev environment
   - Run comprehensive tests

2. **Staging**
   - Deploy to staging environment
   - Run integration tests
   - Validate with stakeholders

3. **Production**
   - Create backup before deployment
   - Deploy during maintenance window
   - Monitor closely post-deployment
   - Have rollback plan ready

### Configuration Management

- Use environment-specific configurations
- Validate configurations before deployment
- Version control all configuration changes
- Document configuration changes

### Security

- Rotate secrets regularly
- Use least-privilege access
- Enable audit logging
- Monitor for security events

### Monitoring

- Set up comprehensive monitoring
- Configure appropriate alerts
- Review logs regularly
- Track deployment metrics

## Support and Maintenance

### Regular Maintenance

- Review and update configurations monthly
- Test rollback procedures quarterly
- Update dependencies regularly
- Review security settings

### Documentation Updates

- Update this guide when adding new features
- Document configuration changes
- Maintain troubleshooting procedures
- Keep examples current

### Contact Information

For deployment issues:
1. Check logs in `logs/deployment/`
2. Review troubleshooting section
3. Validate configuration and secrets
4. Contact DevOps team if issues persist