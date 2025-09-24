"""
Health Monitoring API - REST endpoints for system health and diagnostics
"""
import asyncio
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional
from flask import Blueprint, jsonify, request
from src.monitoring.health_checker import SystemHealthMonitor, HealthStatus
from src.monitoring.diagnostics import DiagnosticCollector, TroubleshootingGuide
import logging

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__, url_prefix='/api/system')

# Global instances
health_monitor: Optional[SystemHealthMonitor] = None
diagnostic_collector: Optional[DiagnosticCollector] = None
troubleshooting_guide = TroubleshootingGuide()

def initialize_monitoring():
    """Initialize monitoring components with configuration"""
    global health_monitor, diagnostic_collector
    
    config = {
        'aws_region': os.getenv('AWS_REGION', 'us-east-1'),
        'dynamodb_tables': [
            os.getenv('DDB_INVESTIGATIONS_TABLE', 'AsiaAgenticSocInvestigations'),
            os.getenv('DDB_METRICS_TABLE', 'AsiaAgenticSocMetrics')
        ],
        's3_buckets': [
            os.getenv('ARTIFACTS_BUCKET', 'asia-agentic-soc-artifacts'),
            os.getenv('AUDIT_BUCKET', 'asia-agentic-soc-audit')
        ],
        'step_functions_arn': os.getenv('STEP_FUNCTIONS_ARN')
    }
    
    health_monitor = SystemHealthMonitor(config)
    diagnostic_collector = DiagnosticCollector(region=config['aws_region'])
    
    logger.info("Health monitoring initialized")

@health_bp.route('/health', methods=['GET'])
def get_system_health():
    """Get comprehensive system health report"""
    try:
        if not health_monitor:
            initialize_monitoring()
        
        # Run health check asynchronously
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            report = loop.run_until_complete(health_monitor.run_comprehensive_health_check())
            return jsonify(health_monitor.to_dict(report))
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'overall_status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'services': [],
            'performance_metrics': {},
            'error_count': 1,
            'warnings': [f"Health check system error: {str(e)}"]
        }), 500

@health_bp.route('/health/quick', methods=['GET'])
def get_quick_health():
    """Get quick health status without detailed checks"""
    try:
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'uptime': 'unknown',
            'version': os.getenv('APP_VERSION', '1.0.0')
        })
    except Exception as e:
        logger.error(f"Quick health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }), 500

@health_bp.route('/diagnostics', methods=['GET'])
def get_system_diagnostics():
    """Get comprehensive system diagnostics"""
    try:
        if not diagnostic_collector:
            initialize_monitoring()
        
        report = diagnostic_collector.generate_diagnostic_report()
        
        # Add troubleshooting recommendations
        recommendations = troubleshooting_guide.analyze_and_recommend(report)
        
        diagnostic_data = {
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
        
        return jsonify(diagnostic_data)
        
    except Exception as e:
        logger.error(f"Diagnostics generation failed: {str(e)}")
        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'system_info': {'error': 'Failed to collect system info'},
            'aws_info': {'error': 'Failed to collect AWS info'},
            'performance_metrics': {'error': 'Failed to collect performance metrics'},
            'recent_errors': [],
            'resource_usage': {'error': 'Failed to collect resource usage'},
            'troubleshooting_recommendations': []
        }), 500

@health_bp.route('/diagnostics/export', methods=['GET'])
def export_diagnostics():
    """Export diagnostic report in specified format"""
    try:
        format_type = request.args.get('format', 'json').lower()
        
        if not diagnostic_collector:
            initialize_monitoring()
        
        report = diagnostic_collector.generate_diagnostic_report()
        
        if format_type == 'json':
            exported_data = diagnostic_collector.export_diagnostics(report, 'json')
            
            response = jsonify(json.loads(exported_data))
            response.headers['Content-Disposition'] = f'attachment; filename=diagnostics_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
            return response
        else:
            return jsonify({'error': f'Unsupported format: {format_type}'}), 400
            
    except Exception as e:
        logger.error(f"Diagnostics export failed: {str(e)}")
        return jsonify({'error': str(e)}), 500

@health_bp.route('/health/service/<service_name>', methods=['GET'])
def get_service_health(service_name: str):
    """Get health status for a specific service"""
    try:
        if not health_monitor:
            initialize_monitoring()
        
        # Run health check for specific service
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            if service_name.startswith('dynamodb-'):
                table_name = service_name.replace('dynamodb-', '')
                result = loop.run_until_complete(
                    health_monitor.aws_checker.check_dynamodb_health(table_name)
                )
            elif service_name.startswith('s3-'):
                bucket_name = service_name.replace('s3-', '')
                result = loop.run_until_complete(
                    health_monitor.aws_checker.check_s3_health(bucket_name)
                )
            elif service_name == 'bedrock':
                result = loop.run_until_complete(
                    health_monitor.aws_checker.check_bedrock_health()
                )
            elif service_name == 'eventbridge':
                result = loop.run_until_complete(
                    health_monitor.aws_checker.check_eventbridge_health()
                )
            elif service_name == 'stepfunctions':
                step_functions_arn = os.getenv('STEP_FUNCTIONS_ARN')
                if not step_functions_arn:
                    return jsonify({'error': 'Step Functions ARN not configured'}), 400
                result = loop.run_until_complete(
                    health_monitor.aws_checker.check_step_functions_health(step_functions_arn)
                )
            else:
                return jsonify({'error': f'Unknown service: {service_name}'}), 400
            
            return jsonify({
                'service_name': result.service_name,
                'status': result.status.value,
                'response_time_ms': result.response_time_ms,
                'last_check': result.last_check.isoformat(),
                'error_message': result.error_message,
                'metadata': result.metadata
            })
            
        finally:
            loop.close()
            
    except Exception as e:
        logger.error(f"Service health check failed for {service_name}: {str(e)}")
        return jsonify({
            'service_name': service_name,
            'status': 'unhealthy',
            'error': str(e),
            'last_check': datetime.now().isoformat()
        }), 500

@health_bp.route('/metrics/performance', methods=['GET'])
def get_performance_metrics():
    """Get current system performance metrics"""
    try:
        if not diagnostic_collector:
            initialize_monitoring()
        
        metrics = diagnostic_collector.get_performance_metrics()
        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'metrics': metrics
        })
        
    except Exception as e:
        logger.error(f"Performance metrics collection failed: {str(e)}")
        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'metrics': {}
        }), 500

@health_bp.route('/logs/errors', methods=['GET'])
def get_recent_errors():
    """Get recent error logs"""
    try:
        hours = int(request.args.get('hours', 24))
        
        if not diagnostic_collector:
            initialize_monitoring()
        
        errors = diagnostic_collector.analyze_recent_errors(hours)
        
        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'hours_analyzed': hours,
            'error_count': len(errors),
            'errors': [
                {
                    'timestamp': error.timestamp.isoformat(),
                    'level': error.level.value,
                    'component': error.component,
                    'message': error.message,
                    'details': error.details,
                    'correlation_id': error.correlation_id
                }
                for error in errors
            ]
        })
        
    except Exception as e:
        logger.error(f"Error log retrieval failed: {str(e)}")
        return jsonify({
            'timestamp': datetime.now().isoformat(),
            'error': str(e),
            'errors': []
        }), 500

# Initialize monitoring on module import
try:
    initialize_monitoring()
except Exception as e:
    logger.warning(f"Failed to initialize monitoring on import: {str(e)}")