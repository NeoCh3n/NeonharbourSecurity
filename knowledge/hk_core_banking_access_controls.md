# Core Banking Access Controls (Hong Kong)

- Four-eye principle enforced for production NetBanking releases.
- Segregated operator roles: teller, supervisor, IT support, vendor.
- Privileged sessions proxied via CyberArk / BeyondTrust with HKMA-aligned retention.
- Daily reconciliation between HR roster and IAM entitlements.
- Emergency access (firecall) auto-expires in <4 hours with audit trail.
