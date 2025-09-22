# Project Structure

## Root Level Organization
- **Configuration**: `.env`, `.env.example`, `Makefile`, `requirements.txt`
- **Infrastructure**: `infra/sam-template.yaml` (AWS SAM template)
- **Documentation**: `*.md` files for architecture, compliance, deployment guides
- **Package Management**: `package-lock.json` for Node.js dependencies

## Source Code (`src/`)
Organized by functional domains following clean architecture principles:

### Core Pipeline (`src/pipeline/`)
Lambda handlers for Step Functions workflow stages:
- `ingest.py` - Normalize and persist incoming alerts
- `context.py` - Gather enrichment data from connectors
- `summarize.py` - AI-powered analysis and summary generation
- `risk.py` - Risk assessment and decision logic
- `adapt.py` - Learning and feedback capture
- `audit.py` - Final audit trail and compliance artifacts
- `journal.py` - Immutable logging utilities

### Multi-Agent System (`src/agents/`)
Agent abstractions and orchestration:
- `base.py` - Abstract Agent class and interfaces
- `orchestrator.py` - Multi-agent workflow coordination
- `analysis.py`, `execution.py`, `response.py` - Specialized agent implementations
- `messaging.py` - Inter-agent communication
- `registry.py` - Agent discovery and management

### External Integrations (`src/connectors/`)
Read-only adapters for security platforms:
- `sentinel.py`, `splunk.py` - SIEM connectors
- `defender.py`, `crowdstrike.py` - EDR connectors
- `entra.py`, `okta.py` - Identity providers
- `utils.py` - Shared HTTP client with rate limiting

### AI Services (`src/ai/`)
- `analyst.py` - Abstracted AI interface with Bedrock implementation

### Compliance (`src/compliance/`)
- `generate_pack.py` - HKMA compliance artifact generation

### Remediation (`src/remediation/`)
- `approval.py` - Human-in-the-loop approval workflows
- `auto.py` - Automated remediation actions (Phase A no-ops)

### API Layer (`src/api/`)
- `server.py` - FastAPI/Flask server for REST endpoints
- `data.py` - Data access layer abstractions

### Knowledge Management (`src/knowledge/`)
- `ingest.py` - Knowledge base ingestion and processing

## User Interfaces
- **Streamlit Workbench**: `ui/app.py` - Main analyst interface
- **React Frontend**: `clerk-react/` - Modern web UI with authentication
- **Express Backend**: `backend/` - Node.js API facade

## Supporting Directories
- **Documentation**: `docs/` - Detailed guides, templates, diagrams
- **Knowledge Base**: `knowledge/` - HKMA regulatory content and scenarios
- **Playbooks**: `playbooks/` - Incident response procedures
- **Tools**: `tools/` - Utilities for seeding data and metrics
- **Tests**: `tests/` - Pytest test suite with fixtures
- **Scripts**: `scripts/` - Deployment and maintenance scripts

## Naming Conventions
- **Python modules**: snake_case (e.g., `risk_assessment.py`)
- **Classes**: PascalCase (e.g., `AgentOrchestrator`)
- **Functions/variables**: snake_case (e.g., `process_investigation`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_TENANT_ID`)
- **AWS Resources**: PascalCase with prefixes (e.g., `AsiaAgenticSocInvestigations`)

## File Organization Patterns
- Each module should have a clear single responsibility
- Lambda handlers are thin wrappers around business logic
- Shared utilities go in dedicated modules (e.g., `utils.py`)
- Configuration and environment variables centralized in root `.env`
- Test files mirror source structure in `tests/` directory