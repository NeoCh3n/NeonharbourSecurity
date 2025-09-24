"""
Demo and Live Mode Workflow Validator

Ensures that demo alerts route through the complete Step Functions workflow
with all six agents and generate the same compliance artifacts as live mode.
"""

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass
from enum import Enum

import boto3
from botocore.exceptions import ClientError

from .quality_validator import DemoLiveQualityValidator, ProcessingMode, QualityMetrics

logger = logging.getLogger(__name__)


class WorkflowStage(Enum):
    """Complete Step Functions workflow stages"""
    INGEST_FINDING = "IngestFinding"
    GATHER_CONTEXT = "GatherContext"
    SUMMARIZE_WITH_AI = "SummarizeWithAI"
    RISK_DECIDER = "RiskDecider"
    BRANCH_ON_RISK = "BranchOnRisk"
    AUTO_REMEDIATE = "AutoRemediate"
    REQUEST_APPROVAL = "RequestApproval"
    ADAPT_INSIGHTS = "AdaptInsights"
    WRITE_AUDIT_TRAIL = "WriteAuditTrail"


@dataclass
class WorkflowValidationResult:
    """Result of workflow validation"""
    investigation_id: str
    tenant_id: str
    processing_mode: ProcessingMode
    workflow_complete: bool
    stages_executed: List[str]
    missing_stages: List[str]
    execution_time_seconds: float
    compliance_artifacts_generated: bool
    quality_score: float
    validation_errors: List[str]
    step_function_execution_arn: Optional[str] = None


