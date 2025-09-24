#!/usr/bin/env python3
"""
Health Monitoring Service - Standalone service for system health monitoring
"""
import asyncio
import json
import os
import sys
import logging
from datetime import datetime
from typing import Dict, Any

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.monitoring.health_checker import SystemHealthMonitor
from src.monitoring.diagnostics import DiagnosticCollector, TroubleshootingGuide

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_monitoring_config() -> Dict[str, Any]:
    """Get monitoring configuration from environment variables"""
    return {
        'aws_region': os.getenv('AWS_REGION', 'us-east-1'),
        'dynamodb_tables': [
            os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations'),
            os.getenv('DDB_METRICS_TABLE', 'AsiaAgenticSocMetrics')
        ],
        's3_buckets': [
            os.getenv('ARTIFACTS_BUCKET', 'asia-agentic-soc-artifacts'),
            os.getenv('AUDIT_BUCKET', 'asia-agentic-soc-audit')
        ],
        'step_functions_arn': os.getenv('STATE_MACHINE_ARN')
    }

async def run_health_check() -> Dict[str, Any]:
    """Run comprehensive health check"""
    try:
        config = get_monitoring_config()
        health_monitor = SystemHealthMonitor(config)
        
        report = await health_monitor.run_comprehensive_health_check()
        return health_monitor.to_dict(report)
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            'overall_status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'services': [],
            'performance_metrics': {},
            'error_count': 1,
            'warnings': [f"Health check system error: {str(e)}"]
        }

def run_diagnostics() -> Dict[str, Any]:
    """Run system diagnostics"""
    try:
        config = get_monitoring_config()
        diagnostic_collector = DiagnosticCollector(region=config['aws_region'])
        troubleshooting_guide = TroubleshootingGuide()
        
        report = diagnostic_collector.generate_diagnostic_report()
        recommendations = troubleshooting_guide.analyze_and_recommend(report)
        
        return {
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
            'resource_usage': report.resource_usage,
            'troubleshooting_recommendations': recommendations
        }
        
    except Exception as e:
        logger.error(f"Diagnostics failed: {str(e)}")
        return {
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'system_info': {'error': 'Failed to collect system info'},
            'aws_info': {'error': 'Failed to collect AWS info'},
            'performance_metrics': {'error': 'Failed to collect performance metrics'},
            'recent_errors': [],
            'resource_usage': {'error': 'Failed to collect resource usage'},
            'troubleshooting_recommendations': []
        }

def main():
    """Main entry point for command line usage"""
    if len(sys.argv) < 2:
        print("Usage: python health_service.py [health|diagnostics]")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == 'health':
        result = asyncio.run(run_health_check())
        print(json.dumps(result, indent=2))
    elif command == 'diagnostics':
        result = run_diagnostics()
        print(json.dumps(result, indent=2))
    else:
        print(f"Unknown command: {command}")
        print("Available commands: health, diagnostics")
        sys.exit(1)

if __name__ == '__main__':
    main()