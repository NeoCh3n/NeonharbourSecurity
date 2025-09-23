"""Secure data ingestion pipeline with error handling and retry logic for AWS security services."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Union

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .securityhub import SecurityHubClient
from .guardduty import GuardDutyClient
from .cloudtrail import CloudTrailClient
from .vpcflow import VPCFlowLogsClient


class IngestionStatus(Enum):
    """Status of data ingestion operations."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


@dataclass
class IngestionConfig:
    """Configuration for data ingestion pipeline."""
    source_type: str  # "securityhub", "guardduty", "cloudtrail", "vpcflow"
    customer_account_id: str
    role_arn: str
    external_id: Optional[str] = None
    region: str = "us-east-1"
    
    # Ingestion parameters
    batch_size: int = 50
    max_retries: int = 3
    retry_delay_seconds: float = 1.0
    retry_backoff_multiplier: float = 2.0
    max_retry_delay_seconds: float = 60.0
    
    # Rate limiting
    requests_per_second: float = 2.0
    burst_capacity: int = 10
    
    # Data filtering
    hours_back: int = 24
    severity_filter: Optional[List[str]] = None
    compliance_filter: Optional[List[str]] = None
    
    # Error handling
    continue_on_error: bool = True
    max_consecutive_errors: int = 5
    
    # Encryption and security
    encrypt_in_transit: bool = True
    validate_ssl: bool = True


@dataclass
class IngestionResult:
    """Result of data ingestion operation."""
    config: IngestionConfig
    status: IngestionStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    records_processed: int = 0
    records_successful: int = 0
    records_failed: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    retry_attempts: int = 0
    total_duration_seconds: float = 0.0
    
    def add_error(self, error: Exception, context: Optional[str] = None) -> None:
        """Add an error to the result."""
        self.errors.append({
            "timestamp": datetime.utcnow().isoformat(),
            "error_type": type(error).__name__,
            "error_message": str(error),
            "context": context
        })
    
    def add_warning(self, message: str, context: Optional[str] = None) -> None:
        """Add a warning to the result."""
        self.warnings.append({
            "timestamp": datetime.utcnow().isoformat(),
            "message": message,
            "context": context
        })
    
    def finalize(self) -> None:
        """Finalize the result with end time and duration."""
        self.end_time = datetime.utcnow()
        if self.start_time:
            self.total_duration_seconds = (self.end_time - self.start_time).total_seconds()


