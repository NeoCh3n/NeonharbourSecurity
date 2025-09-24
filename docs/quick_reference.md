# NeoHarbour Security - Quick Reference Guide

## Common Administrative Tasks

### User Management
```bash
# Create new user
POST /api/users
{
  "email": "user@company.com",
  "role": "analyst",
  "permissions": ["investigations:read", "investigations:update"]
}

# Update user role
PUT /api/users/{user_id}/role
{
  "role": "admin",
  "permissions": ["*"]
}

# Deactivate user
DELETE /api/users/{user_id}
```

### Demo System Control
```bash
# Start demo session
POST /api/demo/sessions
{
  "scenario_types": ["phishing", "ransomware"],
  "parameters": {
    "interval_seconds": 30,
    "false_positive_rate": 0.8,
    "duration_minutes": 15
  }
}

# Get demo metrics
GET /api/demo/sessions/{session_id}/metrics

# Stop demo session
DELETE /api/demo/sessions/{session_id}
```

### System Health Checks
```bash
# Overall system status
GET /api/health/system

# AWS services status
GET /api/health/aws

# Database connectivity
GET /api/health/database

# AI service availability
GET /api/health/ai
```

## Common Demo Operations

### Quick Demo Setup
1. **Executive Demo (15 min)**
   - Preset: "executive"
   - Scenarios: ["phishing", "insider_threat"]
   - Interval: 45 seconds
   - Focus: Automation metrics and ROI

2. **Technical Demo (30 min)**
   - Preset: "technical"
   - Scenarios: ["all"]
   - Interval: 20 seconds
   - Focus: AI analysis and architecture

3. **Compliance Demo (20 min)**
   - Preset: "compliance"
   - Scenarios: ["phishing", "data_breach"]
   - Interval: 30 seconds
   - Focus: HKMA compliance and audit trails

### Demo Troubleshooting
```bash
# Reset demo environment
POST /api/demo/reset

# Clear demo data
DELETE /api/demo/data

# Restart demo services
POST /api/demo/restart
```

## AWS Configuration Commands

### DynamoDB Setup
```bash
# Create investigations table
aws dynamodb create-table \
  --table-name AsiaAgenticSocInvestigations \
  --attribute-definitions AttributeName=investigation_id,AttributeType=S \
  --key-schema AttributeName=investigation_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Create metrics table
aws dynamodb create-table \
  --table-name AsiaAgenticSocMetrics \
  --attribute-definitions AttributeName=metric_id,AttributeType=S \
  --key-schema AttributeName=metric_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

### S3 Bucket Setup
```bash
# Create artifacts bucket
aws s3 mb s3://neoharbour-artifacts-bucket

# Create audit bucket with Object Lock
aws s3 mb s3://neoharbour-audit-bucket
aws s3api put-object-lock-configuration \
  --bucket neoharbour-audit-bucket \
  --object-lock-configuration ObjectLockEnabled=Enabled
```

### KMS Key Setup
```bash
# Create encryption key
aws kms create-key \
  --description "NeoHarbour Security encryption key" \
  --key-usage ENCRYPT_DECRYPT

# Create key alias
aws kms create-alias \
  --alias-name alias/neoharbour-encryption-key \
  --target-key-id {key-id}
```

## Development Commands

### Local Development
```bash
# Set up environment
python3 -m venv .venv
source .venv/bin/activate
make bootstrap

# Run tests
make test

# Start local demo
make demo

# Format code
make fmt

# Lint code
make lint
```

### Deployment
```bash
# Build and deploy
sam build
sam deploy --guided

# Deploy to specific environment
sam deploy --config-env dev
sam deploy --config-env staging
sam deploy --config-env prod

# Clean up resources
sam delete --no-prompts
```

## Monitoring and Diagnostics

### Log Analysis
```bash
# View CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/neoharbour"

# Tail specific function logs
aws logs tail /aws/lambda/neoharbour-planner-dev --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name "/aws/lambda/neoharbour-planner-dev" \
  --filter-pattern "ERROR"
```

### Performance Monitoring
```bash
# Get CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --namespace "NeoHarbour/Performance" \
  --metric-name "ProcessingTime" \
  --start-time 2024-01-15T00:00:00Z \
  --end-time 2024-01-15T23:59:59Z \
  --period 3600 \
  --statistics Average
```

### Health Check Scripts
```bash
# Comprehensive health check
python tools/health_check.py --comprehensive

# AWS service validation
python tools/validate_aws_service_integration.py

# Demo system test
python tools/demo/test_generator.py --scenario phishing
```

## Emergency Procedures

### System Recovery
```bash
# Restart all services
aws lambda update-function-configuration \
  --function-name neoharbour-planner-prod \
  --environment Variables='{RESTART_TRIGGER=true}'

# Clear stuck investigations
python scripts/clear_stuck_investigations.py --older-than 1h

# Reset demo system
python scripts/reset_demo_system.py --confirm
```

### Data Recovery
```bash
# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name AsiaAgenticSocInvestigations-restored \
  --backup-arn {backup-arn}

# Export investigation data
python scripts/export_investigations.py \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --format json
```

## Configuration Templates

### Environment Variables (.env)
```env
# AWS Configuration
AWS_REGION=ap-southeast-1
DDB_INVESTIGATIONS_TABLE=AsiaAgenticSocInvestigations
DDB_METRICS_TABLE=AsiaAgenticSocMetrics
ARTIFACTS_BUCKET=neoharbour-artifacts-bucket
AUDIT_BUCKET=neoharbour-audit-bucket
KMS_KEY_ID=alias/neoharbour-encryption-key

# AI Configuration
AI_PROVIDER=bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v1

# Demo Configuration
DEMO_ENABLED=true
DEMO_DEFAULT_INTERVAL=30
DEMO_FALSE_POSITIVE_RATE=0.8

# Security Configuration
CLERK_SECRET_KEY=your-clerk-secret-key
JWT_SECRET=your-jwt-secret
```

### SAM Configuration (samconfig.toml)
```toml
[default.deploy.parameters]
stack_name = "neoharbour-security-dev"
s3_bucket = "neoharbour-sam-artifacts"
s3_prefix = "dev"
region = "ap-southeast-1"
capabilities = "CAPABILITY_IAM"
parameter_overrides = "Environment=dev TenantId=default"
```

## API Endpoints Summary

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile

### Investigations
- `GET /api/investigations` - List investigations
- `GET /api/investigations/{id}` - Get investigation details
- `PUT /api/investigations/{id}` - Update investigation
- `DELETE /api/investigations/{id}` - Delete investigation

### Demo System
- `POST /api/demo/sessions` - Start demo session
- `GET /api/demo/sessions/{id}` - Get demo session
- `PUT /api/demo/sessions/{id}` - Update demo parameters
- `DELETE /api/demo/sessions/{id}` - Stop demo session
- `GET /api/demo/sessions/{id}/metrics` - Get demo metrics

### User Management
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{id}` - Delete user

### System Health
- `GET /api/health/system` - System status
- `GET /api/health/aws` - AWS services status
- `GET /api/health/database` - Database status
- `GET /api/health/ai` - AI services status

---

*This quick reference guide provides common commands and procedures for NeoHarbour Security administration and operation.*