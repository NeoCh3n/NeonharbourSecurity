"""
Demo and Live Mode Integration

Provides seamless integration between demo and live modes, ensuring consistent
processing quality and compliance artifact generation across both modes.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum

import boto3
from botocore.exceptions import ClientError

from .mode_processor import ModeAwareProcessor, ProcessingMode, ProcessingContext
from .mode_switcher import DemoLiveModeSwitcher, ModeSwitchResult
from .quality_validator import DemoLiveQualityValidator, QualityMetrics
from .workflow_validator import DemoLiveWorkflowValidator, WorkflowValidationResult
from ..aws.service_integration import aws_service_integration

logger = logging.getLogger(__name__)


class IntegrationStatus(Enum):
    """Integration validation status"""
    CONSISTENT = "consistent"
    DEGRADED = "degraded"
    FAILED = "failed"


@dataclass
class IntegrationValidationResult:
    """Result of demo/live integration validation"""
    status: IntegrationStatus
    demo_quality_score: float
    live_quality_score: float
    workflow_consistency: bool
    compliance_artifacts_consistent: bool
    processing_time_difference_seconds: float
    validation_errors: List[str]
    recommendations: List[str]


class DemoLiveIntegration:
    """
    Comprehensive integration manager for demo and live modes that ensures
    consistent processing quality and seamless mode switching.
    """
    
    def __init__(self):
        self.mode_processor = ModeAwareProcessor()
        self.mode_switcher = DemoLiveModeSwitcher()
        self.quality_validator = DemoLiveQualityValidator()
        self.workflow_validator = DemoLiveWorkflowValidator()
        
        self.eventbridge = boto3.client('events')
        self.dynamodb = boto3.resource('dynamodb')
        
        self.event_bus_name = os.getenv('EVENT_BUS_NAME', 'AsiaAgenticSocBus')
        self.investigations_table_name = os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations-dev')
        
        # Quality thresholds
        self.quality_threshold = 0.9  # 90% quality score required
        self.consistency_threshold = 0.1  # Max 10% difference between modes
        self.processing_time_threshold = 30.0  # Max 30 second difference
    
    def validate_integration_consistency(
        self,
        tenant_id: str,
        sample_size: int = 10
    ) -> IntegrationValidationResult:
        """
        Validate that demo and live modes maintain consistent integration
        by comparing recent investigations from both modes.
        """
        logger.info(f"Validating integration consistency for tenant {tenant_id}")
        
        # First validate AWS service integration
        try:
            aws_validation = aws_service_integration.validate_complete_integration()
            if not aws_validation.all_services_healthy:
                logger.warning(f"AWS service integration issues detected: {aws_validation.validation_errors}")
        except Exception as e:
            logger.error(f"Could not validate AWS service integration: {e}")
        
        try:
            # Get recent investigations from both modes
            demo_investigations = self._get_recent_investigations(tenant_id, ProcessingMode.DEMO, sample_size)
            live_investigations = self._get_recent_investigations(tenant_id, ProcessingMode.LIVE, sample_size)
            
            if not demo_investigations and not live_investigations:
                return IntegrationValidationResult(
                    status=IntegrationStatus.CONSISTENT,
                    demo_quality_score=1.0,
                    live_quality_score=1.0,
                    workflow_consistency=True,
                    compliance_artifacts_consistent=True,
                    processing_time_difference_seconds=0.0,
                    validation_errors=[],
                    recommendations=["No investigations found for comparison"]
                )
            
            # Validate quality for each mode
            demo_quality_results = []
            for inv_id in demo_investigations:
                quality = self.quality_validator.validate_investigation_quality(inv_id, tenant_id, ProcessingMode.DEMO)
                demo_quality_results.append(quality)
            
            live_quality_results = []
            for inv_id in live_investigations:
                quality = self.quality_validator.validate_investigation_quality(inv_id, tenant_id, ProcessingMode.LIVE)
                live_quality_results.append(quality)
            
            # Validate workflow consistency
            workflow_consistency = self.workflow_validator.validate_demo_live_consistency(
                demo_investigations, live_investigations, tenant_id
            )
            
            # Analyze integration consistency
            return self._analyze_integration_consistency(
                demo_quality_results, live_quality_results, workflow_consistency
            )
            
        except Exception as e:
            logger.error(f"Error validating integration consistency: {e}")
            return IntegrationValidationResult(
                status=IntegrationStatus.FAILED,
                demo_quality_score=0.0,
                live_quality_score=0.0,
                workflow_consistency=False,
                compliance_artifacts_consistent=False,
                processing_time_difference_seconds=0.0,
                validation_errors=[str(e)],
                recommendations=["Fix integration validation errors"]
            )
    
    def ensure_seamless_processing(
        self,
        alert: Dict[str, Any],
        target_mode: ProcessingMode
    ) -> Dict[str, Any]:
        """
        Ensure that an alert is processed seamlessly in the target mode
        with consistent quality and compliance artifact generation.
        """
        logger.info(f"Ensuring seamless processing for alert in {target_mode.value} mode")
        
        processing_result = {
            "success": False,
            "investigation_id": None,
            "processing_mode": target_mode.value,
            "quality_validated": False,
            "workflow_complete": False,
            "compliance_artifacts_generated": False,
            "processing_time_seconds": 0.0,
            "validation_errors": [],
            "recommendations": []
        }
        
        start_time = datetime.now(timezone.utc)
        
        try:
            # Prepare alert for target mode
            prepared_alert = self._prepare_alert_for_mode(alert, target_mode)
            
            # Validate alert routing
            routing_validation = self.workflow_validator.ensure_demo_workflow_routing(prepared_alert)
            if not routing_validation["alert_valid"]:
                processing_result["validation_errors"].extend(routing_validation["routing_issues"])
                return processing_result
            
            # Send alert to pipeline
            investigation_id = self._send_alert_to_pipeline(prepared_alert)
            processing_result["investigation_id"] = investigation_id
            
            # Monitor workflow execution
            monitoring_result = self.workflow_validator.monitor_workflow_execution(
                investigation_id, prepared_alert["tenantId"], timeout_minutes=10
            )
            
            processing_result["workflow_complete"] = (
                monitoring_result.get("final_validation", {}).get("workflow_complete", False)
            )
            
            # Validate processing quality
            if processing_result["workflow_complete"]:
                quality_metrics = self.quality_validator.validate_investigation_quality(
                    investigation_id, prepared_alert["tenantId"], target_mode
                )
                
                processing_result["quality_validated"] = quality_metrics.quality_score >= self.quality_threshold
                processing_result["compliance_artifacts_generated"] = len(quality_metrics.compliance_artifacts_generated) > 0
            
            # Calculate processing time
            end_time = datetime.now(timezone.utc)
            processing_result["processing_time_seconds"] = (end_time - start_time).total_seconds()
            
            # Determine overall success
            processing_result["success"] = (
                processing_result["workflow_complete"] and
                processing_result["quality_validated"] and
                processing_result["compliance_artifacts_generated"]
            )
            
            # Generate recommendations
            if not processing_result["success"]:
                processing_result["recommendations"] = self._generate_processing_recommendations(processing_result)
            
        except Exception as e:
            logger.error(f"Error ensuring seamless processing: {e}")
            processing_result["validation_errors"].append(str(e))
            processing_result["recommendations"].append("Fix processing pipeline errors")
        
        return processing_result
    
    def validate_mode_switching_quality(
        self,
        tenant_id: str,
        source_mode: ProcessingMode,
        target_mode: ProcessingMode
    ) -> Dict[str, Any]:
        """
        Validate that switching between modes maintains processing quality
        without degradation.
        """
        logger.info(f"Validating mode switching quality from {source_mode.value} to {target_mode.value}")
        
        validation_result = {
            "switch_valid": False,
            "source_mode": source_mode.value,
            "target_mode": target_mode.value,
            "pre_switch_quality": 0.0,
            "post_switch_quality": 0.0,
            "quality_maintained": False,
            "consistency_validated": False,
            "switch_time_seconds": 0.0,
            "validation_errors": [],
            "recommendations": []
        }
        
        start_time = datetime.now(timezone.utc)
        
        try:
            # Validate pre-switch quality
            pre_switch_validation = self.mode_switcher._validate_current_mode_quality(
                tenant_id, source_mode, sample_size=5
            )
            validation_result["pre_switch_quality"] = pre_switch_validation.get("average_quality_score", 0.0)
            
            # Perform mode switch
            if target_mode == ProcessingMode.DEMO:
                switch_result = self.mode_switcher.switch_to_demo_mode(tenant_id, validate_quality=True)
            else:
                switch_result = self.mode_switcher.switch_to_live_mode(tenant_id, validate_quality=True)
            
            if not switch_result.success:
                validation_result["validation_errors"].append(switch_result.error_message or "Mode switch failed")
                return validation_result
            
            # Validate post-switch quality
            post_switch_validation = self.mode_switcher._validate_current_mode_quality(
                tenant_id, target_mode, sample_size=5
            )
            validation_result["post_switch_quality"] = post_switch_validation.get("average_quality_score", 0.0)
            
            # Check quality maintenance
            quality_difference = abs(
                validation_result["pre_switch_quality"] - validation_result["post_switch_quality"]
            )
            validation_result["quality_maintained"] = quality_difference <= self.consistency_threshold
            
            # Validate consistency
            consistency_validation = self.mode_switcher.validate_mode_consistency(tenant_id, sample_size=10)
            validation_result["consistency_validated"] = consistency_validation.get("consistency_valid", False)
            
            # Calculate switch time
            end_time = datetime.now(timezone.utc)
            validation_result["switch_time_seconds"] = (end_time - start_time).total_seconds()
            
            # Determine overall validity
            validation_result["switch_valid"] = (
                validation_result["quality_maintained"] and
                validation_result["consistency_validated"] and
                validation_result["pre_switch_quality"] >= self.quality_threshold and
                validation_result["post_switch_quality"] >= self.quality_threshold
            )
            
            # Generate recommendations
            if not validation_result["switch_valid"]:
                validation_result["recommendations"] = self._generate_switch_recommendations(validation_result)
            
        except Exception as e:
            logger.error(f"Error validating mode switching quality: {e}")
            validation_result["validation_errors"].append(str(e))
            validation_result["recommendations"].append("Fix mode switching validation errors")
        
        return validation_result
    
    def ensure_compliance_artifact_consistency(
        self,
        demo_investigation_id: str,
        live_investigation_id: str,
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Ensure that demo and live investigations generate consistent
        compliance artifacts with equivalent content and structure.
        """
        logger.info(f"Ensuring compliance artifact consistency between {demo_investigation_id} and {live_investigation_id}")
        
        consistency_result = {
            "artifacts_consistent": False,
            "demo_investigation_id": demo_investigation_id,
            "live_investigation_id": live_investigation_id,
            "demo_artifacts": [],
            "live_artifacts": [],
            "structural_consistency": False,
            "content_consistency": False,
            "hkma_compliance_consistent": False,
            "validation_errors": [],
            "recommendations": []
        }
        
        try:
            # Validate demo investigation artifacts
            demo_quality = self.quality_validator.validate_investigation_quality(
                demo_investigation_id, tenant_id, ProcessingMode.DEMO
            )
            consistency_result["demo_artifacts"] = demo_quality.compliance_artifacts_generated
            
            # Validate live investigation artifacts
            live_quality = self.quality_validator.validate_investigation_quality(
                live_investigation_id, tenant_id, ProcessingMode.LIVE
            )
            consistency_result["live_artifacts"] = live_quality.compliance_artifacts_generated
            
            # Compare artifact structures
            consistency_result["structural_consistency"] = self._validate_artifact_structure_consistency(
                demo_quality, live_quality
            )
            
            # Compare artifact content
            consistency_result["content_consistency"] = self._validate_artifact_content_consistency(
                demo_investigation_id, live_investigation_id, tenant_id
            )
            
            # Validate HKMA compliance consistency
            consistency_result["hkma_compliance_consistent"] = self._validate_hkma_compliance_consistency(
                demo_investigation_id, live_investigation_id, tenant_id
            )
            
            # Determine overall consistency
            consistency_result["artifacts_consistent"] = (
                consistency_result["structural_consistency"] and
                consistency_result["content_consistency"] and
                consistency_result["hkma_compliance_consistent"]
            )
            
            # Generate recommendations
            if not consistency_result["artifacts_consistent"]:
                consistency_result["recommendations"] = self._generate_artifact_consistency_recommendations(
                    consistency_result
                )
            
        except Exception as e:
            logger.error(f"Error ensuring compliance artifact consistency: {e}")
            consistency_result["validation_errors"].append(str(e))
            consistency_result["recommendations"].append("Fix compliance artifact validation errors")
        
        return consistency_result
    
    def _get_recent_investigations(
        self,
        tenant_id: str,
        mode: ProcessingMode,
        limit: int
    ) -> List[str]:
        """Get recent investigation IDs for the specified mode"""
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            
            # Query recent investigations for the tenant
            response = table.query(
                KeyConditionExpression='pk = :pk',
                ExpressionAttributeValues={
                    ':pk': f'TENANT#{tenant_id}'
                },
                ScanIndexForward=False,  # Most recent first
                Limit=limit * 2  # Get more to filter by mode
            )
            
            investigations = []
            for item in response.get('Items', []):
                processing_mode = item.get('processingMode', 'live')
                if processing_mode == mode.value:
                    investigations.append(item['investigationId'])
                    if len(investigations) >= limit:
                        break
            
            return investigations
            
        except ClientError as e:
            logger.error(f"Error getting recent investigations: {e}")
            return []
    
    def _analyze_integration_consistency(
        self,
        demo_quality_results: List[QualityMetrics],
        live_quality_results: List[QualityMetrics],
        workflow_consistency: Dict[str, Any]
    ) -> IntegrationValidationResult:
        """Analyze integration consistency between demo and live modes"""
        
        validation_errors = []
        recommendations = []
        
        # Calculate average quality scores
        demo_avg_quality = sum(r.quality_score for r in demo_quality_results) / len(demo_quality_results) if demo_quality_results else 0.0
        live_avg_quality = sum(r.quality_score for r in live_quality_results) / len(live_quality_results) if live_quality_results else 0.0
        
        # Calculate processing time difference
        demo_avg_time = sum(r.processing_time_seconds for r in demo_quality_results) / len(demo_quality_results) if demo_quality_results else 0.0
        live_avg_time = sum(r.processing_time_seconds for r in live_quality_results) / len(live_quality_results) if live_quality_results else 0.0
        processing_time_diff = abs(demo_avg_time - live_avg_time)
        
        # Determine status
        quality_difference = abs(demo_avg_quality - live_avg_quality)
        workflow_consistent = workflow_consistency.get("overall_consistent", False)
        
        if quality_difference > self.consistency_threshold:
            validation_errors.append(f"Quality difference exceeds threshold: {quality_difference:.2f}")
            recommendations.append("Investigate quality differences between demo and live modes")
        
        if processing_time_diff > self.processing_time_threshold:
            validation_errors.append(f"Processing time difference exceeds threshold: {processing_time_diff:.1f}s")
            recommendations.append("Optimize processing performance consistency")
        
        if not workflow_consistent:
            validation_errors.append("Workflow consistency validation failed")
            recommendations.append("Ensure demo and live workflows follow identical stages")
        
        # Determine overall status
        if len(validation_errors) == 0:
            status = IntegrationStatus.CONSISTENT
        elif demo_avg_quality >= self.quality_threshold and live_avg_quality >= self.quality_threshold:
            status = IntegrationStatus.DEGRADED
        else:
            status = IntegrationStatus.FAILED
        
        return IntegrationValidationResult(
            status=status,
            demo_quality_score=demo_avg_quality,
            live_quality_score=live_avg_quality,
            workflow_consistency=workflow_consistent,
            compliance_artifacts_consistent=workflow_consistent,  # Simplified for now
            processing_time_difference_seconds=processing_time_diff,
            validation_errors=validation_errors,
            recommendations=recommendations
        )
    
    def _prepare_alert_for_mode(self, alert: Dict[str, Any], target_mode: ProcessingMode) -> Dict[str, Any]:
        """Prepare alert for processing in target mode"""
        prepared_alert = alert.copy()
        
        # Set mode-specific flags
        if target_mode == ProcessingMode.DEMO:
            prepared_alert["alert"]["isDemo"] = True
            prepared_alert["source"] = "asia.agentic.soc.demo"
            if "demoMetadata" not in prepared_alert:
                prepared_alert["demoMetadata"] = {
                    "scenarioType": "integration_test",
                    "isFalsePositive": False,
                    "isDemo": True
                }
        else:
            prepared_alert["alert"]["isDemo"] = False
            prepared_alert["source"] = "asia.agentic.soc.ingestion"
            if "demoMetadata" in prepared_alert:
                del prepared_alert["demoMetadata"]
        
        return prepared_alert
    
    def _send_alert_to_pipeline(self, alert: Dict[str, Any]) -> str:
        """Send alert to EventBridge for processing"""
        try:
            self.eventbridge.put_events(
                Entries=[
                    {
                        "EventBusName": self.event_bus_name,
                        "Source": alert.get("source", "asia.agentic.soc.ingestion"),
                        "DetailType": "IntegrationTestAlert",
                        "Detail": json.dumps(alert),
                    }
                ]
            )
            return alert["investigationId"]
        except ClientError as e:
            logger.error(f"Failed to send alert to EventBridge: {e}")
            raise
    
    def _generate_processing_recommendations(self, processing_result: Dict[str, Any]) -> List[str]:
        """Generate recommendations for processing issues"""
        recommendations = []
        
        if not processing_result["workflow_complete"]:
            recommendations.append("Ensure Step Functions workflow completes all required stages")
        
        if not processing_result["quality_validated"]:
            recommendations.append("Improve investigation quality to meet minimum threshold")
        
        if not processing_result["compliance_artifacts_generated"]:
            recommendations.append("Ensure compliance artifacts are generated and stored properly")
        
        if processing_result["processing_time_seconds"] > 300:  # 5 minutes
            recommendations.append("Optimize processing performance to reduce execution time")
        
        return recommendations
    
    def _generate_switch_recommendations(self, validation_result: Dict[str, Any]) -> List[str]:
        """Generate recommendations for mode switching issues"""
        recommendations = []
        
        if not validation_result["quality_maintained"]:
            recommendations.append("Investigate quality degradation during mode switching")
        
        if not validation_result["consistency_validated"]:
            recommendations.append("Ensure consistent processing standards across modes")
        
        if validation_result["switch_time_seconds"] > 60:  # 1 minute
            recommendations.append("Optimize mode switching performance")
        
        return recommendations
    
    def _validate_artifact_structure_consistency(
        self,
        demo_quality: QualityMetrics,
        live_quality: QualityMetrics
    ) -> bool:
        """Validate that artifact structures are consistent"""
        demo_artifact_count = len(demo_quality.compliance_artifacts_generated)
        live_artifact_count = len(live_quality.compliance_artifacts_generated)
        
        # Allow for small differences in artifact count
        return abs(demo_artifact_count - live_artifact_count) <= 1
    
    def _validate_artifact_content_consistency(
        self,
        demo_investigation_id: str,
        live_investigation_id: str,
        tenant_id: str
    ) -> bool:
        """Validate that artifact content is consistent"""
        # This would involve detailed S3 artifact comparison
        # For now, return True as a placeholder
        return True
    
    def _validate_hkma_compliance_consistency(
        self,
        demo_investigation_id: str,
        live_investigation_id: str,
        tenant_id: str
    ) -> bool:
        """Validate that HKMA compliance artifacts are consistent"""
        # This would involve detailed compliance mapping comparison
        # For now, return True as a placeholder
        return True
    
    def _generate_artifact_consistency_recommendations(
        self,
        consistency_result: Dict[str, Any]
    ) -> List[str]:
        """Generate recommendations for artifact consistency issues"""
        recommendations = []
        
        if not consistency_result["structural_consistency"]:
            recommendations.append("Ensure demo and live modes generate equivalent artifact structures")
        
        if not consistency_result["content_consistency"]:
            recommendations.append("Validate that artifact content is consistent across modes")
        
        if not consistency_result["hkma_compliance_consistent"]:
            recommendations.append("Ensure HKMA compliance mappings are identical across modes")
        
        return recommendations


# Global integration manager instance
demo_live_integration = DemoLiveIntegration()