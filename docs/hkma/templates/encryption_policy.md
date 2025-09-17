# Encryption Policy Draft (HK)

- **Scope**: Customer data, telemetry, backups, audit logs.
- **In Transit**: TLS 1.3 minimum with mutual TLS for partner APIs.
- **At Rest**: AWS KMS CMKs, rotation 90 days, AWS S3 SSE-KMS, DynamoDB encryption enabled.
- **Key Management**: Segregated duties between security engineering and platform teams.
- **Monitoring**: CloudWatch + Security Hub alerts for KMS policy changes.
