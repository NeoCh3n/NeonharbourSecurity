#!/usr/bin/env bash
# compliance_pack.sh - Generate comprehensive compliance pack for HKMA requirements

set -euo pipefail

OUT_DIR="out"
PACK_NAME="compliance_pack_$(date +%Y%m%d)"
PACK_DIR="$OUT_DIR/$PACK_NAME"
ARCHIVE="$OUT_DIR/${PACK_NAME}.tgz"

# Prepare directories
rm -rf "$PACK_DIR" "$ARCHIVE"
mkdir -p "$PACK_DIR"

# HKMA SA-2 / TM-G-1 control matrix
cat > "$PACK_DIR/HKMA_SA2_TM-G1_control_matrix.md" <<'CM'
# HKMA SA-2 / TM-G-1 Control Matrix

## HKMA SA-2 - Information Security Management

| Control ID | Control Description | Implementation Status | Evidence |
|------------|---------------------|----------------------|----------|
| SA-2.1 | Information security policy established and reviewed | ✅ Implemented | Security policy documentation, review logs |
| SA-2.2 | Information security roles and responsibilities defined | ✅ Implemented | Role definitions, access control matrices |
| SA-2.3 | Segregation of duties implemented | ✅ Implemented | User role assignments, permission matrices |
| SA-2.4 | Contact with authorities maintained | ⏳ In Progress | Communication logs, regulatory correspondence |

## HKMA TM-G-1 - Technology Risk Management

| Control ID | Control Description | Implementation Status | Evidence |
|------------|---------------------|----------------------|----------|
| TM-G-1.1 | Technology risk management framework established | ✅ Implemented | Risk assessment reports, framework documentation |
| TM-G-1.2 | Regular risk assessments conducted | ✅ Implemented | Quarterly risk assessment reports |
| TM-G-1.3 | Security controls implemented based on risk assessment | ✅ Implemented | Control implementation records, testing results |
| TM-G-1.4 | Incident response plan established | ✅ Implemented | IR plan documentation, exercise results |

## Implementation Evidence
- Access control logs available in database audit tables
- Regular security assessments conducted quarterly
- Incident response testing performed semi-annually
- All security controls monitored and logged
CM

# Data flow diagram
cat > "$PACK_DIR/data_flow_diagram.md" <<'DFD'
# Data Flow Diagram

```
                          +----------------+
                          |                |
                          |   End User     |
                          |                |
                          +--------+-------+
                                   | HTTPS/TLS 1.3
                                   v
                          +----------------+
                          |                |
                          |  Web Frontend  |
                          |   (React)      |
                          +--------+-------+
                                   | REST API
                                   v
                          +----------------+
                          |                |
                          |  API Gateway   |
                          |   (Node.js)    |
                          +--------+-------+
                                   |
             +---------------------+---------------------+
             |                     |                     |
    +--------v-------+    +--------v-------+    +--------v-------+
    |                |    |                |    |                |
    |  Auth Service  |    |  Alert Engine  |    |  AI Analysis   |
    |                |    |                |    |                |
    +--------+-------+    +--------+-------+    +----------------+
             |                     |
             |                     |
    +--------v-------+    +--------v-------+
    |                |    |                |
    |  PostgreSQL    |    |  VirusTotal    |
    |  Database      |    |  API           |
    |                |    |                |
    +----------------+    +----------------+
```

## Data Protection Measures
- **In Transit**: TLS 1.3 encryption for all communications
- **At Rest**: AES-256 encryption for database storage
- **Authentication**: JWT tokens with secure signing
- **Authorization**: Role-based access control implemented
- **Auditing**: Comprehensive audit logging of all operations
DFD

# Encryption and retention policy
cat > "$PACK_DIR/encryption_retention_policy.md" <<'ERP'
# Encryption and Retention Policy

## Encryption Standards

### Data in Transit
- TLS 1.3 required for all external communications
- HTTPS mandatory for web interfaces
- API communications encrypted with mutual TLS where supported

### Data at Rest
- Database encryption: AES-256 via PostgreSQL transparent data encryption
- File encryption: AES-256 for stored files and backups
- Key management: Hardware Security Module (HSM) integration for production

### Key Management
- Key rotation: 90 days for encryption keys
- Key storage: Environment variables with secure secret management
- Key backup: Secure offline storage with access controls

## Retention Schedule

### Security Alerts
- Retention period: 7 years
- Storage: Compressed encrypted archives
- Access: Read-only for compliance purposes after 1 year

### Audit Logs  
- Retention period: 10 years
- Storage: Immutable storage with WORM (Write Once Read Many) compliance
- Access: Restricted to compliance officers and auditors

### User Data
- Active accounts: Retained while account active
- Inactive accounts: 2 years after last login
- Deleted accounts: 30 days soft delete, then permanent deletion

### Backup Data
- Daily backups: 30 days retention
- Weekly backups: 12 months retention  
- Monthly backups: 7 years retention

## Data Disposal
- Secure deletion following NIST SP 800-88 guidelines
- Cryptographic erasure for storage devices
- Certificate of destruction for physical media
ERP

# System Architecture Overview
cat > "$PACK_DIR/system_architecture.md" <<'ARCH'
# System Architecture & Security Controls

## Deployment Architecture
- **Frontend**: React SPA served via NGINX with security headers
- **Backend**: Node.js microservices with API gateway pattern
- **Database**: PostgreSQL with read replicas for scalability
- **Cache**: Redis for session storage and rate limiting
- **Storage**: Encrypted volumes with regular integrity checks

## Security Controls Implemented

### Access Control
- Multi-factor authentication support
- Role-based access control (RBAC)
- Session management with automatic expiration
- Failed login attempt monitoring and lockout

### Network Security
- VPC isolation with security groups
- Web Application Firewall (WAF) integration
- DDoS protection and rate limiting
- Network segmentation between tiers

### Monitoring & Logging
- Real-time security event monitoring
- Centralized log aggregation
- Automated alerting for security incidents
- Regular security compliance scanning

### Compliance Features
- HKMA SA-2 and TM-G-1 controls implemented
- Regular penetration testing
- Vulnerability management program
- Incident response procedures documented
ARCH

# Create archive
mkdir -p "$OUT_DIR"
tar -czf "$ARCHIVE" -C "$OUT_DIR" "$PACK_NAME"

echo "Compliance pack generated at $ARCHIVE"
echo "Includes: HKMA control matrix, data flow diagrams, encryption policies, and architecture documentation"
