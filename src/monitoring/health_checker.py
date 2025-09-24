"""
System Health Checker - Automated health checks and service validation
"""
import asyncio
import boto3
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)

class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"

@dataclass
class ServiceHealth:
    service_name: str
    status: HealthStatus
    response_time_ms: Optional[float]
    last_check: datetime
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class SystemHealthReport:
    overall_status: HealthStatus
    timestamp: datetime
    services: List[ServiceHealth]
    performance_metrics: Dict[str, Any]
    error_count: int
    warnings: List[str]

class AWSHealthChecker:
    """Health checker for AWS services used by NeoHarbour Security"""
    
    def __init__(self, region: str = 'us-east-1'):
        self.region = region
        self.session = boto3.Session()
        
    async def check_dynamodb_health(self, table_name: str) -> ServiceHealth:
        """Check DynamoDB table health and performance"""
        start_time = datetime.now()
        try:
            dynamodb = self.session.client('dynamodb', region_name=self.region)
            
            # Check table status
            response = dynamodb.describe_table(TableName=table_name)
            table_status = response['Table']['TableStatus']
            
            # Test read operation
            response = dynamodb.scan(
                TableName=table_name,
                Limit=1,
                Select='COUNT'
            )
            
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            status = HealthStatus.HEALTHY if table_status == 'ACTIVE' else HealthStatus.DEGRADED
            
            return ServiceHealth(
                service_name=f"DynamoDB-{table_name}",
                status=status,
                response_time_ms=response_time,
                last_check=datetime.now(),
                metadata={
                    'table_status': table_status,
                    'item_count': response.get('Count', 0),
                    'consumed_capacity': response.get('ConsumedCapacity')
                }
            )
            
        except Exception as e:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"DynamoDB health check failed for {table_name}: {str(e)}")
            
            return ServiceHealth(
                service_name=f"DynamoDB-{table_name}",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                error_message=str(e)
            )
    
    async def check_s3_health(self, bucket_name: str) -> ServiceHealth:
        """Check S3 bucket health and accessibility"""
        start_time = datetime.now()
        try:
            s3 = self.session.client('s3', region_name=self.region)
            
            # Check bucket exists and is accessible
            s3.head_bucket(Bucket=bucket_name)
            
            # Test list operation
            response = s3.list_objects_v2(Bucket=bucket_name, MaxKeys=1)
            
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return ServiceHealth(
                service_name=f"S3-{bucket_name}",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                metadata={
                    'object_count': response.get('KeyCount', 0),
                    'bucket_region': response.get('ResponseMetadata', {}).get('HTTPHeaders', {}).get('x-amz-bucket-region')
                }
            )
            
        except Exception as e:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"S3 health check failed for {bucket_name}: {str(e)}")
            
            return ServiceHealth(
                service_name=f"S3-{bucket_name}",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                error_message=str(e)
            )
    
    async def check_bedrock_health(self) -> ServiceHealth:
        """Check Amazon Bedrock service health"""
        start_time = datetime.now()
        try:
            bedrock = self.session.client('bedrock-runtime', region_name=self.region)
            
            # Test with a simple prompt
            test_prompt = "Test connection"
            response = bedrock.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": test_prompt}]
                })
            )
            
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return ServiceHealth(
                service_name="Bedrock-Claude",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                metadata={
                    'model_id': 'anthropic.claude-3-haiku-20240307-v1:0',
                    'response_size': len(response['body'].read())
                }
            )
            
        except Exception as e:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"Bedrock health check failed: {str(e)}")
            
            return ServiceHealth(
                service_name="Bedrock-Claude",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                error_message=str(e)
            )
    
    async def check_step_functions_health(self, state_machine_arn: str) -> ServiceHealth:
        """Check Step Functions state machine health"""
        start_time = datetime.now()
        try:
            stepfunctions = self.session.client('stepfunctions', region_name=self.region)
            
            # Check state machine status
            response = stepfunctions.describe_state_machine(
                stateMachineArn=state_machine_arn
            )
            
            # Get recent execution statistics
            executions = stepfunctions.list_executions(
                stateMachineArn=state_machine_arn,
                maxResults=10
            )
            
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            status = HealthStatus.HEALTHY if response['status'] == 'ACTIVE' else HealthStatus.DEGRADED
            
            return ServiceHealth(
                service_name="StepFunctions-Pipeline",
                status=status,
                response_time_ms=response_time,
                last_check=datetime.now(),
                metadata={
                    'state_machine_status': response['status'],
                    'recent_executions': len(executions['executions']),
                    'creation_date': response['creationDate'].isoformat()
                }
            )
            
        except Exception as e:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"Step Functions health check failed: {str(e)}")
            
            return ServiceHealth(
                service_name="StepFunctions-Pipeline",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                error_message=str(e)
            )
    
    async def check_eventbridge_health(self) -> ServiceHealth:
        """Check EventBridge service health"""
        start_time = datetime.now()
        try:
            eventbridge = self.session.client('events', region_name=self.region)
            
            # List event buses to verify access
            response = eventbridge.list_event_buses(Limit=10)
            
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return ServiceHealth(
                service_name="EventBridge",
                status=HealthStatus.HEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                metadata={
                    'event_buses_count': len(response['EventBuses']),
                    'default_bus_available': any(bus['Name'] == 'default' for bus in response['EventBuses'])
                }
            )
            
        except Exception as e:
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            logger.error(f"EventBridge health check failed: {str(e)}")
            
            return ServiceHealth(
                service_name="EventBridge",
                status=HealthStatus.UNHEALTHY,
                response_time_ms=response_time,
                last_check=datetime.now(),
                error_message=str(e)
            )

