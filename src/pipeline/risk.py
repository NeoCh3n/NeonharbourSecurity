from __future__ import annotations

from ..agents import get_orchestrator


def handler(event, _context):
    orchestrator = get_orchestrator()
    
    # Initialize progress tracking if not already done
    investigation_id = event.get("investigationId")
    tenant_id = event.get("tenantId")
    
    if investigation_id and tenant_id:
        try:
            from ..demo.progress_tracker import progress_tracker
            # Ensure progress tracking is initialized
            existing_progress = progress_tracker.get_investigation_progress(investigation_id, tenant_id)
            if not existing_progress:
                is_demo = event.get("alert", {}).get("isDemo", False)
                progress_tracker.start_investigation_tracking(investigation_id, tenant_id, is_demo)
        except ImportError:
            pass  # Progress tracking not available
    
    return orchestrator.dispatch("respond", event)
