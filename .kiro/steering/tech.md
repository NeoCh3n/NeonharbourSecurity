# Technology Stack

## Core Infrastructure
- **AWS Serverless**: SAM (Serverless Application Model) for infrastructure as code
- **Orchestration**: AWS Step Functions for multi-agent workflow coordination
- **Compute**: AWS Lambda (Python 3.12) for pipeline stages
- **Storage**: DynamoDB for investigations/metrics, S3 for artifacts/audit logs
- **Security**: KMS encryption, IAM least-privilege policies, S3 Object Lock
- **Events**: EventBridge for alert ingestion and routing

## Programming Languages & Frameworks
- **Backend**: Python 3.12 with boto3 for AWS SDK
- **Frontend**: Streamlit for analyst workbench UI
- **API Layer**: Express.js (Node.js) thin facade over AWS services
- **React Frontend**: Vite + TypeScript + Clerk for authentication

## AI & ML
- **Primary AI Provider**: Amazon Bedrock (Claude 3 Haiku + Titan embeddings)
- **Alternative Providers**: Kiro, Amazon Q (stub implementations)
- **AI Interface**: Abstracted analyst interface in `src/ai/analyst.py`

## Development Tools
- **Code Quality**: Black (formatting), Ruff (linting), pytest (testing)
- **Package Management**: pip for Python, npm for Node.js
- **Documentation**: Markdown with Mermaid diagrams

## Common Commands

### Environment Setup
```bash
python3 -m venv .venv && source .venv/bin/activate
make bootstrap  # Install dependencies and ingest knowledge base
```

### Deployment
```bash
sam build       # Build Lambda packages
sam deploy --guided  # Deploy to AWS with prompts
sam delete --no-prompts  # Clean up resources
```

### Development Workflow
```bash
make demo       # Seed data and launch Streamlit UI
make test       # Run pytest suite
make fmt        # Format code with Black
make lint       # Check code with Ruff
make compliance # Generate HKMA compliance pack
make api        # Start Express.js API server
```

### Local Testing
```bash
python tools/seed/trigger_pipeline.py  # Trigger synthetic investigations
python tools/metrics/recompute.py      # Recalculate KPI metrics
streamlit run ui/app.py                 # Launch analyst workbench
```

## Environment Variables
Key configuration in `.env`:
- `AI_PROVIDER`: bedrock|kiro|amazonq
- `DDB_INVESTIGATIONS_TABLE`: DynamoDB table name
- `ARTIFACTS_BUCKET`: S3 bucket for reports
- `AUDIT_BUCKET`: S3 bucket for immutable logs
- `DEFAULT_TENANT_ID`: Default tenant identifier