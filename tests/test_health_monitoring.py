"""
Tests for system health monitoring and diagnostics
"""
import pytest
import asyncio
import json
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime

from src.monitoring.health_checker import (
    SystemHealthMonitor, 
    AWSHealthChecker, 
    HealthStatus,
    ServiceHealth,
    SystemHealthReport
)
from src.monitoring.diagnostics import (
    DiagnosticCollector,
    TroubleshootingGuide,
    DiagnosticLevel,
    DiagnosticEvent,
    SystemDiagnostics
)

class TestAWSHealthChecker:
    """Test AWS service health checking"""
    
    @pytest.fixture
    def health_checker(self):
        return AWSHealthChecker(region='us-east-1')
    
    @pytest.mark.asyncio
    async def test_dynamodb_health_check_success(self, health_checker):
        """Test successful DynamoDB health check"""
        with patch.object(health_checker, 'session') as mock_session:
            mock_client = Mock()
            mock_session.client.return_value = mock_client
            
            # Mock successful table describe
            mock_client.describe_table.return_value = {
                'Table': {'TableStatus': 'ACTIVE'}
            }
            
            # Mock successful scan
            mock_client.scan.return_value = {
                'Count': 100,
                'ConsumedCapacity': {'CapacityUnits': 1.0}
            }
            
            result = await health_checker.check_dynamodb_health('test-table')
            
            assert result.service_name == 'DynamoDB-test-table'
            assert result.status == HealthStatus.HEALTHY
            assert result.response_time_ms is not None
            assert result.metadata['table_status'] == 'ACTIVE'
            assert result.metadata['item_count'] == 100
    
    @pytest.mark.asyncio
    async def test_dynamodb_health_check_failure(self, health_checker):
        """Test failed DynamoDB health check"""
        with patch.object(health_checker, 'session') as mock_session:
            mock_client = Mock()
            mock_session.client.return_value = mock_client
            
            # Mock exception
            mock_client.describe_table.side_effect = Exception("Table not found")
            
            result = await health_checker.check_dynamodb_health('test-table')
            
            assert result.service_name == 'DynamoDB-test-table'
            assert result.status == HealthStatus.UNHEALTHY
            assert result.error_message == "Table not found"
    
    @pytest.mark.asyncio
    async def test_s3_health_check_success(self, health_checker):
        """Test successful S3 health check"""
        with patch.object(health_checker, 'session') as mock_session:
            mock_client = Mock()
            mock_session.client.return_value = mock_client
            
            # Mock successful head bucket
            mock_client.head_bucket.return_value = {}
            
            # Mock successful list objects
            mock_client.list_objects_v2.return_value = {
                'KeyCount': 50,
                'ResponseMetadata': {
                    'HTTPHeaders': {
                        'x-amz-bucket-region': 'us-east-1'
                    }
                }
            }
            
            result = await health_checker.check_s3_health('test-bucket')
            
            assert result.service_name == 'S3-test-bucket'
            assert result.status == HealthStatus.HEALTHY
            assert result.metadata['object_count'] == 50
    
    @pytest.mark.asyncio
    async def test_bedrock_health_check_success(self, health_checker):
        """Test successful Bedrock health check"""
        with patch.object(health_checker, 'session') as mock_session:
            mock_client = Mock()
            mock_session.client.return_value = mock_client
            
            # Mock successful model invocation
            mock_response = Mock()
            mock_response.read.return_value = b'{"content": [{"text": "Test"}]}'
            mock_client.invoke_model.return_value = {'body': mock_response}
            
            result = await health_checker.check_bedrock_health()
            
            assert result.service_name == 'Bedrock-Claude'
            assert result.status == HealthStatus.HEALTHY
            assert 'model_id' in result.metadata

