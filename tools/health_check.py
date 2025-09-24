#!/usr/bin/env python3
"""
Health Check CLI Tool - Command line interface for system health monitoring
"""
import argparse
import asyncio
import json
import sys
import os
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.monitoring.health_service import run_health_check, run_diagnostics

def format_health_report(report):
    """Format health report for console output"""
    print(f"\n{'='*60}")
    print(f"SYSTEM HEALTH REPORT - {report['timestamp']}")
    print(f"{'='*60}")
    
    # Overall status
    status_color = {
        'healthy': '\033[92m',  # Green
        'degraded': '\033[93m', # Yellow
        'unhealthy': '\033[91m', # Red
        'unknown': '\033[94m'   # Blue
    }
    reset_color = '\033[0m'
    
    status = report['overall_status']
    color = status_color.get(status, '')
    print(f"Overall Status: {color}{status.upper()}{reset_color}")
    
    # Performance metrics
    metrics = report.get('performance_metrics', {})
    if metrics:
        print(f"\nPerformance Summary:")
        print(f"  Total Services: {metrics.get('total_services_checked', 0)}")
        healthy_color = color if status == 'healthy' else '\033[92m'
        print(f"  Healthy: {healthy_color}{metrics.get('healthy_services', 0)}{reset_color}")
        print(f"  Degraded: {metrics.get('degraded_services', 0)}")
        print(f"  Unhealthy: {metrics.get('unhealthy_services', 0)}")
        print(f"  Avg Response Time: {metrics.get('avg_response_time_ms', 0):.1f}ms")
    
    # Service details
    services = report.get('services', [])
    if services:
        print(f"\nService Details:")
        print(f"{'Service':<25} {'Status':<12} {'Response Time':<15} {'Last Check'}")
        print(f"{'-'*70}")
        
        for service in services:
            service_name = service['service_name'][:24]
            status = service['status']
            response_time = f"{service.get('response_time_ms', 0):.1f}ms" if service.get('response_time_ms') else 'N/A'
            last_check = datetime.fromisoformat(service['last_check']).strftime('%H:%M:%S')
            
            status_display = f"{status_color.get(status, '')}{status:<12}{reset_color}"
            print(f"{service_name:<25} {status_display} {response_time:<15} {last_check}")
    
    # Warnings
    warnings = report.get('warnings', [])
    if warnings:
        print(f"\nWarnings:")
        for warning in warnings:
            print(f"  ⚠️  {warning}")
    
    # Errors
    error_count = report.get('error_count', 0)
    if error_count > 0:
        print(f"\nErrors: {error_count} error(s) detected")
        if 'error' in report:
            print(f"  ❌ {report['error']}")

