# Demo Session Management System

The Demo Session Management System provides comprehensive session lifecycle management and real-time control for the Interactive Demo System. It enables product demonstrators to create, control, and monitor demo sessions with configurable parameters and real-time metrics tracking.

## Features

- **Session Lifecycle Management**: Create, pause, resume, and stop demo sessions
- **Real-time Parameter Adjustment**: Update demo parameters during active sessions
- **Preset Configurations**: Pre-defined demo configurations for different audiences
- **Metrics Tracking**: Real-time automation statistics and performance metrics
- **Multi-tenant Support**: Tenant-isolated session management
- **AWS Integration**: DynamoDB storage with KMS encryption

## Architecture

### Core Components

1. **DemoSessionManager**: Low-level DynamoDB operations and session persistence
2. **DemoSessionController**: High-level business logic and API operations
3. **Demo API Handler**: Lambda function for REST API endpoints
4. **Data Models**: Session, parameters, and metrics data structures

### Data Models

#### DemoSession
```python
@dataclass
class DemoSession:
    session_id: str
    created_at: datetime
    created_by: str
    tenant_id: str
    parameters: DemoParameters
    status: str  # "active" | "paused" | "stopped" | "error"
    metrics: DemoMetrics
    last_updated: Optional[datetime]
    error_message: Optional[str]
```

#### DemoParameters
```python
@dataclass
class DemoParameters:
    interval_seconds: float = 30.0
    false_positive_rate: float = 0.8
    complexity_level: str = "intermediate"  # "basic" | "intermediate" | "advanced"
    target_audience: str = "technical"      # "technical" | "executive" | "compliance"
    duration_minutes: Optional[int] = None
    scenario_types: List[str] = ["phishing", "malware", "insider_threat"]
```

#### DemoMetrics
```python
@dataclass
class DemoMetrics:
    alerts_generated: int = 0
    alerts_processed: int = 0
    auto_closed_count: int = 0
    escalated_count: int = 0
    automation_rate: float = 0.0
    avg_processing_time: float = 0.0
    session_duration: float = 0.0
```

## Usage

### Basic Session Management

```python
from demo.controller import DemoSessionController

# Initialize controller
controller = DemoSessionController()

# Start a demo session
result = controller.start_demo_session(
    created_by="user-123",
    tenant_id="tenant-456",
    preset_name="technical_deep_dive"
)

session_id = result['session_id']

# Update parameters in real-time
controller.update_session_parameters(session_id, {
    'interval_seconds': 15.0,
    'false_positive_rate': 0.9
})

# Pause session
controller.pause_demo_session(session_id)

# Resume session
controller.resume_demo_session(session_id)

# Stop session
controller.stop_demo_session(session_id)
```

### Custom Parameters

```python
# Start session with custom parameters
result = controller.start_demo_session(
    created_by="user-123",
    tenant_id="tenant-456",
    custom_parameters={
        'interval_seconds': 45.0,
        'false_positive_rate': 0.85,
        'complexity_level': 'advanced',
        'duration_minutes': 30,
        'scenario_types': ['ransomware', 'apt', 'insider_threat']
    }
)
```

### Metrics Updates

```python
# Update session metrics (typically called by demo data generator)
controller.update_session_metrics(session_id, {
    'alerts_generated': 25,
    'alerts_processed': 20,
    'auto_closed_count': 16,
    'escalated_count': 4
})
```

## Demo Presets

The system includes four pre-configured demo presets:

### Technical Deep Dive
- **Audience**: Technical stakeholders
- **Duration**: 45 minutes
- **Complexity**: Advanced
- **Interval**: 15 seconds
- **False Positive Rate**: 75%
- **Scenarios**: APT, insider threat, supply chain attacks

### Executive Overview
- **Audience**: Executive stakeholders
- **Duration**: 20 minutes
- **Complexity**: Basic
- **Interval**: 45 seconds
- **False Positive Rate**: 85%
- **Scenarios**: Phishing, malware, data exfiltration

### Compliance Focus
- **Audience**: Compliance officers
- **Duration**: 30 minutes
- **Complexity**: Intermediate
- **Interval**: 30 seconds
- **False Positive Rate**: 80%
- **Scenarios**: Regulatory violations, data breaches, insider threats

### Continuous Monitoring
- **Audience**: Technical stakeholders
- **Duration**: Unlimited
- **Complexity**: Basic
- **Interval**: 60 seconds
- **False Positive Rate**: 90%
- **Scenarios**: All scenario types

## API Endpoints

The system provides REST API endpoints via AWS Lambda:

### Session Management
- `POST /demo/sessions` - Create new session
- `GET /demo/sessions/{session_id}` - Get session status
- `GET /demo/sessions` - List active sessions
- `DELETE /demo/sessions/{session_id}` - Stop session

