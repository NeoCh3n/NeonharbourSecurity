# Playbook: Cloud Console Compromise

1. Detect anomalous login (AWS GuardDuty / Azure Defender) from non-whitelisted region.
2. Disable temporary credentials, enforce MFA re-challenge.
3. Review CloudTrail / Activity Log for privilege escalation or data access.
4. Snapshot affected resources, tag for investigation.
5. Notify HKMA if customer data or critical services impacted.