def format_diagnostics_report(report):
    """Format diagnostics report for console output"""
    print(f"\n{'='*60}")
    print(f"SYSTEM DIAGNOSTICS REPORT - {report['timestamp']}")
    print(f"{'='*60}")
    
    # System info
    system_info = report.get('system_info', {})
    if system_info and 'error' not in system_info:
        print(f"\nSystem Information:")
        print(f"  Platform: {system_info.get('platform', 'Unknown')}")
        print(f"  Architecture: {system_info.get('architecture', 'Unknown')}")
        print(f"  Python Version: {system_info.get('python_version', 'Unknown')}")
        print(f"  Process ID: {system_info.get('process_id', 'Unknown')}")
    
    # AWS info
    aws_info = report.get('aws_info', {})
    if aws_info and 'error' not in aws_info:
        print(f"\nAWS Information:")
        print(f"  Region: {aws_info.get('region', 'Unknown')}")
        print(f"  Account ID: {aws_info.get('account_id', 'Unknown')}")
        print(f"  User ARN: {aws_info.get('user_arn', 'Unknown')}")
    
    # Performance metrics
    perf_metrics = report.get('performance_metrics', {})
    if perf_metrics and 'error' not in perf_metrics:
        print(f"\nPerformance Metrics:")
        
        cpu = perf_metrics.get('cpu', {})
        if cpu:
            print(f"  CPU Usage: {cpu.get('percent', 0):.1f}%")
            print(f"  CPU Cores: {cpu.get('count', 'Unknown')}")
        
        memory = perf_metrics.get('memory', {})
        if memory:
            total_gb = memory.get('total', 0) / (1024**3)
            used_gb = memory.get('used', 0) / (1024**3)
            print(f"  Memory Usage: {memory.get('percent', 0):.1f}% ({used_gb:.1f}GB / {total_gb:.1f}GB)")
        
        disk = perf_metrics.get('disk', {})
        if disk:
            total_gb = disk.get('total', 0) / (1024**3)
            used_gb = disk.get('used', 0) / (1024**3)
            print(f"  Disk Usage: {disk.get('percent', 0):.1f}% ({used_gb:.1f}GB / {total_gb:.1f}GB)")
    
    # Recent errors
    recent_errors = report.get('recent_errors', [])
    if recent_errors:
        print(f"\nRecent Errors ({len(recent_errors)}):")
        for error in recent_errors[:5]:  # Show only first 5 errors
            timestamp = datetime.fromisoformat(error['timestamp']).strftime('%H:%M:%S')
            level = error['level'].upper()
            component = error['component']
            message = error['message'][:80] + '...' if len(error['message']) > 80 else error['message']
            print(f"  [{timestamp}] {level} - {component}: {message}")
    
    # Troubleshooting recommendations
    recommendations = report.get('troubleshooting_recommendations', [])
    if recommendations:
        print(f"\nTroubleshooting Recommendations:")
        for rec in recommendations:
            severity = rec['severity'].upper()
            issue = rec['issue']
            print(f"  {severity}: {issue}")
            for suggestion in rec['recommendations'][:3]:  # Show first 3 recommendations
                print(f"    • {suggestion}")

def main():
    parser = argparse.ArgumentParser(description='NeoHarbour Security Health Check Tool')
    parser.add_argument('command', choices=['health', 'diagnostics', 'both'], 
                       help='Type of check to run')
    parser.add_argument('--json', action='store_true', 
                       help='Output results in JSON format')
    parser.add_argument('--export', type=str, metavar='FILE',
                       help='Export results to file')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress console output (useful with --export)')
    
    args = parser.parse_args()
    
    try:
        if args.command in ['health', 'both']:
            if not args.quiet:
                print("Running system health check...")
            
            health_report = asyncio.run(run_health_check())
            
            if args.json:
                print(json.dumps(health_report, indent=2))
            elif not args.quiet:
                format_health_report(health_report)
            
            if args.export:
                filename = args.export if args.command == 'health' else f"{args.export}_health.json"
                with open(filename, 'w') as f:
                    json.dump(health_report, f, indent=2)
                if not args.quiet:
                    print(f"\nHealth report exported to: {filename}")
        
        if args.command in ['diagnostics', 'both']:
            if not args.quiet:
                print("Running system diagnostics...")
            
            diagnostics_report = run_diagnostics()
            
            if args.json:
                print(json.dumps(diagnostics_report, indent=2))
            elif not args.quiet:
                format_diagnostics_report(diagnostics_report)
            
            if args.export:
                filename = args.export if args.command == 'diagnostics' else f"{args.export}_diagnostics.json"
                with open(filename, 'w') as f:
                    json.dump(diagnostics_report, f, indent=2)
                if not args.quiet:
                    print(f"\nDiagnostics report exported to: {filename}")
        
        # Exit with appropriate code based on health status
        if args.command in ['health', 'both']:
            if health_report.get('overall_status') == 'unhealthy':
                sys.exit(1)
            elif health_report.get('overall_status') == 'degraded':
                sys.exit(2)
        
    except KeyboardInterrupt:
        print("\nHealth check interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"Error running health check: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()