### Session Control
- `PUT /demo/sessions/{session_id}/status` - Pause/resume session
- `PUT /demo/sessions/{session_id}/parameters` - Update parameters
- `PUT /demo/sessions/{session_id}/metrics` - Update metrics

### Configuration
- `GET /demo/presets` - Get available presets
- `POST /demo/cleanup` - Clean up old sessions

### Example API Usage

```bash
# Create session
curl -X POST /demo/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "preset_name": "technical_deep_dive",
    "parameters": {
      "interval_seconds": 20.0
    }
  }'

# Get session status
curl -X GET /demo/sessions/{session_id}

# Update parameters
curl -X PUT /demo/sessions/{session_id}/parameters \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "interval_seconds": 30.0,
      "false_positive_rate": 0.85
    }
  }'

# Pause session
curl -X PUT /demo/sessions/{session_id}/status \
  -H "Content-Type: application/json" \
  -d '{"action": "pause"}'
```

## Database Schema

The system uses DynamoDB with the following table structure:

### DemoSessionsTable
- **Primary Key**: `session_id` (String)
- **Global Secondary Index**: `TenantStatusIndex`
  - **Partition Key**: `tenant_id` (String)
  - **Sort Key**: `status` (String)
- **TTL**: Automatic cleanup of old sessions
- **Encryption**: KMS encryption enabled

### Attributes
- `session_id`: Unique session identifier
- `created_at`: ISO timestamp of creation
- `created_by`: User ID who created the session
- `tenant_id`: Tenant identifier for multi-tenancy
- `parameters`: Demo configuration parameters (Decimal types for DynamoDB)
- `status`: Current session status
- `metrics`: Real-time session metrics (Decimal types for DynamoDB)
- `last_updated`: ISO timestamp of last update
- `error_message`: Optional error message for failed sessions

## Error Handling

The system provides comprehensive error handling:

### Parameter Validation
- Interval seconds: 1-300 seconds
- False positive rate: 0.0-1.0
- Duration minutes: Positive integer or null

### DynamoDB Operations
- Connection failures with retry logic
- Reserved keyword handling in update expressions
- Decimal type conversion for float values

### API Error Responses
- 400: Bad Request (invalid parameters, malformed JSON)
- 404: Not Found (session not found, invalid endpoint)
- 500: Internal Server Error (database errors, exceptions)

## Testing

The system includes comprehensive test coverage:

### Unit Tests
- Data model validation
- Parameter validation logic
- Session lifecycle operations
- Preset configurations

### Integration Tests
- DynamoDB operations with moto mocking
- API endpoint testing
- Error handling scenarios
- End-to-end workflows

### Running Tests
```bash
# Run all demo session tests
pytest tests/test_demo_session.py tests/test_demo_session_integration.py -v

# Run specific test categories
pytest tests/test_demo_session.py::TestDemoSessionManager -v
pytest tests/test_demo_session_integration.py::TestDemoSessionAPI -v
```

## Deployment

The demo session management system is deployed as part of the main SAM template:

### AWS Resources
- **Lambda Function**: `DemoSessionFunction` for API operations
- **DynamoDB Table**: `DemoSessionsTable` for session storage
- **API Gateway**: REST endpoints for session management
- **IAM Roles**: Least privilege access to DynamoDB and KMS

### Environment Variables
- `DDB_DEMO_SESSIONS_TABLE`: DynamoDB table name
- `DEFAULT_TENANT_ID`: Default tenant for sessions

### Deployment Commands
```bash
# Build and deploy
sam build
sam deploy --guided

# Update function code only
sam build && sam deploy --no-confirm-changeset
```

## Security Considerations

### Authentication & Authorization
- Clerk JWT validation for API access
- Role-based access control (RBAC)
- Tenant isolation for multi-tenancy

### Data Protection
- KMS encryption for DynamoDB storage
- Secure parameter handling
- Input validation and sanitization

### Access Control
- Least privilege IAM policies
- API Gateway throttling
- Session timeout and cleanup

## Monitoring & Observability

### CloudWatch Metrics
- Session creation/deletion rates
- API endpoint performance
- Error rates and types

### Logging
- Structured logging with correlation IDs
- Error tracking and alerting
- Performance monitoring

### Dashboards
- Real-time session status
- Demo usage analytics
- System health metrics

## Future Enhancements

### Planned Features
- Session templates and sharing
- Advanced metrics and analytics
- Integration with demo data generator
- Real-time WebSocket updates
- Session recording and playback

### Scalability Improvements
- DynamoDB auto-scaling
- Lambda concurrency optimization
- API Gateway caching
- Multi-region deployment