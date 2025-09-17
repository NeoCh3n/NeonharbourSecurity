# Playbook: VPN Bruteforce

- Detection: Sentinel rule for >50 failed logins per minute from same ASN.
- Containment: Block offending IP at WAF/Firewall, enforce MFA check.
- Investigation: Review Okta/Entra logs for successful logins around same window.
- Communication: Notify NOC and regional SOC partner in Singapore.
- Post-incident: Update risk register, adjust conditional access policy.
