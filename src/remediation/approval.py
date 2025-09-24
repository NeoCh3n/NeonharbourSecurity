"""Human-in-the-loop approval placeholder for Phase B."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import boto3

from ..pipeline.journal import log_stage_event
from ..demo.mode_processor import ensure_consistent_processing, mode_processor

AUDIT_BUCKET = os.getenv("AUDIT_BUCKET", "asia-agentic-soc-audit")
S3 = boto3.client("s3")


@ensure_consistent_processing("approval")
def handler(event, _context):
    investigation_id = event.get("investigationId")
    tenant_id = event.get("tenantId")
    
    # Extract processing context for consistent handling
    context = mode_processor.extract_processing_context(event)
    
    approval_record = {
        "requestedAt": datetime.now(timezone.utc).isoformat(),
        "investigationId": investigation_id,
        "tenantId": tenant_id,
        "recommendedActions": event.get("summary", {}).get("recommended_actions", []),
        "status": "pending",
        "processingMode": context.mode.value,
        "notes": f"Phase B placeholder – integrate Slack/Teams approvals. Processing mode: {context.mode.value}",
    }
    
    # Add demo-specific context if applicable
    if context.is_demo():
        approval_record["demoMetadata"] = {
            "scenarioType": context.get_scenario_type(),
            "isFalsePositive": context.get_false_positive_hint(),
            "demoContext": context.demo_metadata
        }
    
    serialized = json.dumps(approval_record, sort_keys=True)
    checksum = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    key = (
        f"approvals/{approval_record['tenantId']}/"
        f"{approval_record['investigationId']}_"
        f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"
    )
    
    S3.put_object(
        Body=json.dumps(approval_record, indent=2).encode("utf-8"),
        Bucket=AUDIT_BUCKET,
        Key=key,
        ContentType="application/json",
        ChecksumSHA256=checksum,
        Metadata={
            'investigation-id': investigation_id,
            'tenant-id': tenant_id,
            'processing-mode': context.mode.value,
            'approval-status': 'pending'
        }
    )

    # Update progress tracking
    try:
        from ..demo.progress_tracker import progress_tracker
        progress_tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage="approval",
            agent_name="Human Approval",
            status="pending",
            current_task="Awaiting human approval for high-risk investigation",
            progress_percentage=85.0,
            artifacts=[f"Approval request: {key}"]
        )
    except ImportError:
        pass  # Progress tracking not available

    audit_meta = log_stage_event(
        tenant_id=approval_record["tenantId"] or "default",
        investigation_id=approval_record["investigationId"] or "unknown",
        stage="respond-hitl",
        payload={
            "artifact": key, 
            "status": "pending",
            "processing_mode": context.mode.value
        },
    )
    
    return {
        **event,
        "approval": {
            "status": "pending", 
            "artifact": key, 
            "audit": audit_meta,
            "processing_mode": context.mode.value,
        },
        "investigationId": investigation_id,
        "tenantId": tenant_id,
    }
