# Demo Data Generation Infrastructure

The Demo Data Generation Infrastructure provides realistic, LLM-powered security alert generation for NeoHarbour Security demonstrations. This system enables continuous generation of diverse attack scenarios while maintaining authentic Hong Kong financial institution context.

## Overview

The demo system consists of three main components:

1. **Core Demo Data Generator** - LLM-integrated alert generation engine
2. **Scenario Template System** - Pre-defined attack patterns for different threat types
3. **Alert Variation Engine** - Ensures diversity and realistic variations

## Key Features

- **LLM-Powered Content Generation**: Uses Amazon Bedrock (Claude 3 Haiku) for realistic alert content
- **10 Attack Scenario Types**: Phishing, ransomware, insider threats, APT, cloud security, and compliance scenarios
- **Hong Kong Financial Context**: Authentic naming patterns, IP ranges, and HKMA compliance references
- **False Positive Simulation**: Configurable false positive rates (default 80%) to demonstrate automation
- **Continuous Generation**: Thread-based continuous alert generation with configurable intervals
- **Session Management**: Start, stop, pause, and resume demo sessions with real-time status tracking

## Available Scenario Types

| Scenario Type | Attack Vector | HKMA Relevance |
|---------------|---------------|----------------|
| `phishing_email` | Email-based credential harvesting | SA-2 Section 4.2 - Email security controls |
| `spear_phishing` | Targeted phishing against executives | TM-G-1 Section 3.1 - Senior management awareness |
| `ransomware_encryption` | File encryption with ransom demand | SA-2 Section 5.3 - Business continuity |
| `ransomware_lateral_movement` | Ransomware spreading across network | SA-2 Section 4.4 - Network segmentation |
| `insider_data_exfiltration` | Unauthorized data access and download | SA-2 Section 6.2 - Privileged access monitoring |
| `insider_privilege_abuse` | Abuse of administrative privileges | TM-G-1 Section 4.2 - Privileged access management |
| `apt_reconnaissance` | Network reconnaissance and enumeration | SA-2 Section 4.1 - Network monitoring |
| `apt_persistence` | Establishing persistent access mechanisms | SA-2 Section 4.3 - Endpoint protection |
| `cloud_credential_compromise` | Compromised cloud service credentials | SA-2 Section 7.1 - Cloud security |
| `data_privacy_violation` | Unauthorized personal data access | PDPO compliance and SA-2 Section 6.1 |

## Demo Presets

The system includes pre-configured demo presets for different audiences:

### Technical Deep Dive
- **Duration**: 30 minutes
- **Scenarios**: All attack types
- **Interval**: 45 seconds
- **False Positive Rate**: 75%
- **Target**: Technical teams and security analysts

### Executive Overview
- **Duration**: 15 minutes
- **Scenarios**: High-impact threats (ransomware, insider threats, privacy violations)
- **Interval**: 60 seconds
- **False Positive Rate**: 80%
- **Target**: C-level executives and business stakeholders

### HKMA Compliance Focus
- **Duration**: 20 minutes
- **Scenarios**: Compliance-relevant scenarios
- **Interval**: 90 seconds
- **False Positive Rate**: 70%
- **Target**: Compliance officers and auditors

### SOC Analyst Training
- **Duration**: 45 minutes
- **Scenarios**: Mixed training scenarios
- **Interval**: 30 seconds
- **False Positive Rate**: 85%
- **Target**: SOC analyst training and skill development

### Quick Demo
- **Duration**: 5 minutes
- **Scenarios**: Phishing and ransomware
- **Interval**: 20 seconds
- **False Positive Rate**: 80%
- **Target**: Quick presentations and proof-of-concept

## Usage Examples

### Basic Usage

```python
from src.demo.generator import DemoDataGenerator

# Initialize generator
generator = DemoDataGenerator()

# Generate single alert
alert = generator.generate_single_alert(
    scenario_type="phishing_email",
    risk_level="auto"  # or "low"/"high"
)

# Send to investigation pipeline
generator.send_alert_to_pipeline(alert)
```

### Continuous Generation

```python
# Start continuous generation
session_id = generator.start_continuous_generation(
    scenario_types=["phishing_email", "ransomware_encryption"],
    interval_seconds=30.0,
    false_positive_rate=0.8,
    duration_minutes=15
)

# Monitor session
status = generator.get_session_status(session_id)
print(f"Generated {status['alerts_generated']} alerts")

# Stop generation
generator.stop_generation(session_id)
```

