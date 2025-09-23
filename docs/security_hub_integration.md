# Security Hub Integration and Cross-Account Access Management

## Overview

This document describes the Security Hub integration capabilities implemented for the Interactive Demo System. The integration provides secure, cross-account access to AWS Security Hub findings with comprehensive error handling, retry logic, and compliance features.

## Components

### 1. Security Hub Connector (`src/connectors/securityhub.py`)

The Security Hub connector provides:

- **Aggregated Security Findings**: Ingests findings from multiple AWS security services
- **Cross-Account Role Support**: Secure access to customer AWS accounts
- **Comprehensive Filtering**: Filter by severity, compliance status, product source
- **Risk Assessment**: Automatic risk scoring and threat categorization
- **Compliance Mapping**: Extract compliance frameworks (PCI-DSS, NIST, CIS, etc.)

#### Key Methods

```python
# Fetch recent findings with filtering
findings = client.fetch_recent_findings(
    limit=50,
    hours_back=24,
    severity_filter=["HIGH", "CRITICAL"],
    compliance_status_filter=["FAILED"]
)

# Get critical severity findings
critical_findings = client.fetch_critical_findings(limit=20)

# Get compliance-related findings
compliance_findings = client.fetch_compliance_findings(
    standards=["aws-foundational-security-standard"],
    limit=30
)

# Get findings from specific security products
product_findings = client.fetch_findings_by_product([
    "arn:aws:securityhub:us-east-1::product/aws/guardduty",
    "arn:aws:securityhub:us-east-1::product/aws/config"
], limit=25)
```

### 2. Cross-Account Validator (`src/connectors/cross_account_validator.py`)

Provides validation and setup guidance for cross-account access:

- **Access Validation**: Test cross-account role assumption and service access
- **Setup Guides**: Generate IAM policies and setup instructions
- **Permission Verification**: Validate required permissions for each service
- **Troubleshooting**: Detailed error analysis and remediation guidance

#### Key Methods

```python
# Validate Security Hub access
result = validator.validate_security_hub_access(
    customer_account_id="123456789012",
    role_arn="arn:aws:iam::123456789012:role/NeoHarbourSecurityHubAccess",
    external_id="neoharbour-123456789012"
)

# Generate setup guide
guide = validator.generate_security_hub_setup_guide("123456789012")

# Multi-service setup guide
multi_guide = validator.generate_multi_service_setup_guide("123456789012")
```

### 3. Secure Ingestion Pipeline (`src/connectors/secure_ingestion_pipeline.py`)

Provides robust data ingestion with error handling and retry logic:

- **Batch Processing**: Configurable batch sizes for efficient ingestion
- **Retry Logic**: Exponential backoff with configurable retry parameters
- **Error Handling**: Comprehensive error categorization and recovery
- **Progress Tracking**: Real-time ingestion status and metrics
- **Circuit Breaker**: Automatic failure detection and prevention

#### Key Features

```python
# Configure ingestion
config = IngestionConfig(
    source_type="securityhub",
    customer_account_id="123456789012",
    role_arn="arn:aws:iam::123456789012:role/NeoHarbourSecurityHubAccess",
    external_id="neoharbour-123456789012",
    batch_size=50,
    max_retries=3,
    retry_delay_seconds=1.0,
    retry_backoff_multiplier=2.0,
    max_retry_delay_seconds=60.0
)

# Start ingestion with progress callback
result = await pipeline.ingest_security_hub_findings(
    config=config,
    progress_callback=lambda r: print(f"Status: {r.status}")
)
```

## Cross-Account Setup

### Customer Account Setup

1. **Enable Security Hub**
   ```bash
   aws securityhub enable-security-hub --region us-east-1
   ```

2. **Create IAM Role**
   ```bash
   # Create trust policy
   cat > trust-policy.json << 'EOF'
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "AWS": "arn:aws:iam::NEOHARBOUR_ACCOUNT:root"
         },
         "Action": "sts:AssumeRole",
         "Condition": {
           "StringEquals": {
             "sts:ExternalId": "neoharbour-CUSTOMER_ACCOUNT"
           }
         }
       }
     ]
   }
   EOF

   # Create role
   aws iam create-role \
     --role-name NeoHarbourSecurityHubAccess \
     --assume-role-policy-document file://trust-policy.json
   ```

3. **Attach Permissions Policy**
   ```bash
   # Create permissions policy
   cat > permissions-policy.json << 'EOF'
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "securityhub:DescribeHub",
           "securityhub:GetFindings",
           "securityhub:GetInsights",
           "securityhub:GetInsightResults",
           "securityhub:ListEnabledProductsForImport",
           "securityhub:DescribeStandards",
           "securityhub:GetEnabledStandards"
         ],
         "Resource": "*"
       }
     ]
   }
   EOF

   # Create and attach policy
   aws iam create-policy \
     --policy-name NeoHarbourSecurityHubAccessPolicy \
     --policy-document file://permissions-policy.json

   aws iam attach-role-policy \
     --role-name NeoHarbourSecurityHubAccess \
     --policy-arn arn:aws:iam::CUSTOMER_ACCOUNT:policy/NeoHarbourSecurityHubAccessPolicy
   ```

### NeoHarbour Configuration

Configure the Security Hub connector with customer role details:

```python
client = SecurityHubClient(
    region="us-east-1",
    cross_account_role_arn="arn:aws:iam::123456789012:role/NeoHarbourSecurityHubAccess"
)
```

## Security Features