class DemoLiveWorkflowValidator:
    """
    Validates that demo and live investigations follow the complete
    Step Functions workflow with all required stages and agents.
    """
    
    def __init__(self):
        self.stepfunctions = boto3.client('stepfunctions')
        self.dynamodb = boto3.resource('dynamodb')
        self.s3 = boto3.client('s3')
        self.quality_validator = DemoLiveQualityValidator()
        
        self.investigations_table_name = os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations-dev')
        self.state_machine_arn = os.getenv('STATE_MACHINE_ARN', '')
        self.audit_bucket = os.getenv('AUDIT_BUCKET', 'asia-agentic-soc-audit')
        
        # Required workflow stages for complete processing
        self.required_stages = {
            WorkflowStage.INGEST_FINDING.value,
            WorkflowStage.GATHER_CONTEXT.value,
            WorkflowStage.SUMMARIZE_WITH_AI.value,
            WorkflowStage.RISK_DECIDER.value,
            WorkflowStage.ADAPT_INSIGHTS.value,
            WorkflowStage.WRITE_AUDIT_TRAIL.value
        }
        
        # Agent mapping to workflow stages
        self.agent_stage_mapping = {
            "Planner Agent": WorkflowStage.INGEST_FINDING.value,
            "Context Executor": WorkflowStage.GATHER_CONTEXT.value,
            "Analyst Agent": WorkflowStage.SUMMARIZE_WITH_AI.value,
            "Risk Orchestrator": WorkflowStage.RISK_DECIDER.value,
            "Learning Curator": WorkflowStage.ADAPT_INSIGHTS.value,
            "Audit Scribe": WorkflowStage.WRITE_AUDIT_TRAIL.value
        }
    
    def validate_complete_workflow(
        self,
        investigation_id: str,
        tenant_id: str,
        timeout_minutes: int = 10
    ) -> WorkflowValidationResult:
        """
        Validate that an investigation completed the full Step Functions workflow
        with all required stages and agents.
        """
        logger.info(f"Validating complete workflow for investigation {investigation_id}")
        
        # Initialize validation result
        result = WorkflowValidationResult(
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            processing_mode=ProcessingMode.LIVE,  # Will be updated
            workflow_complete=False,
            stages_executed=[],
            missing_stages=[],
            execution_time_seconds=0.0,
            compliance_artifacts_generated=False,
            quality_score=0.0,
            validation_errors=[]
        )
        
        try:
            # Get investigation details from DynamoDB
            investigation_details = self._get_investigation_details(investigation_id, tenant_id)
            if not investigation_details:
                result.validation_errors.append("Investigation not found in DynamoDB")
                return result
            
            # Determine processing mode
            result.processing_mode = self._determine_processing_mode(investigation_details)
            
            # Find Step Functions execution
            execution_arn = self._find_step_function_execution(investigation_id, tenant_id)
            result.step_function_execution_arn = execution_arn
            
            if execution_arn:
                # Validate Step Functions execution
                self._validate_step_function_execution(execution_arn, result)
            else:
                result.validation_errors.append("Step Functions execution not found")
            
            # Validate DynamoDB investigation record
            self._validate_investigation_record(investigation_details, result)
            
            # Validate compliance artifacts
            self._validate_compliance_artifacts(investigation_id, tenant_id, result)
            
            # Calculate overall quality score
            quality_metrics = self.quality_validator.validate_investigation_quality(
                investigation_id, tenant_id, result.processing_mode
            )
            result.quality_score = quality_metrics.quality_score
            
            # Determine if workflow is complete
            result.workflow_complete = (
                len(result.missing_stages) == 0 and
                result.compliance_artifacts_generated and
                result.quality_score >= 0.8 and
                len(result.validation_errors) == 0
            )
            
            logger.info(
                f"Workflow validation complete for {investigation_id}: "
                f"complete={result.workflow_complete}, quality={result.quality_score}"
            )
            
        except Exception as e:
            logger.error(f"Error validating workflow for {investigation_id}: {e}")
            result.validation_errors.append(f"Validation error: {str(e)}")
        
        return result
    
    def validate_demo_live_consistency(
        self,
        demo_investigation_ids: List[str],
        live_investigation_ids: List[str],
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Validate that demo and live investigations follow consistent workflows
        and generate equivalent compliance artifacts.
        """
        logger.info(f"Validating demo/live consistency for {len(demo_investigation_ids)} demo and {len(live_investigation_ids)} live investigations")
        
        demo_results = []
        live_results = []
        
        # Validate demo investigations
        for investigation_id in demo_investigation_ids:
            result = self.validate_complete_workflow(investigation_id, tenant_id)
            demo_results.append(result)
        
        # Validate live investigations
        for investigation_id in live_investigation_ids:
            result = self.validate_complete_workflow(investigation_id, tenant_id)
            live_results.append(result)
        
        # Analyze consistency
        consistency_analysis = self._analyze_workflow_consistency(demo_results, live_results)
        
        return {
            "demo_investigations": len(demo_investigation_ids),
            "live_investigations": len(live_investigation_ids),
            "demo_results": [self._serialize_validation_result(r) for r in demo_results],
            "live_results": [self._serialize_validation_result(r) for r in live_results],
            "consistency_analysis": consistency_analysis,
            "overall_consistent": consistency_analysis["workflows_consistent"]
        }
    
    def ensure_demo_workflow_routing(
        self,
        demo_alert: Dict[str, Any],
        expected_stages: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Ensure that a demo alert will route through the complete Step Functions workflow.
        """
        if expected_stages is None:
            expected_stages = list(self.required_stages)
        
        # Validate alert structure for proper routing
        routing_validation = {
            "alert_valid": True,
            "routing_issues": [],
            "expected_stages": expected_stages,
            "alert_structure": {}
        }
        
        # Check required fields for EventBridge routing
        required_fields = ["investigationId", "tenantId", "alert"]
        for field in required_fields:
            if field not in demo_alert:
                routing_validation["alert_valid"] = False
                routing_validation["routing_issues"].append(f"Missing required field: {field}")
        
        # Validate alert structure
        if "alert" in demo_alert:
            alert = demo_alert["alert"]
            routing_validation["alert_structure"] = {
                "has_source": "source" in alert,
                "has_title": "title" in alert,
                "has_severity": "severity" in alert,
                "is_demo": alert.get("isDemo", False),
                "scenario_type": alert.get("scenarioType"),
                "false_positive_hint": alert.get("isFalsePositive")
            }
            
            # Ensure demo flag is set
            if not alert.get("isDemo", False):
                routing_validation["routing_issues"].append("Demo alert missing 'isDemo' flag")
        
        # Check EventBridge source
        expected_source = "asia.agentic.soc.demo"
        if demo_alert.get("source") != expected_source:
            routing_validation["routing_issues"].append(f"Expected EventBridge source '{expected_source}'")
        
        routing_validation["alert_valid"] = len(routing_validation["routing_issues"]) == 0
        
        return routing_validation
    
    def monitor_workflow_execution(
        self,
        investigation_id: str,
        tenant_id: str,
        timeout_minutes: int = 10
    ) -> Dict[str, Any]:
        """
        Monitor a workflow execution in real-time to ensure it completes successfully.
        """
        logger.info(f"Monitoring workflow execution for investigation {investigation_id}")
        
        start_time = datetime.now(timezone.utc)
        timeout_time = start_time + timedelta(minutes=timeout_minutes)
        
        monitoring_result = {
            "investigation_id": investigation_id,
            "tenant_id": tenant_id,
            "monitoring_started": start_time.isoformat(),
            "execution_found": False,
            "execution_status": "unknown",
            "stages_completed": [],
            "current_stage": None,
            "execution_time_seconds": 0.0,
            "timeout_reached": False,
            "final_validation": None
        }
        
        # Poll for execution completion
        while datetime.now(timezone.utc) < timeout_time:
            try:
                # Check for Step Functions execution
                execution_arn = self._find_step_function_execution(investigation_id, tenant_id)
                
                if execution_arn:
                    monitoring_result["execution_found"] = True
                    
                    # Get execution status
                    execution_details = self.stepfunctions.describe_execution(
                        executionArn=execution_arn
                    )
                    
                    monitoring_result["execution_status"] = execution_details["status"]
                    monitoring_result["current_stage"] = execution_details.get("name", "unknown")
                    
                    # Calculate execution time
                    start_date = execution_details["startDate"]
                    if execution_details["status"] in ["SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"]:
                        end_date = execution_details.get("stopDate", datetime.now(timezone.utc))
                        monitoring_result["execution_time_seconds"] = (end_date - start_date).total_seconds()
                        
                        # Execution completed - perform final validation
                        monitoring_result["final_validation"] = self.validate_complete_workflow(
                            investigation_id, tenant_id
                        )
                        break
                    else:
                        # Still running
                        monitoring_result["execution_time_seconds"] = (
                            datetime.now(timezone.utc) - start_date
                        ).total_seconds()
                
                # Wait before next poll
                import time
                time.sleep(5)
                
            except Exception as e:
                logger.error(f"Error monitoring workflow execution: {e}")
                break
        
        # Check for timeout
        if datetime.now(timezone.utc) >= timeout_time:
            monitoring_result["timeout_reached"] = True
            logger.warning(f"Workflow monitoring timed out for investigation {investigation_id}")
        
        return monitoring_result
    
    def _get_investigation_details(self, investigation_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get investigation details from DynamoDB"""
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            response = table.get_item(
                Key={
                    'pk': f'TENANT#{tenant_id}',
                    'sk': f'INVESTIGATION#{investigation_id}'
                }
            )
            return response.get('Item')
        except ClientError as e:
            logger.error(f"Error getting investigation details: {e}")
            return None
    
    def _determine_processing_mode(self, investigation_details: Dict[str, Any]) -> ProcessingMode:
        """Determine processing mode from investigation details"""
        alert = investigation_details.get('alert', {})
        is_demo = alert.get('isDemo', False)
        return ProcessingMode.DEMO if is_demo else ProcessingMode.LIVE
    
    def _find_step_function_execution(self, investigation_id: str, tenant_id: str) -> Optional[str]:
        """Find Step Functions execution ARN for investigation"""
        try:
            # List recent executions
            response = self.stepfunctions.list_executions(
                stateMachineArn=self.state_machine_arn,
                maxResults=100
            )
            
            # Look for execution with matching investigation ID
            for execution in response.get('executions', []):
                try:
                    # Get execution input to check investigation ID
                    execution_details = self.stepfunctions.describe_execution(
                        executionArn=execution['executionArn']
                    )
                    
                    input_data = json.loads(execution_details.get('input', '{}'))
                    if (input_data.get('investigationId') == investigation_id and
                        input_data.get('tenantId') == tenant_id):
                        return execution['executionArn']
                        
                except (json.JSONDecodeError, KeyError):
                    continue
            
            return None
            
        except ClientError as e:
            logger.error(f"Error finding Step Functions execution: {e}")
            return None
    
    def _validate_step_function_execution(self, execution_arn: str, result: WorkflowValidationResult):
        """Validate Step Functions execution details"""
        try:
            # Get execution details
            execution_details = self.stepfunctions.describe_execution(
                executionArn=execution_arn
            )
            
            # Calculate execution time
            start_date = execution_details["startDate"]
            end_date = execution_details.get("stopDate")
            if end_date:
                result.execution_time_seconds = (end_date - start_date).total_seconds()
            
            # Check execution status
            status = execution_details["status"]
            if status != "SUCCEEDED":
                result.validation_errors.append(f"Step Functions execution status: {status}")
            
            # Get execution history to validate stages
            history_response = self.stepfunctions.get_execution_history(
                executionArn=execution_arn
            )
            
            executed_stages = set()
            for event in history_response.get('events', []):
                if event['type'] == 'TaskStateEntered':
                    stage_name = event['stateEnteredEventDetails']['name']
                    executed_stages.add(stage_name)
                    result.stages_executed.append(stage_name)
            
            # Check for missing stages
            result.missing_stages = list(self.required_stages - executed_stages)
            
        except ClientError as e:
            logger.error(f"Error validating Step Functions execution: {e}")
            result.validation_errors.append(f"Step Functions validation error: {str(e)}")
    
    def _validate_investigation_record(self, investigation_details: Dict[str, Any], result: WorkflowValidationResult):
        """Validate investigation record in DynamoDB"""
        # Check required fields
        required_fields = ['investigationId', 'tenantId', 'stage', 'status']
        for field in required_fields:
            if field not in investigation_details:
                result.validation_errors.append(f"Missing investigation field: {field}")
        
        # Check final stage
        final_stage = investigation_details.get('stage')
        if final_stage != 'completed':
            result.validation_errors.append(f"Investigation not completed, current stage: {final_stage}")
    
    def _validate_compliance_artifacts(self, investigation_id: str, tenant_id: str, result: WorkflowValidationResult):
        """Validate compliance artifacts in S3"""
        try:
            # Check for audit trail in S3
            audit_prefix = f"audit/{tenant_id}/{investigation_id}"
            
            response = self.s3.list_objects_v2(
                Bucket=self.audit_bucket,
                Prefix=audit_prefix
            )
            
            if 'Contents' in response and len(response['Contents']) > 0:
                result.compliance_artifacts_generated = True
            else:
                result.validation_errors.append("No compliance artifacts found in S3")
                
        except ClientError as e:
            logger.error(f"Error validating compliance artifacts: {e}")
            result.validation_errors.append(f"S3 validation error: {str(e)}")
    
    def _analyze_workflow_consistency(
        self,
        demo_results: List[WorkflowValidationResult],
        live_results: List[WorkflowValidationResult]
    ) -> Dict[str, Any]:
        """Analyze consistency between demo and live workflow results"""
        analysis = {
            "workflows_consistent": True,
            "demo_completion_rate": 0.0,
            "live_completion_rate": 0.0,
            "average_demo_quality": 0.0,
            "average_live_quality": 0.0,
            "stage_consistency": {},
            "quality_difference": 0.0,
            "consistency_issues": []
        }
        
        # Calculate completion rates
        if demo_results:
            demo_completed = sum(1 for r in demo_results if r.workflow_complete)
            analysis["demo_completion_rate"] = demo_completed / len(demo_results)
            analysis["average_demo_quality"] = sum(r.quality_score for r in demo_results) / len(demo_results)
        
        if live_results:
            live_completed = sum(1 for r in live_results if r.workflow_complete)
            analysis["live_completion_rate"] = live_completed / len(live_results)
            analysis["average_live_quality"] = sum(r.quality_score for r in live_results) / len(live_results)
        
        # Calculate quality difference
        analysis["quality_difference"] = abs(
            analysis["average_demo_quality"] - analysis["average_live_quality"]
        )
        
        # Check consistency thresholds
        completion_rate_diff = abs(
            analysis["demo_completion_rate"] - analysis["live_completion_rate"]
        )
        
        if completion_rate_diff > 0.1:  # 10% threshold
            analysis["workflows_consistent"] = False
            analysis["consistency_issues"].append(
                f"Completion rate difference: {completion_rate_diff:.2%}"
            )
        
        if analysis["quality_difference"] > 0.1:  # 10% threshold
            analysis["workflows_consistent"] = False
            analysis["consistency_issues"].append(
                f"Quality score difference: {analysis['quality_difference']:.2f}"
            )
        
        return analysis
    
    def _serialize_validation_result(self, result: WorkflowValidationResult) -> Dict[str, Any]:
        """Serialize validation result for JSON response"""
        return {
            "investigation_id": result.investigation_id,
            "tenant_id": result.tenant_id,
            "processing_mode": result.processing_mode.value,
            "workflow_complete": result.workflow_complete,
            "stages_executed": result.stages_executed,
            "missing_stages": result.missing_stages,
            "execution_time_seconds": result.execution_time_seconds,
            "compliance_artifacts_generated": result.compliance_artifacts_generated,
            "quality_score": result.quality_score,
            "validation_errors": result.validation_errors,
            "step_function_execution_arn": result.step_function_execution_arn
        }


# Global workflow validator instance
workflow_validator = DemoLiveWorkflowValidator()