### Using Demo Presets

```python
from src.demo.integration import DemoPipelineIntegration

integration = DemoPipelineIntegration()

# Get available presets
presets = integration.create_demo_preset_configurations()
executive_preset = presets["executive_overview"]

# Start demo with preset
session_id = generator.start_continuous_generation(
    scenario_types=executive_preset["scenario_types"],
    interval_seconds=executive_preset["interval_seconds"],
    false_positive_rate=executive_preset["false_positive_rate"],
    duration_minutes=executive_preset["duration_minutes"]
)
```

## Integration with Existing Pipeline

The demo system integrates seamlessly with the existing NeoHarbour Security pipeline:

1. **EventBridge Integration**: Demo alerts are sent via EventBridge with source `asia.agentic.soc.demo`
2. **Step Functions Processing**: Demo alerts flow through the same 6-agent investigation pipeline
3. **Demo Metadata**: Alerts include `isDemo: true` and false positive indicators for metrics
4. **Real AWS Services**: Uses actual DynamoDB, S3, Bedrock, and other AWS services for authentic performance

## Alert Structure

Generated demo alerts follow this structure:

```json
{
  "alert_id": "demo-abc123",
  "investigation_id": "INV-20240212-151030-abc1",
  "tenant_id": "demo-session-xyz",
  "source": "sentinel",
  "title": "Suspicious email with credential harvesting attempt",
  "description": "Email detected with suspicious links...",
  "severity": "High",
  "risk_level": "high",
  "entities": [
    {"type": "email", "name": "staff123@neonharbour.hk"},
    {"type": "sender", "name": "phishing456@fake-domain.com"}
  ],
  "tactics": ["InitialAccess", "CredentialAccess"],
  "timestamp": "2024-02-12T15:10:30Z",
  "scenario_type": "phishing_email",
  "is_false_positive": false,
  "confidence_score": 0.8,
  "raw_data": {...}
}
```

## Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=ap-southeast-1
BEDROCK_REGION=ap-southeast-1
BEDROCK_TEXT_MODEL=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_EMBED_MODEL=amazon.titan-embed-text-v2

# EventBridge Configuration
EVENT_BUS_NAME=AsiaAgenticSocBus
DEFAULT_TENANT_ID=hk-demo
```

### Variation Configuration

```python
from src.demo.variations import VariationConfig

config = VariationConfig(
    time_variance_hours=24,      # Timestamp variation range
    severity_variation=True,     # Enable severity randomization
    entity_randomization=True,   # Enable entity name randomization
    source_rotation=True,        # Enable source system rotation
    geographic_variation=True    # Enable Hong Kong IP generation
)
```

## Testing

Run the demo system tests:

```bash
# Run all demo system tests
python -m pytest tests/test_demo_system.py -v

# Test basic functionality without AWS
python tools/demo/test_generator.py
```

## Metrics and Monitoring

The demo system provides comprehensive metrics:

- **Session Metrics**: Total alerts, false positive rate, automation rate
- **Alert Metrics**: Processing times, confidence scores, escalation decisions
- **Performance Metrics**: Alerts per minute, automation accuracy

## Security Considerations

- **No Real Threats**: All generated alerts are synthetic and safe
- **Isolated Tenants**: Demo sessions use isolated tenant IDs
- **Audit Trail**: All demo activities are logged with demo metadata
- **Resource Limits**: Configurable limits prevent resource exhaustion

## Troubleshooting

### Common Issues

1. **AWS Credentials**: Ensure AWS credentials are configured for Bedrock access
2. **EventBridge Permissions**: Verify permissions to publish to the event bus
3. **Memory Usage**: Long-running sessions may accumulate memory; restart periodically
4. **Rate Limits**: Bedrock has rate limits; adjust intervals if throttling occurs

### Debug Mode

Enable debug logging:

```python
import logging
logging.getLogger('src.demo').setLevel(logging.DEBUG)
```

## Future Enhancements

- **Custom Scenario Builder**: UI for creating custom attack scenarios
- **Real-time Metrics Dashboard**: Live visualization of demo metrics
- **Advanced Variations**: ML-powered content variations
- **Multi-language Support**: Scenarios in Traditional Chinese for Hong Kong context
- **Integration Testing**: Automated end-to-end demo validation