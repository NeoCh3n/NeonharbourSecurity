# Data Retention Policy Draft (HK)

- **Security Alerts**: 7 years (S3 Glacier Deep Archive, WORM lock).
- **Audit Logs**: 10 years, daily digest into immutable bucket.
- **Customer Data**: Active tenancy + 2 years post offboarding.
- **Backups**: Daily (30 days), Weekly (12 months), Monthly (7 years).
- **Destruction**: Cryptographic erase aligned with NIST SP 800-88, with destruction certificates stored in audit bucket.
