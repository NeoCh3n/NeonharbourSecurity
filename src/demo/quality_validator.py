"""
Demo and Live Mode Quality Validator

Ensures consistent processing quality between demo and live modes by validating
that all investigations follow the same workflow stages and generate equivalent
compliance artifacts regardless of mode.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass
from enum import Enum

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class ProcessingMode(Enum):
    """Investigation processing modes"""
    DEMO = "demo"
    LIVE = "live"


class WorkflowStage(Enum):
    """Required workflow stages for all investigations"""
    RECEIVED = "received"
    CONTEXT = "context"
    ANALYSIS = "analysis"
    RISK = "risk"
    REMEDIATION = "remediation"
    ADAPTATION = "adaptation"
    AUDIT = "audit"
    COMPLETED = "completed"


@dataclass
class QualityMetrics:
    """Quality validation metrics"""
    investigation_id: str
    processing_mode: ProcessingMode
    stages_completed: Set[str]
    compliance_artifacts_generated: List[str]
    processing_time_seconds: float
    ai_analysis_performed: bool
    risk_assessment_completed: bool
    audit_trail_created: bool
    s3_artifacts_stored: bool
    dynamodb_records_created: bool
    quality_score: float = 0.0
    validation_errors: List[str] = None
    
    def __post_init__(self):
        if self.validation_errors is None:
            self.validation_errors = []


class DemoLiveQualityValidator:
    """
    Validates that demo and live investigations maintain consistent quality
    by ensuring all required stages are completed and artifacts are generated.
    """
    
    def __init__(self):
        self.dynamodb = boto3.resource('dynamodb')
        self.s3 = boto3.client('s3')
        self.investigations_table_name = os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations-dev')
        self.artifacts_bucket = os.getenv('ARTIFACTS_BUCKET', 'asia-agentic-soc-artifacts')
        self.audit_bucket = os.getenv('AUDIT_BUCKET', 'asia-agentic-soc-audit')
        
        # Required stages for complete investigation
        self.required_stages = {
            WorkflowStage.RECEIVED.value,
            WorkflowStage.CONTEXT.value,
            WorkflowStage.ANALYSIS.value,
            WorkflowStage.RISK.value,
            WorkflowStage.AUDIT.value,
            WorkflowStage.COMPLETED.value
        }
        
        # Required compliance artifacts
        self.required_artifacts = {
            'investigation_summary',
            'risk_assessment',
            'compliance_mapping',
            'audit_trail'
        }
    
    def validate_investigation_quality(
        self,
        investigation_id: str,
        tenant_id: str,
        expected_mode: ProcessingMode = None
    ) -> QualityMetrics:
        """
        Validate the quality of a completed investigation to ensure it meets
        the same standards regardless of demo or live mode.
        """
        logger.info(f"Validating investigation quality: {investigation_id}")
        
        # Determine processing mode
        processing_mode = self._determine_processing_mode(investigation_id, tenant_id)
        if expected_mode and processing_mode != expected_mode:
            logger.warning(f"Mode mismatch: expected {expected_mode}, found {processing_mode}")
        
        # Initialize metrics
        metrics = QualityMetrics(
            investigation_id=investigation_id,
            processing_mode=processing_mode,
            stages_completed=set(),
            compliance_artifacts_generated=[],
            processing_time_seconds=0.0,
            ai_analysis_performed=False,
            risk_assessment_completed=False,
            audit_trail_created=False,
            s3_artifacts_stored=False,
            dynamodb_records_created=False
        )
        
        # Validate DynamoDB records
        self._validate_dynamodb_records(investigation_id, tenant_id, metrics)
        
        # Validate S3 artifacts
        self._validate_s3_artifacts(investigation_id, tenant_id, metrics)
        
        # Validate workflow completion
        self._validate_workflow_stages(metrics)
        
        # Validate compliance artifacts
        self._validate_compliance_artifacts(metrics)
        
        # Calculate quality score
        self._calculate_quality_score(metrics)
        
        logger.info(f"Investigation {investigation_id} quality score: {metrics.quality_score}")
        return metrics
    
    def compare_demo_live_quality(
        self,
        demo_investigation_id: str,
        live_investigation_id: str,
        demo_tenant_id: str,
        live_tenant_id: str
    ) -> Dict[str, Any]:
        """
        Compare quality metrics between demo and live investigations
        to ensure consistent processing standards.
        """
        demo_metrics = self.validate_investigation_quality(
            demo_investigation_id, demo_tenant_id, ProcessingMode.DEMO
        )
        
        live_metrics = self.validate_investigation_quality(
            live_investigation_id, live_tenant_id, ProcessingMode.LIVE
        )
        
        comparison = {
            'demo_quality_score': demo_metrics.quality_score,
            'live_quality_score': live_metrics.quality_score,
            'quality_difference': abs(demo_metrics.quality_score - live_metrics.quality_score),
            'stages_comparison': {
                'demo_stages': list(demo_metrics.stages_completed),
                'live_stages': list(live_metrics.stages_completed),
                'missing_in_demo': list(live_metrics.stages_completed - demo_metrics.stages_completed),
                'missing_in_live': list(demo_metrics.stages_completed - live_metrics.stages_completed)
            },
            'artifacts_comparison': {
                'demo_artifacts': demo_metrics.compliance_artifacts_generated,
                'live_artifacts': live_metrics.compliance_artifacts_generated,
                'demo_artifact_count': len(demo_metrics.compliance_artifacts_generated),
                'live_artifact_count': len(live_metrics.compliance_artifacts_generated)
            },
            'processing_time_comparison': {
                'demo_time': demo_metrics.processing_time_seconds,
                'live_time': live_metrics.processing_time_seconds,
                'time_difference': abs(demo_metrics.processing_time_seconds - live_metrics.processing_time_seconds)
            },
            'validation_errors': {
                'demo_errors': demo_metrics.validation_errors,
                'live_errors': live_metrics.validation_errors
            }
        }
        
        # Determine if quality is consistent
        comparison['quality_consistent'] = (
            comparison['quality_difference'] < 0.1 and  # Less than 10% difference
            len(comparison['stages_comparison']['missing_in_demo']) == 0 and
            len(comparison['stages_comparison']['missing_in_live']) == 0 and
            abs(comparison['artifacts_comparison']['demo_artifact_count'] - 
                comparison['artifacts_comparison']['live_artifact_count']) <= 1
        )
        
        return comparison
    
    def validate_mode_switching(
        self,
        investigation_ids: List[str],
        tenant_id: str
    ) -> Dict[str, Any]:
        """
        Validate that switching between demo and live modes doesn't
        degrade investigation quality.
        """
        results = {
            'investigations_validated': len(investigation_ids),
            'quality_scores': [],
            'mode_distribution': {'demo': 0, 'live': 0},
            'quality_degradation_detected': False,
            'average_quality_score': 0.0,
            'validation_summary': {}
        }
        
        for investigation_id in investigation_ids:
            metrics = self.validate_investigation_quality(investigation_id, tenant_id)
            results['quality_scores'].append(metrics.quality_score)
            results['mode_distribution'][metrics.processing_mode.value] += 1
            
            # Check for quality degradation
            if metrics.quality_score < 0.8:  # 80% quality threshold
                results['quality_degradation_detected'] = True
                logger.warning(f"Quality degradation detected in {investigation_id}: {metrics.quality_score}")
        
        if results['quality_scores']:
            results['average_quality_score'] = sum(results['quality_scores']) / len(results['quality_scores'])
        
        results['validation_summary'] = {
            'total_investigations': len(investigation_ids),
            'demo_investigations': results['mode_distribution']['demo'],
            'live_investigations': results['mode_distribution']['live'],
            'average_quality': results['average_quality_score'],
            'quality_consistent': not results['quality_degradation_detected'] and results['average_quality_score'] >= 0.9
        }
        
        return results
    
    def _determine_processing_mode(self, investigation_id: str, tenant_id: str) -> ProcessingMode:
        """Determine if investigation was processed in demo or live mode"""
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            response = table.get_item(
                Key={
                    'pk': f'TENANT#{tenant_id}',
                    'sk': f'INVESTIGATION#{investigation_id}'
                }
            )
            
            if 'Item' in response:
                alert = response['Item'].get('alert', {})
                is_demo = alert.get('isDemo', False)
                return ProcessingMode.DEMO if is_demo else ProcessingMode.LIVE
            
            return ProcessingMode.LIVE  # Default assumption
            
        except ClientError as e:
            logger.error(f"Error determining processing mode: {e}")
            return ProcessingMode.LIVE
    
    def _validate_dynamodb_records(
        self,
        investigation_id: str,
        tenant_id: str,
        metrics: QualityMetrics
    ):
        """Validate DynamoDB investigation records"""
        try:
            table = self.dynamodb.Table(self.investigations_table_name)
            response = table.get_item(
                Key={
                    'pk': f'TENANT#{tenant_id}',
                    'sk': f'INVESTIGATION#{investigation_id}'
                }
            )
            
            if 'Item' not in response:
                metrics.validation_errors.append("Investigation record not found in DynamoDB")
                return
            
            item = response['Item']
            metrics.dynamodb_records_created = True
            
            # Check required fields
            required_fields = ['investigationId', 'tenantId', 'stage', 'status', 'receivedAt', 'updatedAt']
            for field in required_fields:
                if field not in item:
                    metrics.validation_errors.append(f"Missing required field: {field}")
            
            # Track stages completed
            stage = item.get('stage', '')
            if stage:
                metrics.stages_completed.add(stage)
            
            # Check for AI analysis indicators
            if 'summary' in item or 'aiAnalysis' in item:
                metrics.ai_analysis_performed = True
            
            # Check for risk assessment
            if 'risk' in item or 'riskLevel' in item:
                metrics.risk_assessment_completed = True
            
            # Calculate processing time
            received_at = item.get('receivedAt')
            updated_at = item.get('updatedAt')
            if received_at and updated_at:
                try:
                    start_time = datetime.fromisoformat(received_at.replace('Z', '+00:00'))
                    end_time = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    metrics.processing_time_seconds = (end_time - start_time).total_seconds()
                except ValueError:
                    metrics.validation_errors.append("Invalid timestamp format")
            
        except ClientError as e:
            logger.error(f"Error validating DynamoDB records: {e}")
            metrics.validation_errors.append(f"DynamoDB validation error: {str(e)}")
    
    def _validate_s3_artifacts(
        self,
        investigation_id: str,
        tenant_id: str,
        metrics: QualityMetrics
    ):
        """Validate S3 artifact storage"""
        try:
            # Check audit bucket for compliance artifacts
            audit_prefix = f"audit/{tenant_id}/{investigation_id}"
            
            audit_response = self.s3.list_objects_v2(
                Bucket=self.audit_bucket,
                Prefix=audit_prefix
            )
            
            if 'Contents' in audit_response:
                metrics.s3_artifacts_stored = True
                metrics.audit_trail_created = True
                for obj in audit_response['Contents']:
                    metrics.compliance_artifacts_generated.append(obj['Key'])
            
            # Check artifacts bucket for additional artifacts
            artifacts_prefix = f"investigations/{tenant_id}/{investigation_id}"
            
            try:
                artifacts_response = self.s3.list_objects_v2(
                    Bucket=self.artifacts_bucket,
                    Prefix=artifacts_prefix
                )
                
                if 'Contents' in artifacts_response:
                    for obj in artifacts_response['Contents']:
                        metrics.compliance_artifacts_generated.append(obj['Key'])
            except ClientError:
                # Artifacts bucket might not exist or be accessible
                pass
            
        except ClientError as e:
            logger.error(f"Error validating S3 artifacts: {e}")
            metrics.validation_errors.append(f"S3 validation error: {str(e)}")
    
    def _validate_workflow_stages(self, metrics: QualityMetrics):
        """Validate that all required workflow stages were completed"""
        missing_stages = self.required_stages - metrics.stages_completed
        
        if missing_stages:
            metrics.validation_errors.append(f"Missing workflow stages: {list(missing_stages)}")
        
        # Special validation for completed investigations
        if 'completed' in metrics.stages_completed:
            if not metrics.audit_trail_created:
                metrics.validation_errors.append("Completed investigation missing audit trail")
    
    def _validate_compliance_artifacts(self, metrics: QualityMetrics):
        """Validate that required compliance artifacts were generated"""
        artifact_types_found = set()
        
        for artifact_path in metrics.compliance_artifacts_generated:
            if 'audit' in artifact_path.lower():
                artifact_types_found.add('audit_trail')
            if 'summary' in artifact_path.lower():
                artifact_types_found.add('investigation_summary')
            if 'risk' in artifact_path.lower():
                artifact_types_found.add('risk_assessment')
            if 'compliance' in artifact_path.lower():
                artifact_types_found.add('compliance_mapping')
        
        missing_artifacts = self.required_artifacts - artifact_types_found
        
        if missing_artifacts:
            metrics.validation_errors.append(f"Missing compliance artifacts: {list(missing_artifacts)}")
    
    def _calculate_quality_score(self, metrics: QualityMetrics):
        """Calculate overall quality score based on validation results"""
        score = 0.0
        max_score = 100.0
        
        # Stage completion (40 points)
        stage_completion_ratio = len(metrics.stages_completed) / len(self.required_stages)
        score += stage_completion_ratio * 40
        
        # Artifact generation (30 points)
        if metrics.compliance_artifacts_generated:
            artifact_score = min(len(metrics.compliance_artifacts_generated) / len(self.required_artifacts), 1.0)
            score += artifact_score * 30
        
        # Technical validations (30 points)
        technical_checks = [
            metrics.dynamodb_records_created,
            metrics.s3_artifacts_stored,
            metrics.ai_analysis_performed,
            metrics.risk_assessment_completed,
            metrics.audit_trail_created
        ]
        technical_score = sum(technical_checks) / len(technical_checks)
        score += technical_score * 30
        
        # Penalty for validation errors
        error_penalty = min(len(metrics.validation_errors) * 5, 20)  # Max 20 point penalty
        score -= error_penalty
        
        metrics.quality_score = max(score / max_score, 0.0)  # Normalize to 0-1 range


def validate_demo_live_consistency(
    demo_investigation_ids: List[str],
    live_investigation_ids: List[str],
    tenant_id: str
) -> Dict[str, Any]:
    """
    Convenience function to validate consistency between demo and live investigations.
    """
    validator = DemoLiveQualityValidator()
    
    results = {
        'demo_validations': [],
        'live_validations': [],
        'consistency_analysis': {},
        'overall_quality_consistent': True
    }
    
    # Validate demo investigations
    for investigation_id in demo_investigation_ids:
        metrics = validator.validate_investigation_quality(
            investigation_id, tenant_id, ProcessingMode.DEMO
        )
        results['demo_validations'].append({
            'investigation_id': investigation_id,
            'quality_score': metrics.quality_score,
            'stages_completed': list(metrics.stages_completed),
            'artifacts_count': len(metrics.compliance_artifacts_generated),
            'validation_errors': metrics.validation_errors
        })
    
    # Validate live investigations
    for investigation_id in live_investigation_ids:
        metrics = validator.validate_investigation_quality(
            investigation_id, tenant_id, ProcessingMode.LIVE
        )
        results['live_validations'].append({
            'investigation_id': investigation_id,
            'quality_score': metrics.quality_score,
            'stages_completed': list(metrics.stages_completed),
            'artifacts_count': len(metrics.compliance_artifacts_generated),
            'validation_errors': metrics.validation_errors
        })
    
    # Analyze consistency
    demo_scores = [v['quality_score'] for v in results['demo_validations']]
    live_scores = [v['quality_score'] for v in results['live_validations']]
    
    if demo_scores and live_scores:
        demo_avg = sum(demo_scores) / len(demo_scores)
        live_avg = sum(live_scores) / len(live_scores)
        
        results['consistency_analysis'] = {
            'demo_average_quality': demo_avg,
            'live_average_quality': live_avg,
            'quality_difference': abs(demo_avg - live_avg),
            'consistency_threshold_met': abs(demo_avg - live_avg) < 0.1,  # 10% threshold
            'demo_investigations_count': len(demo_investigation_ids),
            'live_investigations_count': len(live_investigation_ids)
        }
        
        results['overall_quality_consistent'] = results['consistency_analysis']['consistency_threshold_met']
    
    return results