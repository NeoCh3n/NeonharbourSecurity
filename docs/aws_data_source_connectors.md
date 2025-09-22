# AWS Data Source Connectors

This document describes the AWS data source integration layer that enables NeoHarbour Security to ingest real customer data from AWS security services.

## Overview

The AWS data source connectors provide a unified interface for ingesting security data from:

- **AWS CloudTrail**: Account operation audit logs
- **VPC Flow Logs**: Network traffic metadata analysis  
- **AWS GuardDuty**: Threat detection findings

All connectors follow the same patterns as existing security platform connectors and integrate seamlessly with the multi-agent investigation pipeline.

## Connectors

### CloudTrail Connector (`src/connectors/cloudtrail.py`)

Ingests AWS CloudTrail events for account operation audit analysis.

**Key Features:**
- Fetches recent CloudTrail events with configurable time ranges
- Filters for security-relevant events (logins, user management, policy changes)
- Identifies failed login attempts for security analysis
- Calculates risk scores based on event characteristics
- Transforms events to standardized format for investigation pipeline

**Usage:**
```python
from src.connectors.cloudtrail import CloudTrailClient

client = CloudTrailClient(region="us-east-1")

# Fetch recent security events
events = client.fetch_security_events(limit=50)

# Fetch failed login attempts
failed_logins = client.fetch_failed_logins(limit=20)

# Fetch all recent events with custom filters
all_events = client.fetch_recent_events(
    limit=100,
    hours_back=24,
    event_names=["ConsoleLogin", "AssumeRole"]
)
```

**Configuration:**
- `AWS_REGION`: AWS region for CloudTrail API calls
- `AWS_ACCESS_KEY_ID`: AWS access key (optional, uses default credentials)
- `AWS_SECRET_ACCESS_KEY`: AWS secret key (optional, uses default credentials)

### VPC Flow Logs Connector (`src/connectors/vpcflow.py`)

Processes VPC Flow Logs for network traffic metadata analysis.

**Key Features:**
- Fetches flow logs from S3 buckets with time-based partitioning
- Identifies suspicious traffic patterns (scanning, high volume transfers)
- Filters rejected/denied connections
- Parses standard VPC Flow Log format (version 2+)
- Calculates risk scores based on traffic characteristics

**Usage:**
```python
from src.connectors.vpcflow import VPCFlowLogsClient

client = VPCFlowLogsClient(
    region="us-east-1",
    s3_bucket="my-vpc-flow-logs-bucket"
)

# Fetch recent flow logs
flow_logs = client.fetch_recent_flow_logs(limit=100, hours_back=1)

# Fetch suspicious traffic patterns
suspicious = client.fetch_suspicious_traffic(limit=50)

# Fetch rejected connections
rejected = client.fetch_rejected_connections(limit=30)

# Fetch high-volume flows (potential data exfiltration)
high_volume = client.fetch_high_volume_flows(limit=20, byte_threshold=10000000)
```

**Configuration:**
- `AWS_REGION`: AWS region for S3 API calls
- `VPC_FLOW_LOGS_BUCKET`: S3 bucket containing VPC Flow Logs
- Flow logs must be stored with standard time-based partitioning

### GuardDuty Connector (`src/connectors/guardduty.py`)

Ingests AWS GuardDuty threat detection findings.

**Key Features:**
- Fetches GuardDuty findings with severity and time filtering
- Auto-discovers GuardDuty detector IDs
- Categorizes threats by type (malware, cryptocurrency mining, reconnaissance)
- Calculates remediation priorities based on severity and confidence
- Transforms findings to standardized format with threat intelligence

**Usage:**
```python
from src.connectors.guardduty import GuardDutyClient

client = GuardDutyClient(
    region="us-east-1",
    detector_id="12345678901234567890123456789012"  # Optional, auto-discovered
)

# Fetch recent findings
findings = client.fetch_recent_findings(limit=50, hours_back=24)

# Fetch high severity findings only
high_severity = client.fetch_high_severity_findings(limit=20)

# Fetch specific threat types
malware = client.fetch_malware_findings(limit=10)
crypto = client.fetch_cryptocurrency_findings(limit=10)
recon = client.fetch_reconnaissance_findings(limit=10)

# Fetch by custom finding types
custom = client.fetch_findings_by_type([
    "Backdoor:EC2/C&CActivity.B",
    "Trojan:EC2/DropPoint"
], limit=25)
```

