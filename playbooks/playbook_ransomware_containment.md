# Playbook: Ransomware Containment (HK)

## Trigger
- Sentinel high severity alert referencing ransomware signature.
- Defender detection of mass encryption behaviour.

## Actions
1. Convene IR lead and technology risk manager.
2. Isolate affected endpoints via Defender/CrowdStrike.
3. Disable compromised accounts in Entra ID / Okta.
4. Notify HKMA and CSTCB as per HK regulatory SLA.
5. Capture forensic images, preserve evidence in encrypted S3.

## Metrics
- Target MTTA < 10 minutes, MTTR < 4 hours.
