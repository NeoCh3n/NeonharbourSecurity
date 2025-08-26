#!/usr/bin/env bash
# compliance_pack.sh - Build placeholder compliance pack for HKMA requirements

set -euo pipefail

OUT_DIR="out"
PACK_NAME="compliance_pack_A"
PACK_DIR="$OUT_DIR/$PACK_NAME"
ARCHIVE="$OUT_DIR/${PACK_NAME}.tgz"

# Prepare directories
rm -rf "$PACK_DIR" "$ARCHIVE"
mkdir -p "$PACK_DIR"

# HKMA SA-2 / TM-G-1 control matrix placeholder
cat > "$PACK_DIR/HKMA_SA2_TM-G1_control_matrix.md" <<'CM'
# HKMA SA-2 / TM-G-1 Control Matrix

| Control | Description | Implementation Status |
|---------|-------------|-----------------------|
| SA-2    | *placeholder* | TBD |
| TM-G-1  | *placeholder* | TBD |
CM

# Data flow diagram placeholder
cat > "$PACK_DIR/data_flow_diagram.txt" <<'DFD'
Data Flow Diagram (placeholder)

[User] --> [System] --> [Database]
           ^                |
           |                v
        [Audit] <-------- [Logs]
DFD

# Encryption and retention policy placeholder
cat > "$PACK_DIR/encryption_retention_policy.md" <<'ERP'
# Encryption and Retention Policy

- **Encryption**: Placeholder for encryption standards and key management.
- **Retention**: Placeholder for data retention schedules and disposal procedures.
ERP

# Create archive
mkdir -p "$OUT_DIR"
tar -czf "$ARCHIVE" -C "$OUT_DIR" "$PACK_NAME"

echo "Compliance pack archived at $ARCHIVE"
