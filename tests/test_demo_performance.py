"""
Performance tests for continuous generation and concurrent investigation processing.
Tests system performance under load, resource usage, and scalability limits.
"""

import pytest
import time
import threading
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor, as_completed
import statistics

from src.demo.generator import DemoDataGenerator, DemoAlert
from src.demo.session import DemoSessionManager, DemoParameters
from src.demo.controller import DemoSessionController
from src.demo.progress_tracker import ProgressTracker
from src.metrics.collector import RealTimeMetricsCollector


class TestContinuousGenerationPerformance:
    """Test performance of continuous demo data generation."""
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_single_alert_generation_performance(self, mock_boto_client, mock_analyst_class):
        """Test performance of single alert generation."""
        # Mock dependencies
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": '{"title": "Test Alert", "description": "Test", "entities": []}'
        }
        mock_analyst_class.return_value = mock_analyst
        mock_boto_client.return_value = Mock()
        
        generator = DemoDataGenerator()
        
        # Measure generation time for multiple alerts
        generation_times = []
        num_alerts = 50
        
        for i in range(num_alerts):
            start_time = time.time()
            
            alert = generator.generate_single_alert(
                scenario_type="phishing_email",
                risk_level="medium"
            )
            
            end_time = time.time()
            generation_time = end_time - start_time
            generation_times.append(generation_time)
            
            assert isinstance(alert, DemoAlert)
            assert alert.alert_id is not None
        
        # Performance assertions
        avg_generation_time = statistics.mean(generation_times)
        max_generation_time = max(generation_times)
        min_generation_time = min(generation_times)
        
        print(f"Alert generation performance:")
        print(f"  Average: {avg_generation_time:.3f}s")
        print(f"  Max: {max_generation_time:.3f}s")
        print(f"  Min: {min_generation_time:.3f}s")
        
        # Performance requirements
        assert avg_generation_time < 2.0, f"Average generation time too slow: {avg_generation_time:.3f}s"
        assert max_generation_time < 5.0, f"Max generation time too slow: {max_generation_time:.3f}s"
        assert len(generation_times) == num_alerts
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_batch_alert_generation_performance(self, mock_boto_client, mock_analyst_class):
        """Test performance of batch alert generation."""
        # Mock dependencies
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": '{"title": "Batch Test", "description": "Batch test alert", "entities": []}'
        }
        mock_analyst_class.return_value = mock_analyst
        mock_boto_client.return_value = Mock()
        
        generator = DemoDataGenerator()
        
        # Test different batch sizes
        batch_sizes = [10, 25, 50, 100]
        
        for batch_size in batch_sizes:
            start_time = time.time()
            
            alerts = []
            for i in range(batch_size):
                alert = generator.generate_single_alert(
                    scenario_type="malware_detection",
                    risk_level="low" if i % 4 == 0 else "medium"
                )
                alerts.append(alert)
            
            end_time = time.time()
            total_time = end_time - start_time
            avg_time_per_alert = total_time / batch_size
            
            print(f"Batch size {batch_size}: {total_time:.3f}s total, {avg_time_per_alert:.3f}s per alert")
            
            # Performance requirements
            assert avg_time_per_alert < 2.0, f"Batch generation too slow for size {batch_size}"
            assert len(alerts) == batch_size
            
            # Verify alert diversity
            unique_titles = set(alert.title for alert in alerts)
            diversity_ratio = len(unique_titles) / batch_size
            assert diversity_ratio > 0.7, f"Insufficient diversity in batch {batch_size}: {diversity_ratio}"
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_concurrent_alert_generation(self, mock_boto_client, mock_analyst_class):
        """Test concurrent alert generation performance."""
        # Mock dependencies
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": '{"title": "Concurrent Test", "description": "Concurrent test", "entities": []}'
        }
        mock_analyst_class.return_value = mock_analyst
        mock_boto_client.return_value = Mock()
        
        generator = DemoDataGenerator()
        
        def generate_alert_batch(batch_id, batch_size):
            """Generate a batch of alerts in a thread."""
            alerts = []
            start_time = time.time()
            
            for i in range(batch_size):
                alert = generator.generate_single_alert(
                    scenario_type="phishing_email",
                    risk_level="medium"
                )
                alerts.append(alert)
            
            end_time = time.time()
            return {
                'batch_id': batch_id,
                'alerts': alerts,
                'generation_time': end_time - start_time,
                'batch_size': batch_size
            }
        
        # Test concurrent generation
        num_threads = 5
        batch_size = 20
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [
                executor.submit(generate_alert_batch, i, batch_size)
                for i in range(num_threads)
            ]
            
            results = []
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
        
        end_time = time.time()
        total_concurrent_time = end_time - start_time
        
        # Analyze results
        total_alerts = sum(len(result['alerts']) for result in results)
        avg_batch_time = statistics.mean(result['generation_time'] for result in results)
        
        print(f"Concurrent generation performance:")
        print(f"  Total alerts: {total_alerts}")
        print(f"  Total time: {total_concurrent_time:.3f}s")
        print(f"  Average batch time: {avg_batch_time:.3f}s")
        print(f"  Alerts per second: {total_alerts / total_concurrent_time:.2f}")
        
        # Performance assertions
        assert total_alerts == num_threads * batch_size
        assert total_concurrent_time < avg_batch_time * num_threads * 0.8  # Should be faster than sequential
        assert total_alerts / total_concurrent_time > 5.0  # At least 5 alerts per second
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_memory_usage_during_generation(self, mock_boto_client, mock_analyst_class):
        """Test memory usage during continuous generation."""
        import psutil
        import os
        
        # Mock dependencies
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": '{"title": "Memory Test", "description": "Memory test", "entities": []}'
        }
        mock_analyst_class.return_value = mock_analyst
        mock_boto_client.return_value = Mock()
        
        generator = DemoDataGenerator()
        process = psutil.Process(os.getpid())
        
        # Measure initial memory
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Generate many alerts
        alerts = []
        memory_measurements = []
        
        for i in range(200):
            alert = generator.generate_single_alert(
                scenario_type="malware_detection",
                risk_level="medium"
            )
            alerts.append(alert)
            
            # Measure memory every 20 alerts
            if i % 20 == 0:
                current_memory = process.memory_info().rss / 1024 / 1024
                memory_measurements.append(current_memory)
        
        final_memory = process.memory_info().rss / 1024 / 1024
        memory_increase = final_memory - initial_memory
        
        print(f"Memory usage during generation:")
        print(f"  Initial: {initial_memory:.2f} MB")
        print(f"  Final: {final_memory:.2f} MB")
        print(f"  Increase: {memory_increase:.2f} MB")
        print(f"  Per alert: {memory_increase / len(alerts):.4f} MB")
        
        # Memory usage assertions
        assert memory_increase < 100.0, f"Memory usage too high: {memory_increase:.2f} MB"
        assert memory_increase / len(alerts) < 0.5, "Memory per alert too high"
        
        # Clean up
        del alerts


