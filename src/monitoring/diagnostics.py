"""
System Diagnostics - Error logging and diagnostic tools for troubleshooting
"""
import json
import logging
import traceback
import boto3
import psutil
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)

class DiagnosticLevel(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class DiagnosticEvent:
    timestamp: datetime
    level: DiagnosticLevel
    component: str
    message: str
    details: Optional[Dict[str, Any]] = None
    stack_trace: Optional[str] = None
    correlation_id: Optional[str] = None

@dataclass
class SystemDiagnostics:
    timestamp: datetime
    system_info: Dict[str, Any]
    aws_info: Dict[str, Any]
    performance_metrics: Dict[str, Any]
    recent_errors: List[DiagnosticEvent]
    resource_usage: Dict[str, Any]

class DiagnosticCollector:
    """Collects system diagnostics and error information"""
    
    def __init__(self, region: str = 'us-east-1'):
        self.region = region
        self.session = boto3.Session()
        self.events: List[DiagnosticEvent] = []
        
    def log_event(self, level: DiagnosticLevel, component: str, message: str, 
                  details: Optional[Dict[str, Any]] = None, 
                  correlation_id: Optional[str] = None):
        """Log a diagnostic event"""
        event = DiagnosticEvent(
            timestamp=datetime.now(),
            level=level,
            component=component,
            message=message,
            details=details,
            stack_trace=traceback.format_exc() if level in [DiagnosticLevel.ERROR, DiagnosticLevel.CRITICAL] else None,
            correlation_id=correlation_id
        )
        
        self.events.append(event)
        
        # Also log to standard logger
        log_level = {
            DiagnosticLevel.INFO: logging.INFO,
            DiagnosticLevel.WARNING: logging.WARNING,
            DiagnosticLevel.ERROR: logging.ERROR,
            DiagnosticLevel.CRITICAL: logging.CRITICAL
        }[level]
        
        logger.log(log_level, f"[{component}] {message}", extra={
            'details': details,
            'correlation_id': correlation_id
        })
    
    def get_system_info(self) -> Dict[str, Any]:
        """Collect system information"""
        try:
            return {
                'platform': os.uname().sysname,
                'platform_version': os.uname().release,
                'architecture': os.uname().machine,
                'python_version': os.sys.version,
                'working_directory': os.getcwd(),
                'environment_variables': {
                    k: v for k, v in os.environ.items() 
                    if not any(secret in k.lower() for secret in ['key', 'secret', 'token', 'password'])
                },
                'process_id': os.getpid(),
                'user': os.getenv('USER', 'unknown')
            }
        except Exception as e:
            self.log_event(DiagnosticLevel.ERROR, "system_info", f"Failed to collect system info: {str(e)}")
            return {'error': str(e)}
    
    def get_aws_info(self) -> Dict[str, Any]:
        """Collect AWS environment information"""
        try:
            sts = self.session.client('sts', region_name=self.region)
            identity = sts.get_caller_identity()
            
            return {
                'region': self.region,
                'account_id': identity.get('Account'),
                'user_arn': identity.get('Arn'),
                'user_id': identity.get('UserId'),
                'aws_access_key_id': self.session.get_credentials().access_key[:8] + '...' if self.session.get_credentials() else None,
                'profile': self.session.profile_name
            }
        except Exception as e:
            self.log_event(DiagnosticLevel.ERROR, "aws_info", f"Failed to collect AWS info: {str(e)}")
            return {'error': str(e)}
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Collect system performance metrics"""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            # Memory metrics
            memory = psutil.virtual_memory()
            
            # Disk metrics
            disk = psutil.disk_usage('/')
            
            # Network metrics (if available)
            try:
                network = psutil.net_io_counters()
                network_stats = {
                    'bytes_sent': network.bytes_sent,
                    'bytes_recv': network.bytes_recv,
                    'packets_sent': network.packets_sent,
                    'packets_recv': network.packets_recv
                }
            except:
                network_stats = {'error': 'Network stats unavailable'}
            
            return {
                'cpu': {
                    'percent': cpu_percent,
                    'count': cpu_count,
                    'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
                },
                'memory': {
                    'total': memory.total,
                    'available': memory.available,
                    'percent': memory.percent,
                    'used': memory.used,
                    'free': memory.free
                },
                'disk': {
                    'total': disk.total,
                    'used': disk.used,
                    'free': disk.free,
                    'percent': (disk.used / disk.total) * 100
                },
                'network': network_stats
            }
        except Exception as e:
            self.log_event(DiagnosticLevel.ERROR, "performance_metrics", f"Failed to collect performance metrics: {str(e)}")
            return {'error': str(e)}
    
    def get_resource_usage(self) -> Dict[str, Any]:
        """Get detailed resource usage information"""
        try:
            process = psutil.Process()
            
            return {
                'process': {
                    'pid': process.pid,
                    'name': process.name(),
                    'status': process.status(),
                    'create_time': datetime.fromtimestamp(process.create_time()).isoformat(),
                    'cpu_percent': process.cpu_percent(),
                    'memory_info': process.memory_info()._asdict(),
                    'memory_percent': process.memory_percent(),
                    'num_threads': process.num_threads(),
                    'open_files': len(process.open_files()) if hasattr(process, 'open_files') else 0
                },
                'system': {
                    'boot_time': datetime.fromtimestamp(psutil.boot_time()).isoformat(),
                    'users': [user._asdict() for user in psutil.users()],
                    'process_count': len(psutil.pids())
                }
            }
        except Exception as e:
            self.log_event(DiagnosticLevel.ERROR, "resource_usage", f"Failed to collect resource usage: {str(e)}")
            return {'error': str(e)}
    
    def check_aws_service_limits(self) -> Dict[str, Any]:
        """Check AWS service limits and usage"""
        try:
            limits_info = {}
            
            # Check DynamoDB limits
            try:
                dynamodb = self.session.client('dynamodb', region_name=self.region)
                limits = dynamodb.describe_limits()
                limits_info['dynamodb'] = {
                    'account_max_read_capacity_units': limits.get('AccountMaxReadCapacityUnits'),
                    'account_max_write_capacity_units': limits.get('AccountMaxWriteCapacityUnits'),
                    'table_max_read_capacity_units': limits.get('TableMaxReadCapacityUnits'),
                    'table_max_write_capacity_units': limits.get('TableMaxWriteCapacityUnits')
                }
            except Exception as e:
                limits_info['dynamodb'] = {'error': str(e)}
            
            # Check Lambda limits (via CloudWatch if available)
            try:
                cloudwatch = self.session.client('cloudwatch', region_name=self.region)
                # Get Lambda concurrent executions metric
                end_time = datetime.now()
                start_time = end_time - timedelta(hours=1)
                
                metrics = cloudwatch.get_metric_statistics(
                    Namespace='AWS/Lambda',
                    MetricName='ConcurrentExecutions',
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=3600,
                    Statistics=['Maximum']
                )
                
                limits_info['lambda'] = {
                    'recent_max_concurrent_executions': max([m['Maximum'] for m in metrics['Datapoints']], default=0),
                    'account_concurrent_execution_limit': 1000  # Default limit
                }
            except Exception as e:
                limits_info['lambda'] = {'error': str(e)}
            
            return limits_info
            
        except Exception as e:
            self.log_event(DiagnosticLevel.ERROR, "service_limits", f"Failed to check service limits: {str(e)}")
            return {'error': str(e)}
    
    def analyze_recent_errors(self, hours: int = 24) -> List[DiagnosticEvent]:
        """Analyze recent error events"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        recent_errors = [
            event for event in self.events
            if event.timestamp >= cutoff_time and event.level in [DiagnosticLevel.ERROR, DiagnosticLevel.CRITICAL]
        ]
        
        return recent_errors
    
    def generate_diagnostic_report(self) -> SystemDiagnostics:
        """Generate comprehensive diagnostic report"""
        self.log_event(DiagnosticLevel.INFO, "diagnostics", "Generating diagnostic report")
        
        return SystemDiagnostics(
            timestamp=datetime.now(),
            system_info=self.get_system_info(),
            aws_info=self.get_aws_info(),
            performance_metrics=self.get_performance_metrics(),
            recent_errors=self.analyze_recent_errors(),
            resource_usage=self.get_resource_usage()
        )
    
    def export_diagnostics(self, report: SystemDiagnostics, format: str = 'json') -> str:
        """Export diagnostic report in specified format"""
        if format.lower() == 'json':
            return json.dumps({
                'timestamp': report.timestamp.isoformat(),
                'system_info': report.system_info,
                'aws_info': report.aws_info,
                'performance_metrics': report.performance_metrics,
                'recent_errors': [
                    {
                        'timestamp': event.timestamp.isoformat(),
                        'level': event.level.value,
                        'component': event.component,
                        'message': event.message,
                        'details': event.details,
                        'stack_trace': event.stack_trace,
                        'correlation_id': event.correlation_id
                    }
                    for event in report.recent_errors
                ],
                'resource_usage': report.resource_usage
            }, indent=2)
        else:
            raise ValueError(f"Unsupported format: {format}")

