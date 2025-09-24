# NeoHarbour Security - Admin User Guide

## Table of Contents
1. [Overview](#overview)
2. [Initial System Setup](#initial-system-setup)
3. [AWS Configuration Management](#aws-configuration-management)
4. [User Management](#user-management)
5. [System Configuration](#system-configuration)
6. [Demo System Configuration](#demo-system-configuration)
7. [Monitoring and Health Checks](#monitoring-and-health-checks)
8. [Troubleshooting](#troubleshooting)
9. [Security Best Practices](#security-best-practices)

## Overview

The NeoHarbour Security Admin Interface provides comprehensive system administration capabilities through a modern AWS Cloudscape-based dashboard. As an administrator, you can manage users, configure AWS integrations, monitor system health, and control demo system parameters.

### Key Administrative Functions
- **User Management**: Create, modify, and deactivate user accounts with role-based permissions
- **AWS Service Configuration**: Set up and validate connections to AWS services
- **Demo System Control**: Configure demo parameters and scenario libraries
- **System Monitoring**: Monitor health, performance, and error logs
- **Security Management**: Manage authentication, authorization, and audit trails

## Initial System Setup

### Prerequisites
- Administrative access to the NeoHarbour Security platform
- AWS account with appropriate permissions
- Clerk authentication service configured
- Valid SSL certificates for production deployment

### First-Time Setup Process

1. **Access the Admin Interface**
   ```
   Navigate to: https://your-domain.com/admin
   Login with your administrator Clerk credentials
   ```

2. **Complete AWS Configuration Wizard**
   - Click "AWS Setup" in the main dashboard
   - Follow the guided setup wizard
   - Validate all required AWS services

3. **Create Initial User Accounts**
   - Navigate to "User Management"
   - Create analyst and demo user accounts
   - Assign appropriate roles and permissions

4. **Configure Demo System**
   - Access "Demo Configuration" panel
   - Set up scenario libraries and parameters
   - Test demo data generation

## AWS Configuration Management

### Supported AWS Services
The system integrates with the following AWS services:
- **Amazon Bedrock**: AI analysis (Claude 3 Haiku + Titan embeddings)
- **DynamoDB**: Investigation and metrics storage
- **S3**: Artifact and audit log storage
- **EventBridge**: Alert ingestion and routing
- **Step Functions**: Workflow orchestration
- **Lambda**: Pipeline stage execution
- **KMS**: Encryption key management

### Configuration Steps

#### 1. AWS Credentials Setup
```bash
# Option 1: AWS CLI Configuration
aws configure
AWS Access Key ID: [Your Access Key]
AWS Secret Access Key: [Your Secret Key]
Default region name: [Your Region]
Default output format: json

# Option 2: Environment Variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=your-region
```

#### 2. Using the AWS Setup Wizard
1. **Navigate to System Configuration → AWS Services**
2. **Click "Start AWS Setup Wizard"**
3. **Follow these steps:**
   - **Credentials Validation**: Enter AWS credentials or use IAM roles
   - **Region Selection**: Choose your preferred AWS region
   - **Service Testing**: Wizard tests each required service
   - **Permission Validation**: Confirms IAM permissions are sufficient
   - **Resource Creation**: Creates required DynamoDB tables and S3 buckets

#### 3. Manual Configuration
If you prefer manual setup, configure each service individually:

**DynamoDB Tables:**
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

**S3 Buckets:**
```bash
# Create artifacts bucket
aws s3 mb s3://neoharbour-artifacts-bucket

# Create audit bucket with Object Lock
aws s3 mb s3://neoharbour-audit-bucket
aws s3api put-object-lock-configuration \
  --bucket neoharbour-audit-bucket \
  --object-lock-configuration ObjectLockEnabled=Enabled
```

### Environment Configuration
Update your `.env` file with AWS service endpoints:

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
```

### Validation and Testing
After configuration, validate your setup:

1. **Service Connection Test**
   - Navigate to "System Configuration → AWS Services"
   - Click "Test All Connections"
   - Verify all services show "Connected" status

2. **Permission Validation**
   - Run the built-in permission checker
   - Address any permission issues identified

3. **End-to-End Test**
   - Trigger a test investigation
   - Verify data flows through all services correctly

## User Management

### User Roles and Permissions

#### Available Roles
- **Admin**: Full system access including user management and configuration
- **Analyst**: Access to investigation workbench and case management
- **Demo User**: Limited access for demonstration purposes only
- **Viewer**: Read-only access to investigations and reports

#### Permission Matrix
| Feature | Admin | Analyst | Demo User | Viewer |
|---------|-------|---------|-----------|--------|
| User Management | ✓ | ✗ | ✗ | ✗ |
| AWS Configuration | ✓ | ✗ | ✗ | ✗ |
| Investigation Management | ✓ | ✓ | ✗ | ✗ |
| Demo System Control | ✓ | ✓ | ✓ | ✗ |
| View Reports | ✓ | ✓ | ✓ | ✓ |
| System Monitoring | ✓ | ✗ | ✗ | ✗ |

### User Management Operations

#### Creating New Users
1. **Navigate to User Management**
2. **Click "Create New User"**
3. **Fill in user details:**
   ```
   Email: user@company.com
   Role: Select appropriate role
   AWS Access Level: full|read_only|demo_only
   Permissions: Select specific permissions
   ```
4. **Send invitation email**
5. **User completes Clerk registration**

#### Modifying User Accounts
1. **Select user from user table**
2. **Click "Edit User"**
3. **Modify role, permissions, or status**
4. **Save changes**

#### Deactivating Users
1. **Select user from user table**
2. **Click "Deactivate User"**
3. **Confirm deactivation**
4. **User loses access immediately**

### Bulk User Operations
For large organizations, use bulk operations:

```bash
# Import users from CSV
python scripts/import_users.py --file users.csv --role analyst

# Export user list
python scripts/export_users.py --format csv --output users_export.csv
```

## System Configuration

### Core System Settings

#### Investigation Pipeline Configuration
```yaml
# Pipeline Settings
investigation_timeout: 300  # seconds
max_concurrent_investigations: 10
retry_attempts: 3
escalation_threshold: 0.7  # confidence score

# AI Analysis Settings
ai_provider: bedrock
model_temperature: 0.1
max_tokens: 4000
embedding_dimensions: 1536
```

#### Alert Processing Configuration
```yaml
# Alert Ingestion
max_alert_size: 1MB
supported_formats: [json, xml, csv]
deduplication_window: 300  # seconds
batch_size: 100

# False Positive Detection
false_positive_threshold: 0.8
automation_target: 0.8  # 80% automation rate
escalation_rules:
  - high_risk: manual_review
  - medium_risk: auto_close_with_review
  - low_risk: auto_close
```

### Integration Settings

#### SIEM/EDR Connector Configuration
1. **Navigate to System Configuration → Integrations**
2. **Select connector type (Sentinel, Splunk, Defender, etc.)**
3. **Configure connection parameters:**
   ```yaml
   sentinel:
     workspace_id: your-workspace-id
     tenant_id: your-tenant-id
     client_id: your-client-id
     client_secret: your-client-secret
     
   splunk:
     host: splunk.company.com
     port: 8089
     username: service-account
     password: secure-password
   ```

#### Customer AWS Data Sources
Configure customer AWS account integration:

1. **CloudTrail Configuration**
   ```yaml
   cloudtrail:
     bucket_name: customer-cloudtrail-logs
     prefix: AWSLogs/123456789012/CloudTrail/
     role_arn: arn:aws:iam::123456789012:role/NeoHarbourAccess
   ```

2. **GuardDuty Configuration**
   ```yaml
   guardduty:
     detector_id: your-detector-id
     region: ap-southeast-1
     role_arn: arn:aws:iam::123456789012:role/NeoHarbourAccess
   ```

## Demo System Configuration

### Demo Parameters

#### Basic Demo Settings
```yaml
demo_config:
  default_interval: 30  # seconds between alerts
  false_positive_rate: 0.8  # 80% false positives
  scenario_rotation: true
  max_concurrent_demos: 5
```

#### Scenario Library Management
1. **Navigate to Demo Configuration → Scenario Library**
2. **Available scenario types:**
   - Phishing campaigns
   - Ransomware attacks
   - Insider threats
   - Data exfiltration
   - Privilege escalation
   - Network intrusions

3. **Create custom scenarios:**
   ```yaml
   custom_scenario:
     name: "Banking Fraud Detection"
     type: "financial_fraud"
     complexity: "advanced"
     duration: 600  # seconds
     alerts_count: 15
     false_positive_rate: 0.75
   ```

#### Demo Presets
Configure presets for different audiences:

**Executive Demo Preset:**
```yaml
executive_demo:
  duration: 15  # minutes
  interval: 45  # seconds
  complexity: "basic"
  focus: ["automation_metrics", "roi_calculation"]
  scenarios: ["phishing", "insider_threat"]
```

**Technical Demo Preset:**
```yaml
technical_demo:
  duration: 30  # minutes
  interval: 20  # seconds
  complexity: "advanced"
  focus: ["ai_analysis", "investigation_details"]
  scenarios: ["all"]
```

### Demo Quality Controls
Ensure demo consistency and quality:

1. **Data Quality Validation**
   - Realistic alert content using LLM generation
   - Proper compliance mapping
   - Consistent investigation outcomes

2. **Performance Monitoring**
   - Demo response times
   - AWS service utilization
   - Concurrent demo limits

## Monitoring and Health Checks

### System Health Dashboard
The admin interface provides comprehensive monitoring:

#### Key Metrics
- **System Uptime**: Overall platform availability
- **Investigation Throughput**: Alerts processed per hour
- **Automation Rate**: Percentage of auto-closed investigations
- **AWS Service Status**: Real-time service health
- **Error Rates**: System and integration errors

#### Performance Monitoring
```yaml
performance_thresholds:
  investigation_time: 60  # seconds
  api_response_time: 2  # seconds
  database_query_time: 1  # second
  s3_upload_time: 5  # seconds
```

### Automated Health Checks
The system runs automated health checks every 5 minutes:

```python
# Health check endpoints
GET /api/health/system      # Overall system health
GET /api/health/aws         # AWS services status
GET /api/health/database    # Database connectivity
GET /api/health/ai          # AI service availability
```

### Log Management
Access and manage system logs:

1. **Application Logs**
   - Location: CloudWatch Logs
   - Retention: 30 days
   - Log levels: ERROR, WARN, INFO, DEBUG

2. **Audit Logs**
   - Location: S3 with Object Lock
   - Retention: 7 years (HKMA compliance)
   - Immutable and encrypted

3. **Access Logs**
   - User authentication events
   - API access patterns
   - Administrative actions

## Troubleshooting

### Common Issues and Solutions

#### AWS Connection Issues
**Problem**: AWS services showing "Disconnected" status
**Solutions**:
1. Verify AWS credentials are valid
2. Check IAM permissions
3. Confirm service availability in your region
4. Test network connectivity

#### Authentication Problems
**Problem**: Users cannot log in through Clerk
**Solutions**:
1. Verify Clerk service status
2. Check JWT configuration
3. Confirm user account status
4. Review role permissions

#### Demo System Issues
**Problem**: Demo data generation not working
**Solutions**:
1. Check Bedrock service availability
2. Verify demo configuration parameters
3. Review scenario library integrity
4. Test LLM content generation

#### Performance Issues
**Problem**: Slow investigation processing
**Solutions**:
1. Monitor AWS service limits
2. Check DynamoDB capacity
3. Review Lambda function performance
4. Optimize AI model parameters

### Diagnostic Tools
Use built-in diagnostic tools:

```bash
# System health check
python tools/health_check.py --comprehensive

# AWS service validation
python tools/validate_aws_service_integration.py

# Demo system testing
python tools/demo/test_generator.py --scenario phishing
```

### Support and Escalation
For issues requiring additional support:

1. **Check system logs** for error details
2. **Run diagnostic tools** to gather information
3. **Document the issue** with steps to reproduce
4. **Contact technical support** with diagnostic output

## Security Best Practices

### Access Control
- **Principle of Least Privilege**: Grant minimum required permissions
- **Regular Access Reviews**: Quarterly review of user permissions
- **Strong Authentication**: Enforce MFA for all admin accounts
- **Session Management**: Configure appropriate session timeouts

### Data Protection
- **Encryption at Rest**: All data encrypted using KMS
- **Encryption in Transit**: TLS 1.3 for all communications
- **Data Classification**: Proper handling of sensitive information
- **Backup Security**: Encrypted backups with access controls

### Monitoring and Auditing
- **Comprehensive Logging**: All administrative actions logged
- **Real-time Monitoring**: Automated alerting for security events
- **Regular Audits**: Monthly security posture reviews
- **Compliance Reporting**: Automated HKMA compliance reports

### Incident Response
- **Security Incident Procedures**: Documented response processes
- **Emergency Contacts**: 24/7 support contact information
- **Backup Procedures**: Regular backup testing and validation
- **Recovery Planning**: Documented disaster recovery procedures

---

## Appendix

### Configuration File Templates
See `config/environments/` for environment-specific templates.

### API Reference
Complete API documentation available at `/api/docs` when system is running.

### Compliance Mapping
Detailed HKMA SA-2 and TM-G-1 compliance mapping available in `docs/compliance/`.