**Configuration:**
- `AWS_REGION`: AWS region for GuardDuty API calls
- `GUARDDUTY_DETECTOR_ID`: GuardDuty detector ID (optional, auto-discovered)

## Integration with Investigation Pipeline

All AWS connectors return data in a standardized format compatible with the existing multi-agent investigation pipeline:

```python
{
    "id": "unique-identifier",
    "timestamp": "2024-01-15T10:30:00Z",
    "source_type": "cloudtrail|vpc_flow_logs|guardduty",
    "severity": "low|medium|high",
    "risk_score": 0.75,  # 0.0-1.0 scale
    # ... source-specific fields
}
```

### EventBridge Integration

To integrate with the existing EventBridge → Step Functions workflow:

```python
import boto3
from src.connectors.cloudtrail import CloudTrailClient

# Initialize clients
eventbridge = boto3.client('events')
cloudtrail_client = CloudTrailClient()

# Fetch high-risk events
events = cloudtrail_client.fetch_security_events(limit=10)

# Send to EventBridge for investigation pipeline
for event in events:
    if event['risk_score'] >= 0.5:  # High risk threshold
        eventbridge.put_events(
            Entries=[{
                'Source': 'neoharbour.aws.cloudtrail',
                'DetailType': 'Security Event',
                'Detail': json.dumps(event)
            }]
        )
```

## Fixture Mode

All connectors support fixture mode for development and testing when AWS credentials are not available:

- CloudTrail: `tools/seed/cloudtrail_events.json`
- VPC Flow Logs: `tools/seed/vpc_flow_logs.json`  
- GuardDuty: `tools/seed/guardduty_findings.json`

Fixture mode is automatically enabled when AWS credentials are missing or invalid.

## Testing

Run the comprehensive test suite:

```bash
python -m pytest tests/test_aws_connectors.py -v
```

Run the demo script:

```bash
python examples/aws_data_source_demo.py
```

## Security Considerations

### IAM Permissions

Each connector requires specific IAM permissions:

**CloudTrail Connector:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudtrail:LookupEvents"
            ],
            "Resource": "*"
        }
    ]
}
```

**VPC Flow Logs Connector:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::your-vpc-flow-logs-bucket",
                "arn:aws:s3:::your-vpc-flow-logs-bucket/*"
            ]
        }
    ]
}
```

**GuardDuty Connector:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "guardduty:ListDetectors",
                "guardduty:ListFindings",
                "guardduty:GetFindings"
            ],
            "Resource": "*"
        }
    ]
}
```

### Cross-Account Access

For customer deployments, use cross-account IAM roles:

1. Customer creates IAM role in their account with required permissions
2. Customer adds trust relationship to NeoHarbour Security account
3. NeoHarbour assumes role to access customer data sources

### Data Privacy

- All connectors are read-only and never modify customer data
- Data is processed in-memory and not permanently stored unless explicitly configured
- All API calls respect AWS service rate limits and best practices
- Sensitive data is handled according to HKMA compliance requirements

## Troubleshooting

### Common Issues

**"No module named 'boto3'"**
- Install dependencies: `pip install -r requirements.txt`

**"Parameter validation failed: Unknown parameter"**
- Check AWS SDK version compatibility
- Verify API parameter names match current AWS API specification

**"Access Denied" errors**
- Verify IAM permissions are correctly configured
- Check AWS credentials are valid and not expired
- Ensure cross-account trust relationships are properly set up

**"Fixture file not found"**
- Ensure fixture files exist in `tools/seed/` directory
- Check file permissions and JSON format validity

### Debug Mode

Enable debug logging for troubleshooting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)

client = CloudTrailClient()
events = client.fetch_recent_events(limit=5)
```

## Next Steps

1. **Configure AWS Credentials**: Set up proper IAM roles and credentials for production use
2. **EventBridge Integration**: Route high-risk findings through Step Functions workflow  
3. **Real-time Processing**: Implement continuous ingestion for live customer data
4. **Monitoring**: Add CloudWatch metrics and alarms for connector health
5. **Scaling**: Implement parallel processing for high-volume data sources