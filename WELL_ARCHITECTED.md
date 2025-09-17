# Well-Architected Summary

## Operational Excellence
- Infrastructure codified in `infra/sam-template.yaml`; CI-friendly `make bootstrap|deploy|demo|teardown` targets.
- Comprehensive logging: CloudWatch dashboard, Step Functions execution logs, and per-stage JSONL audit records.
- Synthetic seeds (`tools/seed/`) enable deterministic demos and local troubleshooting without external credentials.

## Security
- End-to-end encryption with customer-managed KMS key (S3 Artifacts + Audit, DynamoDB SSE, SQS removed for minimal surface).
- Immutable audit store via S3 Object Lock, checksum-backed JSONL entries per transition, plus HKMA-focused compliance pack.
- Least-privilege IAM policies (LambdaScoped, EventBridge role only allowed to start the state machine) and connector fixtures avoiding secret sprawl.

## Reliability
- Step Functions retries (exponential backoff) on context/AI stages; DLQ stubs ready for future expansion.
- DynamoDB tables with point-in-time recovery; metrics table maintains historical KPI baselines for recovery validation.
- Synthetic demo path exercises full pipeline, providing quick health checks and KPI recomputation via `tools/metrics/recompute.py`.

## Performance Efficiency
- Serverless compute (Lambda, Step Functions) auto-scales with alert volume; DynamoDB PAY_PER_REQUEST handles bursty ingest.
- Connectors use rate limiters and fixtures to avoid overloading upstream SIEM/EDR APIs.
- Bedrock analyst selection allows switching to lighter/faster models (Claude 3 Haiku) with temperature control for concise output.

## Cost Optimization
- Pay-per-use services dominate; no always-on instances or containers.
- Audit bucket leverages Intelligent-Tiering for long-term storage; metrics table TTLs keep hot data lean.
- Local demo fixtures remove the need for paid third-party API hits during PoV evaluations.

## Sustainability
- Serverless architecture removes idle capacity and scales to zero outside investigations.
- Multi-tenant shared services minimise duplicated infrastructure per customer while maintaining isolation via DynamoDB partitions.
- Compliance automation reduces manual document production and rework during audits.