### Data Protection
- **Encryption in Transit**: All API calls use TLS/SSL encryption
- **Credential Security**: No persistent storage of customer credentials
- **Session Management**: Automatic token rotation and expiration
- **Audit Logging**: Comprehensive logging of all access attempts

### Access Control
- **Least Privilege**: Minimal required permissions for each service
- **External ID**: Additional security layer for role assumption
- **Cross-Account Isolation**: Secure separation between customer accounts
- **Permission Validation**: Automatic verification of required permissions

### Compliance
- **Framework Support**: PCI-DSS, NIST 800-53, CIS, AWS Foundational, SOC 2, ISO 27001
- **Audit Trail**: Immutable logs with S3 Object Lock
- **Data Residency**: Configurable regional data processing
- **Compliance Mapping**: Automatic extraction of compliance requirements

## Error Handling

### Common Error Scenarios

| Error | Description | Resolution |
|-------|-------------|------------|
| `AccessDenied` | Insufficient permissions | Verify IAM role permissions and trust relationship |
| `InvalidAccessException` | Security Hub not enabled | Enable Security Hub in customer account |
| `ThrottlingException` | API rate limit exceeded | Automatic retry with exponential backoff |
| `AssumeRoleFailure` | Cannot assume cross-account role | Check role ARN, external ID, and trust policy |

### Retry Strategy

- **Initial Delay**: 1.0 seconds
- **Backoff Multiplier**: 2.0x
- **Maximum Delay**: 60 seconds
- **Maximum Retries**: 3 attempts
- **Exponential Backoff**: 1s → 2s → 4s → 8s

### Circuit Breaker

- **Error Threshold**: 5 consecutive errors
- **Automatic Recovery**: Resume after successful operations
- **Monitoring**: Real-time error rate tracking
- **Alerting**: Automated failure notifications

## Testing

### Unit Tests
Run the comprehensive test suite:

```bash
python -m pytest tests/test_securityhub_connector.py -v
```

### Integration Demo
Run the integration demo:

```bash
python examples/security_hub_integration_demo.py
```

### Validation Testing
Test cross-account access validation:

```python
validator = CrossAccountValidator()
result = validator.validate_security_hub_access(
    customer_account_id="123456789012",
    role_arn="arn:aws:iam::123456789012:role/TestRole"
)
print(f"Validation result: {result['valid']}")
```

## Monitoring and Metrics

### Real-Time Metrics
- **Ingestion Status**: Active, completed, failed ingestions
- **Processing Rate**: Records per second, batch completion time
- **Error Rate**: Failed requests, retry attempts
- **Success Rate**: Successful ingestions, data quality metrics

### Performance Monitoring
- **Latency**: API response times, processing duration
- **Throughput**: Records processed per minute/hour
- **Resource Usage**: Memory, CPU utilization
- **Queue Depth**: Pending ingestion requests

### Alerting
- **Failure Alerts**: Ingestion failures, access denied errors
- **Performance Alerts**: High latency, low throughput
- **Compliance Alerts**: Policy violations, audit failures
- **Security Alerts**: Unauthorized access attempts

## Best Practices

### Security
1. **Regular Rotation**: Rotate external IDs and review access permissions
2. **Monitoring**: Implement comprehensive logging and alerting
3. **Validation**: Regular validation of cross-account access
4. **Least Privilege**: Minimize permissions to required actions only

### Performance
1. **Batch Sizing**: Optimize batch sizes based on data volume
2. **Rate Limiting**: Respect AWS service limits and implement backoff
3. **Caching**: Cache frequently accessed data to reduce API calls
4. **Parallel Processing**: Use concurrent ingestion for multiple accounts

### Reliability
1. **Error Handling**: Implement comprehensive error recovery
2. **Retry Logic**: Use exponential backoff for transient failures
3. **Circuit Breaker**: Prevent cascade failures with automatic cutoffs
4. **Health Checks**: Regular validation of service connectivity

## Troubleshooting

### Common Issues

1. **Role Assumption Failures**
   - Verify trust relationship configuration
   - Check external ID matches exactly
   - Ensure NeoHarbour account ID is correct

2. **Permission Denied Errors**
   - Verify all required permissions are attached
   - Check resource-level permissions if applicable
   - Validate policy syntax and conditions

3. **Service Not Enabled**
   - Enable Security Hub in target region
   - Verify service is active and configured
   - Check for organizational SCPs blocking access

4. **Rate Limiting**
   - Reduce batch sizes and request frequency
   - Implement proper retry logic with backoff
   - Consider request distribution across time

### Debug Mode

Enable debug logging for detailed troubleshooting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)

client = SecurityHubClient(region="us-east-1")
findings = client.fetch_recent_findings(limit=10)
```

## Future Enhancements

### Planned Features
- **Multi-Region Support**: Automatic discovery and ingestion across regions
- **Advanced Filtering**: Custom query language for complex filtering
- **Real-Time Streaming**: WebSocket-based real-time finding updates
- **ML Integration**: Machine learning-based finding prioritization

### Performance Improvements
- **Connection Pooling**: Reuse connections for better performance
- **Async Processing**: Full async/await support for concurrent operations
- **Caching Layer**: Redis-based caching for frequently accessed data
- **Compression**: Data compression for large finding payloads

### Security Enhancements
- **MFA Support**: Multi-factor authentication for sensitive operations
- **Encryption at Rest**: Customer-managed keys for stored data
- **Network Isolation**: VPC endpoint support for private connectivity
- **Audit Enhancement**: Detailed audit trails with tamper detection