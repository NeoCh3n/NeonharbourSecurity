# Playbook: API Key Leak Response

- Trigger: Git leak detector or CrowdStrike detection for token misuse.
- Contain: Revoke API keys, rotate secrets in AWS Secrets Manager / Azure Key Vault.
- Investigate: Search Splunk for abuse traces, correlate with Okta sessions.
- Notify impacted partners, update service tokens, document SoD review.
- Feed lessons learned into Detection Advisor backlog.