class TroubleshootingGuide:
    """Provides troubleshooting guidance based on diagnostic information"""
    
    def __init__(self):
        self.troubleshooting_rules = {
            'high_memory_usage': {
                'condition': lambda metrics: metrics.get('memory', {}).get('percent', 0) > 80,
                'message': 'High memory usage detected',
                'recommendations': [
                    'Check for memory leaks in application code',
                    'Consider increasing instance size',
                    'Review DynamoDB and S3 client connection pooling',
                    'Monitor garbage collection if using Python'
                ]
            },
            'high_cpu_usage': {
                'condition': lambda metrics: metrics.get('cpu', {}).get('percent', 0) > 80,
                'message': 'High CPU usage detected',
                'recommendations': [
                    'Check for CPU-intensive operations',
                    'Review AI model inference performance',
                    'Consider scaling horizontally',
                    'Optimize database queries'
                ]
            },
            'aws_permission_errors': {
                'condition': lambda errors: any('AccessDenied' in str(error.message) for error in errors),
                'message': 'AWS permission errors detected',
                'recommendations': [
                    'Review IAM policies and roles',
                    'Check cross-account access permissions',
                    'Verify resource-based policies',
                    'Ensure proper AWS credentials configuration'
                ]
            },
            'service_unavailable': {
                'condition': lambda errors: any('ServiceUnavailable' in str(error.message) for error in errors),
                'message': 'AWS service unavailability detected',
                'recommendations': [
                    'Check AWS service health dashboard',
                    'Implement exponential backoff retry logic',
                    'Consider using multiple regions',
                    'Review service quotas and limits'
                ]
            }
        }
    
    def analyze_and_recommend(self, diagnostics: SystemDiagnostics) -> List[Dict[str, Any]]:
        """Analyze diagnostics and provide troubleshooting recommendations"""
        recommendations = []
        
        for rule_name, rule in self.troubleshooting_rules.items():
            try:
                if rule_name in ['high_memory_usage', 'high_cpu_usage']:
                    if rule['condition'](diagnostics.performance_metrics):
                        recommendations.append({
                            'issue': rule['message'],
                            'severity': 'warning',
                            'recommendations': rule['recommendations']
                        })
                elif rule_name in ['aws_permission_errors', 'service_unavailable']:
                    if rule['condition'](diagnostics.recent_errors):
                        recommendations.append({
                            'issue': rule['message'],
                            'severity': 'error',
                            'recommendations': rule['recommendations']
                        })
            except Exception as e:
                logger.warning(f"Failed to evaluate troubleshooting rule {rule_name}: {str(e)}")
        
        return recommendations