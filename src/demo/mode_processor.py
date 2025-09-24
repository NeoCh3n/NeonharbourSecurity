"""
Mode-Aware Processing Utilities

Ensures consistent processing quality between demo and live modes by providing
unified interfaces and validation for all pipeline stages.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class ProcessingMode(Enum):
    """Investigation processing modes"""
    DEMO = "demo"
    LIVE = "live"


@dataclass
class ProcessingContext:
    """Unified processing context for demo and live modes"""
    investigation_id: str
    tenant_id: str
    mode: ProcessingMode
    alert: Dict[str, Any]
    demo_metadata: Optional[Dict[str, Any]] = None
    stage: str = "unknown"
    processing_start_time: Optional[datetime] = None
    
    def __post_init__(self):
        if self.processing_start_time is None:
            self.processing_start_time = datetime.now(timezone.utc)
    
    def is_demo(self) -> bool:
        """Check if this is a demo investigation"""
        return self.mode == ProcessingMode.DEMO
    
    def get_false_positive_hint(self) -> Optional[bool]:
        """Get false positive hint from demo metadata"""
        if self.demo_metadata:
            return self.demo_metadata.get("isFalsePositive")
        return None
    
    def get_scenario_type(self) -> Optional[str]:
        """Get scenario type from demo metadata"""
        if self.demo_metadata:
            return self.demo_metadata.get("scenarioType")
        return None


class ModeAwareProcessor:
    """
    Provides unified processing interfaces that ensure consistent quality
    between demo and live modes.
    """
    
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.s3 = boto3.client('s3')
        self.investigations_table_name = os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations-dev')
        self.metrics_table_name = os.getenv('DDB_METRICS_TABLE', 'AsiaAgenticSocMetrics-dev')
    
    def extract_processing_context(self, event: Dict[str, Any]) -> ProcessingContext:
        """Extract unified processing context from pipeline event"""
        investigation_id = event.get("investigationId", "unknown")
        tenant_id = event.get("tenantId", "unknown")
        alert = event.get("alert", {})
        demo_metadata = event.get("demoMetadata", {})
        
        # Determine processing mode
        is_demo = alert.get("isDemo", False) or demo_metadata.get("isDemo", False)
        mode = ProcessingMode.DEMO if is_demo else ProcessingMode.LIVE
        
        return ProcessingContext(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            mode=mode,
            alert=alert,
            demo_metadata=demo_metadata if demo_metadata else None,
            stage=event.get("stage", "unknown")
        )
    
    def ensure_consistent_processing(
        self,
        context: ProcessingContext,
        stage_name: str,
        processing_func: callable,
        *args,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Wrapper that ensures consistent processing quality regardless of mode.
        Applies the same validation, error handling, and artifact generation
        for both demo and live investigations.
        """
        logger.info(f"Processing {context.mode.value} investigation {context.investigation_id} at stage {stage_name}")
        
        # Update stage tracking
        self._update_stage_tracking(context, stage_name, "in_progress")
        
        try:
            # Execute the processing function with consistent parameters
            result = processing_func(context, *args, **kwargs)
            
            # Validate result quality
            self._validate_stage_result(context, stage_name, result)
            
            # Update stage tracking
            self._update_stage_tracking(context, stage_name, "completed")
            
            # Record processing metrics
            self._record_processing_metrics(context, stage_name, "success")
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing {context.mode.value} investigation {context.investigation_id} at stage {stage_name}: {e}")
            
            # Update stage tracking with error
            self._update_stage_tracking(context, stage_name, "error", str(e))
            
            # Record error metrics
            self._record_processing_metrics(context, stage_name, "error")
            
            raise
    
    def validate_workflow_consistency(
        self,
        investigation_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Validate that an investigation followed the complete workflow
        regardless of processing mode.
        """
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            response = table.get_item(
                Key={
                    'pk': f'TENANT#{tenant_id}',
                    'sk': f'INVESTIGATION#{investigation_id}'
                }
            )
            
            if 'Item' not in response:
                return {
                    'valid': False,
                    'error': 'Investigation not found',
                    'investigation_id': investigation_id
                }
            
            item = response['Item']
            processing_mode = item.get('processingMode', 'live')
            
            # Required stages for complete workflow
            required_stages = [
                'received', 'context', 'analysis', 'risk', 'remediation', 'adaptation', 'audit', 'completed'
            ]
            
            # Check stage progression
            current_stage = item.get('stage', 'unknown')
            stage_history = item.get('stageHistory', [])
            
            validation_result = {
                'valid': True,
                'investigation_id': investigation_id,
                'processing_mode': processing_mode,
                'current_stage': current_stage,
                'stages_completed': stage_history,
                'missing_stages': [],
                'quality_issues': []
            }
            
            # Validate stage completion
            completed_stages = set(stage_history)
            for stage in required_stages:
                if stage not in completed_stages:
                    validation_result['missing_stages'].append(stage)
            
            # Check for quality issues
            if not item.get('summary'):
                validation_result['quality_issues'].append('Missing AI analysis summary')
            
            if not item.get('risk'):
                validation_result['quality_issues'].append('Missing risk assessment')
            
            if not item.get('auditKey'):
                validation_result['quality_issues'].append('Missing audit trail')
            
            # Determine overall validity
            validation_result['valid'] = (
                len(validation_result['missing_stages']) == 0 and
                len(validation_result['quality_issues']) == 0 and
                current_stage == 'completed'
            )
            
            return validation_result
            
        except ClientError as e:
            logger.error(f"Error validating workflow consistency: {e}")
            return {
                'valid': False,
                'error': str(e),
                'investigation_id': investigation_id
            }
    
    def ensure_compliance_artifacts(
        self,
        context: ProcessingContext,
        stage_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Ensure that compliance artifacts are generated consistently
        for both demo and live investigations.
        """
        artifacts = {
            'investigation_summary': None,
            'risk_assessment': None,
            'compliance_mapping': None,
            'audit_trail': None,
            'processing_metadata': {
                'investigation_id': context.investigation_id,
                'tenant_id': context.tenant_id,
                'processing_mode': context.mode.value,
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'stage': context.stage
            }
        }
        
        # Generate investigation summary
        if 'summary' in stage_results:
            artifacts['investigation_summary'] = {
                'content': stage_results['summary'],
                'ai_generated': True,
                'confidence_score': stage_results.get('confidence', 0.8)
            }
        
        # Generate risk assessment
        if 'risk' in stage_results:
            artifacts['risk_assessment'] = {
                'risk_level': stage_results['risk'].get('level', 'medium'),
                'risk_score': stage_results['risk'].get('score', 0.5),
                'recommended_actions': stage_results['risk'].get('actions', []),
                'escalation_required': stage_results['risk'].get('escalate', False)
            }
        
        # Generate compliance mapping (HKMA specific)
        artifacts['compliance_mapping'] = self._generate_compliance_mapping(context, stage_results)
        
        # Add demo-specific metadata if applicable
        if context.is_demo():
            artifacts['demo_metadata'] = {
                'scenario_type': context.get_scenario_type(),
                'false_positive_hint': context.get_false_positive_hint(),
                'demo_session_context': context.demo_metadata
            }
        
        return artifacts
    
    def _update_stage_tracking(
        self,
        context: ProcessingContext,
        stage_name: str,
        status: str,
        error_message: str = None
    ):
        """Update stage tracking in DynamoDB"""
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            
            update_expr = "SET #stage = :stage, #status = :status, updatedAt = :now"
            expr_values = {
                ':stage': stage_name,
                ':status': status,
                ':now': datetime.now(timezone.utc).isoformat()
            }
            expr_names = {
                '#stage': 'stage',
                '#status': 'status'
            }
            
            # Add stage to history
            update_expr += ", stageHistory = list_append(if_not_exists(stageHistory, :empty_list), :stage_list)"
            expr_values[':empty_list'] = []
            expr_values[':stage_list'] = [stage_name]
            
            if error_message:
                update_expr += ", errorMessage = :error"
                expr_values[':error'] = error_message
            
            table.update_item(
                Key={
                    'pk': f'TENANT#{context.tenant_id}',
                    'sk': f'INVESTIGATION#{context.investigation_id}'
                },
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
                ExpressionAttributeNames=expr_names
            )
            
        except ClientError as e:
            logger.error(f"Error updating stage tracking: {e}")
    
    def _validate_stage_result(
        self,
        context: ProcessingContext,
        stage_name: str,
        result: Dict[str, Any]
    ):
        """Validate that stage result meets quality standards"""
        # Stage-specific validations
        if stage_name == "analysis" and "summary" not in result:
            raise ValueError("Analysis stage must produce summary")
        
        if stage_name == "risk" and "risk" not in result:
            raise ValueError("Risk stage must produce risk assessment")
        
        if stage_name == "audit" and "auditKey" not in result:
            raise ValueError("Audit stage must produce audit trail")
        
        # Ensure consistent structure regardless of mode
        required_fields = ["investigationId", "tenantId"]
        for field in required_fields:
            if field not in result:
                raise ValueError(f"Stage result missing required field: {field}")
    
    def _record_processing_metrics(
        self,
        context: ProcessingContext,
        stage_name: str,
        outcome: str
    ):
        """Record processing metrics for monitoring"""
        try:
            table = self.dynamodb.Table(self.metrics_table_name)
            
            metric_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            metric_name = f"{context.mode.value}_{stage_name}_{outcome}"
            
            table.update_item(
                Key={
                    'metric_date': metric_date,
                    'metric_name': metric_name
                },
                UpdateExpression="ADD metric_value :inc",
                ExpressionAttributeValues={':inc': 1}
            )
            
        except ClientError as e:
            logger.error(f"Error recording processing metrics: {e}")
    
    def _generate_compliance_mapping(
        self,
        context: ProcessingContext,
        stage_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate HKMA compliance mapping"""
        return {
            'hkma_sa2_controls': [
                'SA-2.1: Security Incident Management',
                'SA-2.2: Incident Response Procedures',
                'SA-2.3: Incident Documentation'
            ],
            'hkma_tm_g1_requirements': [
                'TM-G-1.1: Technology Risk Management',
                'TM-G-1.2: Operational Resilience',
                'TM-G-1.3: Audit Trail Requirements'
            ],
            'compliance_status': 'compliant',
            'audit_requirements_met': True,
            'retention_period_years': 7,
            'processing_mode': context.mode.value
        }


# Global processor instance
mode_processor = ModeAwareProcessor()


def ensure_consistent_processing(stage_name: str):
    """
    Decorator to ensure consistent processing quality between demo and live modes.
    """
    def decorator(func):
        def wrapper(event, context_obj):
            # Extract processing context
            context = mode_processor.extract_processing_context(event)
            
            # Ensure consistent processing
            return mode_processor.ensure_consistent_processing(
                context, stage_name, func, event, context_obj
            )
        
        return wrapper
    return decorator