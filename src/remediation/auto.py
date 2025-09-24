"""Safe auto-remediation placeholder for Phase A."""
from __future__ import annotations

import os
from datetime import datetime, timezone

import boto3

from ..pipeline.journal import log_stage_event
from ..demo.mode_processor import ensure_consistent_processing, mode_processor

DDB_TABLE = os.getenv("DDB_INVESTIGATIONS_TABLE", "AsiaAgenticSocInvestigations-dev")
dynamodb = boto3.resource("dynamodb")


@ensure_consistent_processing("remediation")
def handler(event, _context):
    investigation_id = event["investigationId"]
    tenant_id = event.get("tenantId") or os.getenv("DEFAULT_TENANT_ID", "default")
    now = datetime.now(timezone.utc).isoformat()
    
    # Extract processing context for consistent handling
    context = mode_processor.extract_processing_context(event)
    
    # Determine remediation action based on processing mode and risk level
    risk_level = event.get("risk", {}).get("level", "medium")
    is_false_positive = context.get_false_positive_hint()
    
    # Auto-remediation logic (consistent for both demo and live)
    if risk_level == "low" or is_false_positive:
        remediation_status = "auto_closed"
        remediation_reason = f"Automatically closed - {context.mode.value} mode low risk assessment"
        remediation_actions = ["Alert marked as false positive", "No further action required"]
    else:
        remediation_status = "escalated"
        remediation_reason = f"Escalated for human review - {context.mode.value} mode high risk assessment"
        remediation_actions = ["Escalated to SOC analyst", "Manual investigation required"]

    table = dynamodb.Table(DDB_TABLE)
    table.update_item(
        Key={
            "pk": f"TENANT#{tenant_id}",
            "sk": f"INVESTIGATION#{investigation_id}",
        },
        UpdateExpression="SET autoRemediation = :auto, updatedAt = :now, #stage = :stage",
        ExpressionAttributeNames={"#stage": "stage"},
        ExpressionAttributeValues={
            ":auto": {
                "status": remediation_status,
                "reason": remediation_reason,
                "actions": remediation_actions,
                "timestamp": now,
                "processing_mode": context.mode.value,
                "false_positive_hint": is_false_positive,
            },
            ":now": now,
            ":stage": "remediation",
        },
    )

    # Update progress tracking
    try:
        from ..demo.progress_tracker import progress_tracker
        progress_tracker.update_agent_progress(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            stage="remediation",
            agent_name="Auto Remediation",
            status="completed",
            current_task=f"Remediation action: {remediation_status}",
            progress_percentage=90.0,
            artifacts=[f"Remediation decision: {remediation_status}"]
        )
    except ImportError:
        pass  # Progress tracking not available

    audit_meta = log_stage_event(
        tenant_id=tenant_id,
        investigation_id=investigation_id,
        stage="respond-auto",
        payload={
            "mode": remediation_status, 
            "timestamp": now,
            "processing_mode": context.mode.value,
            "actions": remediation_actions
        },
    )

    return {
        **event,
        "autoRemediation": {
            "status": remediation_status,
            "reason": remediation_reason,
            "actions": remediation_actions,
            "timestamp": now,
            "processing_mode": context.mode.value,
        },
        "audit": audit_meta,
        "investigationId": investigation_id,
        "tenantId": tenant_id,
    }