class TestSystemHealthMonitor:
    """Test system health monitoring coordinator"""
    
    @pytest.fixture
    def config(self):
        return {
            'aws_region': 'us-east-1',
            'dynamodb_tables': ['test-table'],
            's3_buckets': ['test-bucket'],
            'step_functions_arn': 'arn:aws:states:us-east-1:123456789012:stateMachine:test'
        }
    
    @pytest.fixture
    def health_monitor(self, config):
        return SystemHealthMonitor(config)
    
    @pytest.mark.asyncio
    async def test_comprehensive_health_check(self, health_monitor):
        """Test comprehensive health check execution"""
        with patch.object(health_monitor.aws_checker, 'check_dynamodb_health') as mock_dynamo, \
             patch.object(health_monitor.aws_checker, 'check_s3_health') as mock_s3, \
             patch.object(health_monitor.aws_checker, 'check_bedrock_health') as mock_bedrock, \
             patch.object(health_monitor.aws_checker, 'check_step_functions_health') as mock_sf, \
             patch.object(health_monitor.aws_checker, 'check_eventbridge_health') as mock_eb:
            
            # Mock all health checks to return healthy status
            mock_dynamo.return_value = ServiceHealth(
                service_name='DynamoDB-test-table',
                status=HealthStatus.HEALTHY,
                response_time_ms=50.0,
                last_check=datetime.now()
            )
            
            mock_s3.return_value = ServiceHealth(
                service_name='S3-test-bucket',
                status=HealthStatus.HEALTHY,
                response_time_ms=30.0,
                last_check=datetime.now()
            )
            
            mock_bedrock.return_value = ServiceHealth(
                service_name='Bedrock-Claude',
                status=HealthStatus.HEALTHY,
                response_time_ms=150.0,
                last_check=datetime.now()
            )
            
            mock_sf.return_value = ServiceHealth(
                service_name='StepFunctions-Pipeline',
                status=HealthStatus.HEALTHY,
                response_time_ms=80.0,
                last_check=datetime.now()
            )
            
            mock_eb.return_value = ServiceHealth(
                service_name='EventBridge',
                status=HealthStatus.HEALTHY,
                response_time_ms=25.0,
                last_check=datetime.now()
            )
            
            report = await health_monitor.run_comprehensive_health_check()
            
            assert report.overall_status == HealthStatus.HEALTHY
            assert len(report.services) == 5
            assert report.error_count == 0
            assert report.performance_metrics['total_services_checked'] == 5
            assert report.performance_metrics['healthy_services'] == 5

class TestDiagnosticCollector:
    """Test diagnostic information collection"""
    
    @pytest.fixture
    def diagnostic_collector(self):
        return DiagnosticCollector(region='us-east-1')
    
    def test_log_event(self, diagnostic_collector):
        """Test diagnostic event logging"""
        diagnostic_collector.log_event(
            DiagnosticLevel.ERROR,
            'test-component',
            'Test error message',
            {'key': 'value'},
            'correlation-123'
        )
        
        assert len(diagnostic_collector.events) == 1
        event = diagnostic_collector.events[0]
        assert event.level == DiagnosticLevel.ERROR
        assert event.component == 'test-component'
        assert event.message == 'Test error message'
        assert event.details == {'key': 'value'}
        assert event.correlation_id == 'correlation-123'
    
    def test_get_system_info(self, diagnostic_collector):
        """Test system information collection"""
        system_info = diagnostic_collector.get_system_info()
        
        assert 'platform' in system_info
        assert 'python_version' in system_info
        assert 'working_directory' in system_info
        assert 'process_id' in system_info
    
    def test_get_performance_metrics(self, diagnostic_collector):
        """Test performance metrics collection"""
        metrics = diagnostic_collector.get_performance_metrics()
        
        assert 'cpu' in metrics
        assert 'memory' in metrics
        assert 'disk' in metrics
        assert 'network' in metrics
        
        # Check CPU metrics
        assert 'percent' in metrics['cpu']
        assert 'count' in metrics['cpu']
        
        # Check memory metrics
        assert 'total' in metrics['memory']
        assert 'available' in metrics['memory']
        assert 'percent' in metrics['memory']
    
    def test_analyze_recent_errors(self, diagnostic_collector):
        """Test recent error analysis"""
        # Add some test events
        diagnostic_collector.log_event(
            DiagnosticLevel.ERROR,
            'test-component',
            'Error 1'
        )
        
        diagnostic_collector.log_event(
            DiagnosticLevel.WARNING,
            'test-component',
            'Warning 1'
        )
        
        diagnostic_collector.log_event(
            DiagnosticLevel.CRITICAL,
            'test-component',
            'Critical 1'
        )
        
        recent_errors = diagnostic_collector.analyze_recent_errors(hours=1)
        
        # Should only return ERROR and CRITICAL events
        assert len(recent_errors) == 2
        assert all(event.level in [DiagnosticLevel.ERROR, DiagnosticLevel.CRITICAL] 
                  for event in recent_errors)