class SecureIngestionPipeline:
    """Secure data ingestion pipeline for AWS security services with comprehensive error handling."""
    
    def __init__(self, logger: Optional[logging.Logger] = None) -> None:
        self.logger = logger or logging.getLogger(__name__)
        self._active_ingestions: Dict[str, IngestionResult] = {}
        
    async def ingest_security_hub_findings(
        self, 
        config: IngestionConfig,
        progress_callback: Optional[Callable[[IngestionResult], None]] = None
    ) -> IngestionResult:
        """Ingest Security Hub findings with secure cross-account access."""
        return await self._run_ingestion(
            config=config,
            ingestion_func=self._ingest_security_hub_batch,
            progress_callback=progress_callback
        )
    
    async def ingest_guardduty_findings(
        self, 
        config: IngestionConfig,
        progress_callback: Optional[Callable[[IngestionResult], None]] = None
    ) -> IngestionResult:
        """Ingest GuardDuty findings with secure cross-account access."""
        return await self._run_ingestion(
            config=config,
            ingestion_func=self._ingest_guardduty_batch,
            progress_callback=progress_callback
        )
    
    async def ingest_cloudtrail_events(
        self, 
        config: IngestionConfig,
        progress_callback: Optional[Callable[[IngestionResult], None]] = None
    ) -> IngestionResult:
        """Ingest CloudTrail events with secure cross-account access."""
        return await self._run_ingestion(
            config=config,
            ingestion_func=self._ingest_cloudtrail_batch,
            progress_callback=progress_callback
        )
    
    async def ingest_vpc_flow_logs(
        self, 
        config: IngestionConfig,
        progress_callback: Optional[Callable[[IngestionResult], None]] = None
    ) -> IngestionResult:
        """Ingest VPC Flow Logs with secure cross-account access."""
        return await self._run_ingestion(
            config=config,
            ingestion_func=self._ingest_vpcflow_batch,
            progress_callback=progress_callback
        )
    
    async def _run_ingestion(
        self,
        config: IngestionConfig,
        ingestion_func: Callable,
        progress_callback: Optional[Callable[[IngestionResult], None]] = None
    ) -> IngestionResult:
        """Run data ingestion with comprehensive error handling and retry logic."""
        ingestion_id = f"{config.source_type}-{config.customer_account_id}-{int(time.time())}"
        
        result = IngestionResult(
            config=config,
            status=IngestionStatus.PENDING,
            start_time=datetime.utcnow()
        )
        
        self._active_ingestions[ingestion_id] = result
        
        try:
            result.status = IngestionStatus.RUNNING
            if progress_callback:
                progress_callback(result)
            
            # Initialize client with cross-account role
            client = await self._create_secure_client(config)
            
            consecutive_errors = 0
            retry_delay = config.retry_delay_seconds
            
            while result.retry_attempts <= config.max_retries:
                try:
                    # Run the specific ingestion function
                    batch_results = await ingestion_func(client, config, result)
                    
                    # Process batch results
                    for batch_result in batch_results:
                        result.records_processed += 1
                        
                        if batch_result.get("success", False):
                            result.records_successful += 1
                            consecutive_errors = 0  # Reset error counter on success
                        else:
                            result.records_failed += 1
                            consecutive_errors += 1
                            
                            error_msg = batch_result.get("error", "Unknown error")
                            result.add_error(
                                Exception(error_msg), 
                                f"Record processing failed"
                            )
                    
                    # Check if we should continue or stop
                    if consecutive_errors >= config.max_consecutive_errors:
                        result.add_error(
                            Exception(f"Too many consecutive errors ({consecutive_errors})"),
                            "Stopping ingestion due to error threshold"
                        )
                        result.status = IngestionStatus.FAILED
                        break
                    
                    # Success - exit retry loop
                    result.status = IngestionStatus.SUCCESS
                    break
                    
                except (BotoCoreError, ClientError) as e:
                    result.retry_attempts += 1
                    result.add_error(e, f"AWS API error (attempt {result.retry_attempts})")
                    
                    if result.retry_attempts > config.max_retries:
                        result.status = IngestionStatus.FAILED
                        break
                    
                    # Exponential backoff
                    result.status = IngestionStatus.RETRYING
                    if progress_callback:
                        progress_callback(result)
                    
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(
                        retry_delay * config.retry_backoff_multiplier,
                        config.max_retry_delay_seconds
                    )
                    
                except Exception as e:
                    result.add_error(e, "Unexpected error during ingestion")
                    result.status = IngestionStatus.FAILED
                    break
            
            # Final status update
            if progress_callback:
                progress_callback(result)
                
        except Exception as e:
            result.add_error(e, "Critical error in ingestion pipeline")
            result.status = IngestionStatus.FAILED
        
        finally:
            result.finalize()
            if ingestion_id in self._active_ingestions:
                del self._active_ingestions[ingestion_id]
        
        return result
    
    async def _create_secure_client(self, config: IngestionConfig) -> Union[SecurityHubClient, GuardDutyClient, CloudTrailClient, VPCFlowLogsClient]:
        """Create secure client with cross-account role assumption."""
        # Assume cross-account role
        sts_client = boto3.client("sts", region_name=config.region)
        
        assume_role_kwargs = {
            "RoleArn": config.role_arn,
            "RoleSessionName": f"NeoHarbour-{config.source_type}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
            "DurationSeconds": 3600  # 1 hour
        }
        
        if config.external_id:
            assume_role_kwargs["ExternalId"] = config.external_id
        
        response = sts_client.assume_role(**assume_role_kwargs)
        credentials = response["Credentials"]
        
        # Create client with assumed role credentials
        client_kwargs = {
            "region": config.region,
            "aws_access_key_id": credentials["AccessKeyId"],
            "aws_secret_access_key": credentials["SecretAccessKey"],
            "aws_session_token": credentials["SessionToken"]
        }
        
        if config.source_type == "securityhub":
            return SecurityHubClient(**client_kwargs)
        elif config.source_type == "guardduty":
            return GuardDutyClient(**client_kwargs)
        elif config.source_type == "cloudtrail":
            return CloudTrailClient(**client_kwargs)
        elif config.source_type == "vpcflow":
            return VPCFlowLogsClient(**client_kwargs)
        else:
            raise ValueError(f"Unsupported source type: {config.source_type}")
    
    async def _ingest_security_hub_batch(
        self, 
        client: SecurityHubClient, 
        config: IngestionConfig,
        result: IngestionResult
    ) -> List[Dict[str, Any]]:
        """Ingest a batch of Security Hub findings."""
        try:
            findings = client.fetch_recent_findings(
                limit=config.batch_size,
                hours_back=config.hours_back,
                severity_filter=config.severity_filter,
                compliance_status_filter=config.compliance_filter
            )
            
            batch_results = []
            for finding in findings:
                try:
                    # Process finding (send to investigation pipeline, store in DynamoDB, etc.)
                    processed_finding = await self._process_security_finding(finding, config)
                    batch_results.append({"success": True, "data": processed_finding})
                    
                except Exception as e:
                    batch_results.append({
                        "success": False, 
                        "error": str(e),
                        "finding_id": finding.get("id", "unknown")
                    })
            
            return batch_results
            
        except Exception as e:
            self.logger.error(f"Security Hub batch ingestion failed: {e}")
            raise
    
    async def _ingest_guardduty_batch(
        self, 
        client: GuardDutyClient, 
        config: IngestionConfig,
        result: IngestionResult
    ) -> List[Dict[str, Any]]:
        """Ingest a batch of GuardDuty findings."""
        try:
            findings = client.fetch_recent_findings(
                limit=config.batch_size,
                hours_back=config.hours_back,
                severity_filter=config.severity_filter
            )
            
            batch_results = []
            for finding in findings:
                try:
                    processed_finding = await self._process_security_finding(finding, config)
                    batch_results.append({"success": True, "data": processed_finding})
                    
                except Exception as e:
                    batch_results.append({
                        "success": False, 
                        "error": str(e),
                        "finding_id": finding.get("id", "unknown")
                    })
            
            return batch_results
            
        except Exception as e:
            self.logger.error(f"GuardDuty batch ingestion failed: {e}")
            raise
    
    async def _ingest_cloudtrail_batch(
        self, 
        client: CloudTrailClient, 
        config: IngestionConfig,
        result: IngestionResult
    ) -> List[Dict[str, Any]]:
        """Ingest a batch of CloudTrail events."""
        try:
            events = client.fetch_recent_events(
                limit=config.batch_size,
                hours_back=config.hours_back
            )
            
            batch_results = []
            for event in events:
                try:
                    processed_event = await self._process_security_finding(event, config)
                    batch_results.append({"success": True, "data": processed_event})
                    
                except Exception as e:
                    batch_results.append({
                        "success": False, 
                        "error": str(e),
                        "event_id": event.get("event_id", "unknown")
                    })
            
            return batch_results
            
        except Exception as e:
            self.logger.error(f"CloudTrail batch ingestion failed: {e}")
            raise
    
    async def _ingest_vpcflow_batch(
        self, 
        client: VPCFlowLogsClient, 
        config: IngestionConfig,
        result: IngestionResult
    ) -> List[Dict[str, Any]]:
        """Ingest a batch of VPC Flow Log records."""
        try:
            flow_records = client.fetch_recent_flow_logs(
                limit=config.batch_size,
                hours_back=config.hours_back
            )
            
            batch_results = []
            for record in flow_records:
                try:
                    processed_record = await self._process_security_finding(record, config)
                    batch_results.append({"success": True, "data": processed_record})
                    
                except Exception as e:
                    batch_results.append({
                        "success": False, 
                        "error": str(e),
                        "record_id": record.get("flow_log_id", "unknown")
                    })
            
            return batch_results
            
        except Exception as e:
            self.logger.error(f"VPC Flow Logs batch ingestion failed: {e}")
            raise
    
    async def _process_security_finding(
        self, 
        finding: Dict[str, Any], 
        config: IngestionConfig
    ) -> Dict[str, Any]:
        """Process a security finding/event for the investigation pipeline."""
        # Add metadata for pipeline processing
        processed_finding = {
            **finding,
            "ingestion_metadata": {
                "customer_account_id": config.customer_account_id,
                "ingestion_timestamp": datetime.utcnow().isoformat(),
                "source_type": config.source_type,
                "pipeline_version": "1.0"
            }
        }
        
        # TODO: Send to EventBridge for pipeline processing
        # This would trigger the Step Functions workflow
        
        # For now, just return the processed finding
        return processed_finding
    
    def get_active_ingestions(self) -> Dict[str, IngestionResult]:
        """Get currently active ingestion operations."""
        return self._active_ingestions.copy()
    
    def cancel_ingestion(self, ingestion_id: str) -> bool:
        """Cancel an active ingestion operation."""
        if ingestion_id in self._active_ingestions:
            self._active_ingestions[ingestion_id].status = IngestionStatus.CANCELLED
            return True
        return False
    
    def get_ingestion_metrics(self) -> Dict[str, Any]:
        """Get metrics for all ingestion operations."""
        active_count = len(self._active_ingestions)
        
        status_counts = {}
        for result in self._active_ingestions.values():
            status = result.status.value
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "active_ingestions": active_count,
            "status_breakdown": status_counts,
            "timestamp": datetime.utcnow().isoformat()
        }