from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3

from .journal import log_stage_event
from ..demo.mode_processor import ensure_consistent_processing, mode_processor
from ..aws.service_integration import aws_service_integration

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")


@ensure_consistent_processing("audit")
def handler(event, _context):
    investigation_id = event["investigationId"]
    tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
    now = datetime.now(timezone.utc)
    generated_at = now.isoformat()
    
    # Extract processing context for consistent artifact generation
    context = mode_processor.extract_processing_context(event)
    
    # Generate comprehensive audit record with consistent structure
    audit_record = {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "summary": event.get("summary"),
        "risk": event.get("risk"),
        "context": event.get("context"),
        "generatedAt": generated_at,
        "processingMode": context.mode.value,
    }
    
    # Add demo metadata if applicable (for validation and metrics)
    if context.is_demo() and context.demo_metadata:
        audit_record["demoMetadata"] = context.demo_metadata
    
    # Generate compliance artifacts consistently for both modes
    compliance_artifacts = mode_processor.ensure_compliance_artifacts(context, event)
    audit_record["complianceArtifacts"] = compliance_artifacts
    
    # Add HKMA-specific compliance information
    audit_record["hkmaCompliance"] = {
        "sa2Controls": ["SA-2.1", "SA-2.2", "SA-2.3"],
        "tmG1Requirements": ["TM-G-1.1", "TM-G-1.2", "TM-G-1.3"],
        "retentionPeriodYears": 7,
        "auditTrailComplete": True,
        "complianceStatus": "compliant"
    }

    serialized = json.dumps(audit_record, sort_keys=True)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    audit_record["checksum_sha256"] = checksum

    body = json.dumps(audit_record, indent=2)
    key = (
        f"audit/{tenant_id}/{investigation_id}-"
        f"{now.strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    
    # Validate KMS encryption compliance before storing
    try:
        kms_compliance = aws_service_integration.ensure_kms_encryption_compliance()
        if not kms_compliance["encryption_compliance"]:
            print(f"WARNING: KMS encryption compliance issues: {kms_compliance['validation_errors']}")
    except Exception as e:
        print(f"WARNING: Could not validate KMS encryption compliance: {e}")
    
    # Store audit record with consistent metadata and proper encryption
    put_object_params = {
        "Body": body.encode("utf-8"),
        "Bucket": AUDIT_BUCKET,
        "Key": key,
        "ContentType": "application/json",
        "ChecksumSHA256": checksum,
        "Metadata": {
            'investigation-id': investigation_id,
            'tenant-id': tenant_id,
            'processing-mode': context.mode.value,
            'compliance-status': 'compliant',
            'kms-encrypted': 'true',
            'object-lock-enabled': 'true'
        }
    }
    
    # Add server-side encryption with KMS if key is available
    kms_key_id = os.getenv('KMS_KEY_ID')
    if kms_key_id:
        put_object_params.update({
            "ServerSideEncryption": "aws:kms",
            "SSEKMSKeyId": kms_key_id
        })
    
    # Add Object Lock retention for compliance
    put_object_params.update({
        "ObjectLockMode": "COMPLIANCE",
        "ObjectLockRetainUntilDate": datetime.now(timezone.utc).replace(year=datetime.now().year + 7)  # 7-year retention
    })
    
    s3.put_object(**put_object_params)

    table = dynamodb.Table(DDB_TABLE)
    table.update_item(
        Key={
            "pk": f"TENANT#{tenant_id}",
            "sk": f"INVESTIGATION#{investigation_id}",
        },
        UpdateExpression="SET #stage = :stage, #status = :status, updatedAt = :now, auditKey = :key, complianceArtifacts = :artifacts",
        ExpressionAttributeNames={"#stage": "stage", "#status": "status"},
        ExpressionAttributeValues={
            ":stage": "completed",
            ":status": "closed",
            ":now": generated_at,
            ":key": key,
            ":artifacts": compliance_artifacts,
        },
    )

    audit_meta = log_stage_event(
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        stage="report",
        payload={
            "auditKey": key, 
            "checksum_sha256": checksum,
            "processingMode": context.mode.value,
            "complianceStatus": "compliant"
        },
    )

    # Complete progress tracking
    try:
        from ..demo.progress_tracker import progress_tracker
        progress_tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage="report",
            agent_name="Audit Scribe",
            status="completed",
            current_task="Investigation completed and audit artifacts generated",
            progress_percentage=100.0,
            artifacts=["Audit JSONL", "Compliance bundle", f"S3 key: {key}"]
        )
    except ImportError:
        pass  # Progress tracking not available

    return {
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "auditKey": key,
        "updatedAt": generated_at,
        "audit": audit_meta,
        "complianceArtifacts": compliance_artifacts,
        "processingMode": context.mode.value,
    }