class TestTroubleshootingGuide:
    """Test troubleshooting recommendations"""
    
    @pytest.fixture
    def troubleshooting_guide(self):
        return TroubleshootingGuide()
    
    def test_high_memory_usage_detection(self, troubleshooting_guide):
        """Test high memory usage detection and recommendations"""
        mock_diagnostics = Mock()
        mock_diagnostics.performance_metrics = {
            'memory': {'percent': 85}  # High memory usage
        }
        mock_diagnostics.recent_errors = []
        
        recommendations = troubleshooting_guide.analyze_and_recommend(mock_diagnostics)
        
        # Should detect high memory usage
        memory_recommendations = [r for r in recommendations if 'memory' in r['issue'].lower()]
        assert len(memory_recommendations) > 0
        assert memory_recommendations[0]['severity'] == 'warning'
        assert 'memory leaks' in ' '.join(memory_recommendations[0]['recommendations']).lower()
    
    def test_aws_permission_error_detection(self, troubleshooting_guide):
        """Test AWS permission error detection"""
        mock_error = Mock()
        mock_error.message = "AccessDenied: User not authorized"
        
        mock_diagnostics = Mock()
        mock_diagnostics.performance_metrics = {'memory': {'percent': 50}}
        mock_diagnostics.recent_errors = [mock_error]
        
        recommendations = troubleshooting_guide.analyze_and_recommend(mock_diagnostics)
        
        # Should detect permission errors
        permission_recommendations = [r for r in recommendations if 'permission' in r['issue'].lower()]
        assert len(permission_recommendations) > 0
        assert permission_recommendations[0]['severity'] == 'error'
        assert 'IAM policies' in ' '.join(permission_recommendations[0]['recommendations'])

class TestHealthAPI:
    """Test health monitoring API endpoints"""
    
    def test_health_service_script(self):
        """Test the health service command line script"""
        from src.monitoring.health_service import get_monitoring_config
        
        config = get_monitoring_config()
        
        assert 'aws_region' in config
        assert 'dynamodb_tables' in config
        assert 's3_buckets' in config
        assert isinstance(config['dynamodb_tables'], list)
        assert isinstance(config['s3_buckets'], list)

@pytest.mark.integration
class TestHealthMonitoringIntegration:
    """Integration tests for health monitoring system"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_health_check(self):
        """Test complete health monitoring workflow"""
        config = {
            'aws_region': 'us-east-1',
            'dynamodb_tables': ['test-table'],
            's3_buckets': ['test-bucket']
        }
        
        health_monitor = SystemHealthMonitor(config)
        diagnostic_collector = DiagnosticCollector(region='us-east-1')
        
        # Mock AWS services to avoid actual AWS calls
        with patch.object(health_monitor.aws_checker, 'session'):
            # This would normally make real AWS calls
            # In a real integration test, you'd use actual AWS resources
            pass
        
        # Test diagnostic collection
        diagnostic_report = diagnostic_collector.generate_diagnostic_report()
        
        assert diagnostic_report.timestamp is not None
        assert diagnostic_report.system_info is not None
        assert diagnostic_report.performance_metrics is not None
        
        # Test export functionality
        exported_data = diagnostic_collector.export_diagnostics(diagnostic_report, 'json')
        parsed_data = json.loads(exported_data)
        
        assert 'timestamp' in parsed_data
        assert 'system_info' in parsed_data
        assert 'performance_metrics' in parsed_data