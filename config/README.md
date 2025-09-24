# NeoHarbour Security - Deployment Configuration

This directory contains environment-specific configuration files and deployment automation for NeoHarbour Security.

## Directory Structure

```
config/
├── environments/           # Environment-specific YAML configurations
│   ├── dev.yaml           # Development environment
│   ├── staging.yaml       # Staging environment
│   └── prod.yaml          # Production environment
├── sam-configs/           # SAM deployment configurations
│   ├── samconfig-dev.toml
│   ├── samconfig-staging.toml
│   └── samconfig-prod.toml
└── README.md              # This file
```

## Quick Start

### 1. Install Dependencies

```bash
# Install deployment tools
./scripts/install_deployment_deps.sh

# Configure AWS credentials
aws configure
```

### 2. Validate Configuration

```bash
# Validate development environment
make validate-config ENV=dev

# Or use the script directly
python scripts/deployment/validate_config.py dev
```

### 3. Deploy

```bash
# Deploy to development
make deploy-dev

# Deploy to staging
make deploy-staging

# Deploy to production (requires confirmation)
make deploy-prod
```

## Environment Configurations

### Development (dev.yaml)

- **Purpose**: Local development and testing
- **Features**: Simplified configuration, debug logging, no custom domains
- **AWS Account**: Development account
- **Region**: us-east-1
- **Security**: Basic encryption, no VPC

### Staging (staging.yaml)

- **Purpose**: Production-like testing environment
- **Features**: Full feature set, monitoring, custom domains
- **AWS Account**: Staging account
- **Region**: ap-southeast-1
- **Security**: Production-like security, VPC enabled

### Production (prod.yaml)

- **Purpose**: Live production environment
- **Features**: Full security, compliance, monitoring, disaster recovery
- **AWS Account**: Production account
- **Region**: ap-southeast-1
- **Security**: Maximum security, WAF, multi-region KMS

## Configuration Structure

Each environment configuration includes:

```yaml
environment: dev
description: "Environment description"

aws:
  account_id: "123456789012"
  region: "us-east-1"
  dynamodb: { ... }
  s3: { ... }
  kms: { ... }
  eventbridge: { ... }
  stepfunctions: { ... }
  lambda: { ... }

ai:
  provider: "bedrock"
  bedrock: { ... }

demo:
  default_tenant_id: "dev-demo"
  # ... other demo settings

# ... other sections
```

## Customization

### Adding New Environment

1. Create new YAML file: `config/environments/newenv.yaml`
2. Create SAM config: `config/sam-configs/samconfig-newenv.toml`
3. Update deployment scripts to include new environment
4. Test configuration: `python scripts/deployment/validate_config.py newenv`

### Modifying Existing Environment

1. Edit the appropriate YAML file
2. Validate changes: `make validate-config ENV=<env>`
3. Test deployment: `./scripts/deploy.sh <env> --dry-run`
4. Deploy changes: `make deploy-<env>`

### Configuration Best Practices

- **Never commit secrets**: Use AWS Secrets Manager or environment variables
- **Validate before deploy**: Always run validation before deployment
- **Use environment-specific values**: Don't share resources between environments
- **Document changes**: Update this README when adding new configuration options
- **Test thoroughly**: Use staging environment to test production changes

## Secrets Management

Secrets are managed through AWS Secrets Manager with environment-specific paths:

```
/asia-agentic-soc/dev/clerk-secret-key
/asia-agentic-soc/staging/clerk-secret-key
/asia-agentic-soc/prod/clerk-secret-key
```

Check secrets: `python scripts/deployment/check_secrets.py <env>`

## Monitoring and Logging

All deployments are logged to `logs/deployment/` with:

- Deployment ID and timestamp
- Configuration validation results
- Deployment steps and outcomes
- Error messages and warnings

Check deployment status: `make status`

## Troubleshooting

### Common Issues

1. **Configuration Validation Errors**
   ```bash
   # Check configuration syntax
   yq eval . config/environments/dev.yaml
   
   # Validate configuration
   python scripts/deployment/validate_config.py dev
   ```

2. **AWS Credentials Issues**
   ```bash
   # Check current credentials
   aws sts get-caller-identity
   
   # Check configuration
   aws configure list
   ```

3. **SAM Deployment Errors**
   ```bash
   # Validate SAM template
   sam validate --template infra/sam-template.yaml
   
   # Check SAM configuration
   cat config/sam-configs/samconfig-dev.toml
   ```

### Getting Help

1. Check the deployment logs in `logs/deployment/`
2. Run validation scripts to identify issues
3. Review the troubleshooting section in `docs/deployment_automation.md`
4. Contact the DevOps team for assistance

## Security Considerations

- **Least Privilege**: All IAM roles use minimum required permissions
- **Encryption**: All data encrypted at rest and in transit
- **Network Security**: Production uses VPC and WAF
- **Audit Logging**: All operations are logged for compliance
- **Secret Rotation**: Secrets should be rotated regularly

## Compliance

The configuration supports:

- **HKMA SA-2**: Supervisory approach for cybersecurity
- **HKMA TM-G-1**: Technology risk management guidelines
- **Data Retention**: Configurable retention periods
- **Audit Trails**: Immutable audit logging

## Support

For configuration issues:

1. Validate configuration files
2. Check AWS permissions and connectivity
3. Review deployment logs
4. Consult the deployment automation guide
5. Contact the development team

## Version History

- **v1.0**: Initial deployment automation
- **v1.1**: Added rollback capabilities
- **v1.2**: Enhanced validation and monitoring
- **v1.3**: Added multi-environment support