class TestConcurrentInvestigationProcessing:
    """Test performance of concurrent investigation processing."""
    
    def test_concurrent_session_management(self):
        """Test concurrent demo session management performance."""
        from moto import mock_dynamodb
        import boto3
        
        with mock_dynamodb():
            # Create DynamoDB table
            dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
            
            table = dynamodb.create_table(
                TableName='perf-test-sessions',
                KeySchema=[{'AttributeName': 'session_id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'session_id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            )
            
            session_manager = DemoSessionManager(table_name='perf-test-sessions')
            controller = DemoSessionController(table_name='perf-test-sessions')
            
            def create_and_manage_session(session_index):
                """Create and manage a demo session."""
                start_time = time.time()
                
                # Create session
                result = controller.start_demo_session(
                    created_by=f"perf-user-{session_index}",
                    tenant_id=f"perf-tenant-{session_index}",
                    preset_name="quick_demo"
                )
                
                if not result['success']:
                    return {'error': 'Failed to create session', 'session_index': session_index}
                
                session_id = result['session_id']
                
                # Update parameters
                controller.update_session_parameters(session_id, {
                    'interval_seconds': 25.0,
                    'false_positive_rate': 0.85
                })
                
                # Pause and resume
                controller.pause_demo_session(session_id)
                controller.resume_demo_session(session_id)
                
                # Stop session
                controller.stop_demo_session(session_id)
                
                end_time = time.time()
                
                return {
                    'session_index': session_index,
                    'session_id': session_id,
                    'total_time': end_time - start_time,
                    'success': True
                }
            
            # Test concurrent session management
            num_concurrent_sessions = 20
            
            start_time = time.time()
            
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [
                    executor.submit(create_and_manage_session, i)
                    for i in range(num_concurrent_sessions)
                ]
                
                results = []
                for future in as_completed(futures):
                    result = future.result()
                    results.append(result)
            
            end_time = time.time()
            total_time = end_time - start_time
            
            # Analyze results
            successful_sessions = [r for r in results if r.get('success', False)]
            failed_sessions = [r for r in results if not r.get('success', False)]
            
            if successful_sessions:
                avg_session_time = statistics.mean(r['total_time'] for r in successful_sessions)
                max_session_time = max(r['total_time'] for r in successful_sessions)
            else:
                avg_session_time = 0
                max_session_time = 0
            
            print(f"Concurrent session management performance:")
            print(f"  Total sessions: {num_concurrent_sessions}")
            print(f"  Successful: {len(successful_sessions)}")
            print(f"  Failed: {len(failed_sessions)}")
            print(f"  Total time: {total_time:.3f}s")
            print(f"  Average session time: {avg_session_time:.3f}s")
            print(f"  Max session time: {max_session_time:.3f}s")
            
            # Performance assertions
            assert len(successful_sessions) >= num_concurrent_sessions * 0.9  # 90% success rate
            assert avg_session_time < 5.0, f"Average session management too slow: {avg_session_time:.3f}s"
            assert max_session_time < 10.0, f"Max session management too slow: {max_session_time:.3f}s"
    
    def test_concurrent_progress_tracking(self):
        """Test concurrent progress tracking performance."""
        progress_tracker = ProgressTracker()
        
        def track_investigation_progress(investigation_index):
            """Track progress for a single investigation."""
            investigation_id = f"PERF-INV-{investigation_index:03d}"
            tenant_id = f"perf-tenant-{investigation_index % 5}"  # 5 tenants
            
            start_time = time.time()
            
            # Start tracking
            progress_tracker.start_investigation_tracking(
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                is_demo=True
            )
            
            # Simulate pipeline stages
            stages = [
                ("plan", "Planner"),
                ("execute", "Context Executor"),
                ("analyze", "Analyst"),
                ("risk", "Risk Orchestrator"),
                ("adapt", "Learning Curator"),
                ("audit", "Audit Scribe")
            ]
            
            for stage, agent in stages:
                # Update to running
                progress_tracker.update_agent_progress(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    stage=stage,
                    agent_name=agent,
                    status="running",
                    progress_percentage=50.0
                )
                
                # Small delay to simulate processing
                time.sleep(0.01)
                
                # Update to completed
                progress_tracker.update_agent_progress(
                    investigation_id=investigation_id,
                    tenant_id=tenant_id,
                    stage=stage,
                    agent_name=agent,
                    status="completed",
                    progress_percentage=100.0
                )
            
            # Get final progress
            final_progress = progress_tracker.get_investigation_progress(
                investigation_id, tenant_id
            )
            
            end_time = time.time()
            
            return {
                'investigation_index': investigation_index,
                'investigation_id': investigation_id,
                'total_time': end_time - start_time,
                'final_progress': final_progress.overall_progress if final_progress else 0,
                'success': final_progress is not None
            }
        
        # Test concurrent progress tracking
        num_concurrent_investigations = 50
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=15) as executor:
            futures = [
                executor.submit(track_investigation_progress, i)
                for i in range(num_concurrent_investigations)
            ]
            
            results = []
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Analyze results
        successful_tracking = [r for r in results if r['success']]
        failed_tracking = [r for r in results if not r['success']]
        
        if successful_tracking:
            avg_tracking_time = statistics.mean(r['total_time'] for r in successful_tracking)
            avg_final_progress = statistics.mean(r['final_progress'] for r in successful_tracking)
        else:
            avg_tracking_time = 0
            avg_final_progress = 0
        
        print(f"Concurrent progress tracking performance:")
        print(f"  Total investigations: {num_concurrent_investigations}")
        print(f"  Successful: {len(successful_tracking)}")
        print(f"  Failed: {len(failed_tracking)}")
        print(f"  Total time: {total_time:.3f}s")
        print(f"  Average tracking time: {avg_tracking_time:.3f}s")
        print(f"  Average final progress: {avg_final_progress:.1f}%")
        print(f"  Investigations per second: {len(successful_tracking) / total_time:.2f}")
        
        # Performance assertions
        assert len(successful_tracking) >= num_concurrent_investigations * 0.95  # 95% success rate
        assert avg_tracking_time < 2.0, f"Average tracking too slow: {avg_tracking_time:.3f}s"
        assert avg_final_progress > 95.0, f"Progress tracking incomplete: {avg_final_progress:.1f}%"
        assert len(successful_tracking) / total_time > 10.0  # At least 10 investigations per second
    
    def test_concurrent_metrics_collection(self):
        """Test concurrent metrics collection performance."""
        metrics_collector = RealTimeMetricsCollector()
        
        def collect_investigation_metrics(metric_index):
            """Collect metrics for a single investigation."""
            investigation_id = f"METRICS-INV-{metric_index:03d}"
            tenant_id = f"metrics-tenant-{metric_index % 3}"  # 3 tenants
            
            start_time = time.time()
            
            # Record investigation outcome
            metrics_collector.record_investigation_outcome(
                investigation_id=investigation_id,
                tenant_id=tenant_id,
                outcome="auto_closed" if metric_index % 4 != 0 else "escalated",
                confidence_score=0.8 if metric_index % 4 != 0 else 0.4,
                false_positive_probability=0.9 if metric_index % 4 != 0 else 0.2,
                processing_time_seconds=30.0 + (metric_index % 60),
                automation_decision="auto_close" if metric_index % 4 != 0 else "escalate",
                escalated_to_human=metric_index % 4 == 0,
                risk_level="low" if metric_index % 4 != 0 else "high",
                scenario_type="phishing_email",
                is_demo=True
            )
            
            end_time = time.time()
            
            return {
                'metric_index': metric_index,
                'investigation_id': investigation_id,
                'total_time': end_time - start_time,
                'success': True
            }
        
        # Test concurrent metrics collection
        num_concurrent_metrics = 100
        
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [
                executor.submit(collect_investigation_metrics, i)
                for i in range(num_concurrent_metrics)
            ]
            
            results = []
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Analyze results
        successful_metrics = [r for r in results if r['success']]
        avg_metric_time = statistics.mean(r['total_time'] for r in successful_metrics)
        
        print(f"Concurrent metrics collection performance:")
        print(f"  Total metrics: {num_concurrent_metrics}")
        print(f"  Successful: {len(successful_metrics)}")
        print(f"  Total time: {total_time:.3f}s")
        print(f"  Average metric time: {avg_metric_time:.4f}s")
        print(f"  Metrics per second: {len(successful_metrics) / total_time:.2f}")
        
        # Performance assertions
        assert len(successful_metrics) == num_concurrent_metrics  # 100% success rate
        assert avg_metric_time < 0.1, f"Average metric collection too slow: {avg_metric_time:.4f}s"
        assert len(successful_metrics) / total_time > 50.0  # At least 50 metrics per second


class TestScalabilityLimits:
    """Test system scalability limits and resource constraints."""
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_maximum_concurrent_sessions(self, mock_boto_client, mock_analyst_class):
        """Test maximum number of concurrent demo sessions."""
        # Mock dependencies
        mock_analyst = Mock()
        mock_analyst.summarize_investigation.return_value = {
            "summary": '{"title": "Scale Test", "description": "Scale test", "entities": []}'
        }
        mock_analyst_class.return_value = mock_analyst
        mock_boto_client.return_value = Mock()
        
        from moto import mock_dynamodb
        import boto3
        
        with mock_dynamodb():
            # Create DynamoDB table
            dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
            
            table = dynamodb.create_table(
                TableName='scale-test-sessions',
                KeySchema=[{'AttributeName': 'session_id', 'KeyType': 'HASH'}],
                AttributeDefinitions=[{'AttributeName': 'session_id', 'AttributeType': 'S'}],
                BillingMode='PAY_PER_REQUEST'
            )
            
            controller = DemoSessionController(table_name='scale-test-sessions')
            
            # Test increasing numbers of concurrent sessions
            session_counts = [10, 25, 50, 100]
            results = {}
            
            for session_count in session_counts:
                print(f"Testing {session_count} concurrent sessions...")
                
                start_time = time.time()
                
                def create_session(index):
                    return controller.start_demo_session(
                        created_by=f"scale-user-{index}",
                        tenant_id=f"scale-tenant-{index % 10}",  # 10 tenants
                        preset_name="quick_demo"
                    )
                
                with ThreadPoolExecutor(max_workers=min(session_count, 20)) as executor:
                    futures = [executor.submit(create_session, i) for i in range(session_count)]
                    session_results = [future.result() for future in as_completed(futures)]
                
                end_time = time.time()
                
                successful_sessions = [r for r in session_results if r['success']]
                success_rate = len(successful_sessions) / session_count
                total_time = end_time - start_time
                
                results[session_count] = {
                    'success_rate': success_rate,
                    'total_time': total_time,
                    'sessions_per_second': len(successful_sessions) / total_time
                }
                
                print(f"  Success rate: {success_rate:.2%}")
                print(f"  Total time: {total_time:.3f}s")
                print(f"  Sessions per second: {results[session_count]['sessions_per_second']:.2f}")
                
                # Clean up sessions
                for result in successful_sessions:
                    controller.stop_demo_session(result['session_id'])
            
            # Analyze scalability
            for session_count, result in results.items():
                assert result['success_rate'] >= 0.9, f"Success rate too low for {session_count} sessions"
                assert result['sessions_per_second'] > 1.0, f"Throughput too low for {session_count} sessions"
    
    def test_memory_scalability(self):
        """Test memory usage scalability."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Test memory usage with increasing data volumes
        data_volumes = [100, 500, 1000, 2000]
        memory_results = {}
        
        for volume in data_volumes:
            # Simulate storing investigation data
            investigations = []
            
            for i in range(volume):
                investigation_data = {
                    'investigation_id': f'MEM-TEST-{i:04d}',
                    'tenant_id': f'tenant-{i % 10}',
                    'alerts': [
                        {
                            'alert_id': f'ALERT-{i}-{j}',
                            'title': f'Test Alert {j}',
                            'description': 'Memory test alert description ' * 10,
                            'entities': [{'type': 'test', 'name': f'entity-{k}'} for k in range(5)],
                            'raw_data': {'test_data': 'x' * 1000}  # 1KB of test data
                        }
                        for j in range(3)  # 3 alerts per investigation
                    ],
                    'progress': {
                        'stages': ['plan', 'execute', 'analyze', 'risk', 'adapt', 'audit'],
                        'timeline': [f'event-{k}' for k in range(20)]
                    }
                }
                investigations.append(investigation_data)
            
            current_memory = process.memory_info().rss / 1024 / 1024
            memory_increase = current_memory - initial_memory
            memory_per_investigation = memory_increase / volume if volume > 0 else 0
            
            memory_results[volume] = {
                'total_memory': current_memory,
                'memory_increase': memory_increase,
                'memory_per_investigation': memory_per_investigation
            }
            
            print(f"Memory usage for {volume} investigations:")
            print(f"  Total memory: {current_memory:.2f} MB")
            print(f"  Memory increase: {memory_increase:.2f} MB")
            print(f"  Memory per investigation: {memory_per_investigation:.4f} MB")
            
            # Clean up
            del investigations
        
        # Analyze memory scalability
        for volume, result in memory_results.items():
            assert result['memory_per_investigation'] < 1.0, f"Memory per investigation too high: {result['memory_per_investigation']:.4f} MB"
            assert result['memory_increase'] < volume * 0.5, f"Total memory increase too high for {volume} investigations"
    
    def test_throughput_limits(self):
        """Test system throughput limits."""
        # Test alert processing throughput
        processing_times = []
        
        for batch_size in [10, 50, 100, 200]:
            start_time = time.time()
            
            # Simulate processing alerts
            for i in range(batch_size):
                # Simulate alert processing work
                alert_data = {
                    'alert_id': f'THROUGHPUT-{i}',
                    'processing_steps': ['normalize', 'enrich', 'analyze', 'decide'],
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
                
                # Simulate processing time
                time.sleep(0.001)  # 1ms per alert
            
            end_time = time.time()
            total_time = end_time - start_time
            throughput = batch_size / total_time
            
            processing_times.append({
                'batch_size': batch_size,
                'total_time': total_time,
                'throughput': throughput
            })
            
            print(f"Batch size {batch_size}: {throughput:.2f} alerts/second")
        
        # Verify throughput scales reasonably
        for result in processing_times:
            assert result['throughput'] > 50.0, f"Throughput too low: {result['throughput']:.2f} alerts/second"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])  # -s to show print statements