class SystemHealthMonitor:
    """Main system health monitoring coordinator"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.aws_checker = AWSHealthChecker(region=config.get('aws_region', 'us-east-1'))
        
    async def run_comprehensive_health_check(self) -> SystemHealthReport:
        """Run all health checks and generate comprehensive report"""
        logger.info("Starting comprehensive system health check")
        
        health_checks = []
        
        # DynamoDB checks
        if 'dynamodb_tables' in self.config:
            for table in self.config['dynamodb_tables']:
                health_checks.append(self.aws_checker.check_dynamodb_health(table))
        
        # S3 checks
        if 's3_buckets' in self.config:
            for bucket in self.config['s3_buckets']:
                health_checks.append(self.aws_checker.check_s3_health(bucket))
        
        # Bedrock check
        health_checks.append(self.aws_checker.check_bedrock_health())
        
        # Step Functions check
        if 'step_functions_arn' in self.config:
            health_checks.append(
                self.aws_checker.check_step_functions_health(self.config['step_functions_arn'])
            )
        
        # EventBridge check
        health_checks.append(self.aws_checker.check_eventbridge_health())
        
        # Execute all health checks concurrently
        service_results = await asyncio.gather(*health_checks, return_exceptions=True)
        
        # Process results
        services = []
        error_count = 0
        warnings = []
        
        for result in service_results:
            if isinstance(result, Exception):
                error_count += 1
                warnings.append(f"Health check failed: {str(result)}")
                continue
                
            services.append(result)
            if result.status == HealthStatus.UNHEALTHY:
                error_count += 1
            elif result.status == HealthStatus.DEGRADED:
                warnings.append(f"{result.service_name} is degraded: {result.error_message}")
        
        # Determine overall status
        if error_count > 0:
            overall_status = HealthStatus.UNHEALTHY
        elif warnings:
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY
        
        # Calculate performance metrics
        response_times = [s.response_time_ms for s in services if s.response_time_ms is not None]
        performance_metrics = {
            'avg_response_time_ms': sum(response_times) / len(response_times) if response_times else 0,
            'max_response_time_ms': max(response_times) if response_times else 0,
            'min_response_time_ms': min(response_times) if response_times else 0,
            'total_services_checked': len(services),
            'healthy_services': len([s for s in services if s.status == HealthStatus.HEALTHY]),
            'degraded_services': len([s for s in services if s.status == HealthStatus.DEGRADED]),
            'unhealthy_services': len([s for s in services if s.status == HealthStatus.UNHEALTHY])
        }
        
        report = SystemHealthReport(
            overall_status=overall_status,
            timestamp=datetime.now(),
            services=services,
            performance_metrics=performance_metrics,
            error_count=error_count,
            warnings=warnings
        )
        
        logger.info(f"Health check completed. Overall status: {overall_status.value}")
        return report
    
    def to_dict(self, report: SystemHealthReport) -> Dict[str, Any]:
        """Convert health report to dictionary for JSON serialization"""
        return {
            'overall_status': report.overall_status.value,
            'timestamp': report.timestamp.isoformat(),
            'services': [
                {
                    'service_name': s.service_name,
                    'status': s.status.value,
                    'response_time_ms': s.response_time_ms,
                    'last_check': s.last_check.isoformat(),
                    'error_message': s.error_message,
                    'metadata': s.metadata
                }
                for s in report.services
            ],
            'performance_metrics': report.performance_metrics,
            'error_count': report.error_count,
            'warnings': report.warnings
        }