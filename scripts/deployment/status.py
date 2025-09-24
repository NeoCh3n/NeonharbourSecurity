#!/usr/bin/env python3

"""
NeoHarbour Security - Deployment Status Dashboard
Shows current deployment status across all environments
"""

import sys
import os
import yaml
import boto3
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional
from tabulate import tabulate

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

class DeploymentStatus:
    """Deployment status checker and dashboard"""
    
    def __init__(self):
        self.project_root = project_root
        self.environments = ['dev', 'staging', 'prod']
        
    def load_environment_config(self, environment: str) -> Dict[str, Any]:
        """Load environment configuration"""
        config_file = self.project_root / "config" / "environments" / f"{environment}.yaml"
        if not config_file.exists():
            return {}
            
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def get_cloudformation_status(self, environment: str) -> Dict[str, Any]:
        """Get CloudFormation stack status"""
        try:
            config = self.load_environment_config(environment)
            if not config:
                return {'status': 'NO_CONFIG', 'error': 'Configuration not found'}
            
            # Get stack name from SAM config
            sam_config_file = self.project_root / "config" / "sam-configs" / f"samconfig-{environment}.toml"
            if not sam_config_file.exists():
                return {'status': 'NO_SAM_CONFIG', 'error': 'SAM configuration not found'}
            
            # Parse TOML to get stack name (simple parsing)
            with open(sam_config_file, 'r') as f:
                content = f.read()
                for line in content.split('\n'):
                    if 'stack_name' in line and '=' in line:
                        stack_name = line.split('=')[1].strip().strip('"')
                        break
                else:
                    return {'status': 'NO_STACK_NAME', 'error': 'Stack name not found in SAM config'}
            
            # Set up AWS client for the environment's region
            region = config['aws']['region']
            cf_client = boto3.client('cloudformation', region_name=region)
            
            # Get stack status
            response = cf_client.describe_stacks(StackName=stack_name)
            stack = response['Stacks'][0]
            
            return {
                'status': stack['StackStatus'],
                'stack_name': stack_name,
                'creation_time': stack.get('CreationTime'),
                'last_updated': stack.get('LastUpdatedTime'),
                'region': region,
                'outputs': {output['OutputKey']: output['OutputValue'] 
                           for output in stack.get('Outputs', [])}
            }
            
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def get_service_health(self, environment: str) -> Dict[str, Any]:
        """Get service health status"""
        try:
            config = self.load_environment_config(environment)
            if not config:
                return {'status': 'NO_CONFIG'}
            
            region = config['aws']['region']
            health_status = {}
            
            # Check DynamoDB tables
            dynamodb = boto3.client('dynamodb', region_name=region)
            tables = config['aws']['dynamodb']
            
            for table_key, table_name in tables.items():
                if isinstance(table_name, str):
                    try:
                        response = dynamodb.describe_table(TableName=table_name)
                        health_status[f'dynamodb_{table_key}'] = response['Table']['TableStatus']
                    except Exception as e:
                        health_status[f'dynamodb_{table_key}'] = f'ERROR: {str(e)}'
            
            # Check S3 buckets
            s3 = boto3.client('s3', region_name=region)
            buckets = config['aws']['s3']
            
            for bucket_key, bucket_name in buckets.items():
                if isinstance(bucket_name, str):
                    try:
                        s3.head_bucket(Bucket=bucket_name)
                        health_status[f's3_{bucket_key}'] = 'ACTIVE'
                    except Exception as e:
                        health_status[f's3_{bucket_key}'] = f'ERROR: {str(e)}'
            
            # Check Step Functions
            stepfunctions = boto3.client('stepfunctions', region_name=region)
            state_machine_name = config['aws']['stepfunctions']['state_machine_name']
            
            try:
                account_id = boto3.client('sts').get_caller_identity()['Account']
                state_machine_arn = f"arn:aws:states:{region}:{account_id}:stateMachine:{state_machine_name}"
                response = stepfunctions.describe_state_machine(stateMachineArn=state_machine_arn)
                health_status['stepfunctions'] = response['status']
            except Exception as e:
                health_status['stepfunctions'] = f'ERROR: {str(e)}'
            
            return {'status': 'HEALTHY', 'services': health_status}
            
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def get_recent_deployments(self, environment: str, days: int = 7) -> List[Dict[str, Any]]:
        """Get recent deployment history"""
        try:
            deployment_log_dir = self.project_root / "logs" / "deployment"
            if not deployment_log_dir.exists():
                return []
            
            deployments = []
            cutoff_date = datetime.now() - timedelta(days=days)
            
            # Look for deployment log files
            for log_file in deployment_log_dir.glob("deploy_*.log"):
                try:
                    # Extract timestamp from filename
                    timestamp_str = log_file.stem.replace('deploy_', '')
                    timestamp = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                    
                    if timestamp >= cutoff_date:
                        # Read first few lines to get environment info
                        with open(log_file, 'r') as f:
                            content = f.read(1000)  # First 1000 chars
                            
                        if environment.lower() in content.lower():
                            deployments.append({
                                'timestamp': timestamp,
                                'deployment_id': log_file.stem,
                                'log_file': str(log_file),
                                'status': 'SUCCESS' if 'completed successfully' in content else 'UNKNOWN'
                            })
                            
                except Exception:
                    continue
            
            # Sort by timestamp, most recent first
            deployments.sort(key=lambda x: x['timestamp'], reverse=True)
            return deployments[:5]  # Return last 5 deployments
            
        except Exception as e:
            return [{'error': str(e)}]
    
    def get_api_status(self, environment: str) -> Dict[str, Any]:
        """Get API endpoint status"""
        try:
            config = self.load_environment_config(environment)
            if not config:
                return {'status': 'NO_CONFIG'}
            
            api_config = config.get('api', {})
            endpoint = api_config.get('endpoint')
            
            if not endpoint:
                return {'status': 'NO_ENDPOINT'}
            
            import requests
            
            # Test health endpoint
            try:
                response = requests.get(f"{endpoint}/health", timeout=10)
                if response.status_code == 200:
                    health_data = response.json()
                    return {
                        'status': 'HEALTHY',
                        'endpoint': endpoint,
                        'response_time': response.elapsed.total_seconds(),
                        'health_data': health_data
                    }
                else:
                    return {
                        'status': 'UNHEALTHY',
                        'endpoint': endpoint,
                        'status_code': response.status_code
                    }
            except requests.exceptions.RequestException as e:
                return {
                    'status': 'UNREACHABLE',
                    'endpoint': endpoint,
                    'error': str(e)
                }
                
        except Exception as e:
            return {'status': 'ERROR', 'error': str(e)}
    
    def generate_status_report(self) -> Dict[str, Any]:
        """Generate comprehensive status report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'environments': {}
        }
        
        for env in self.environments:
            print(f"Checking {env} environment...")
            
            env_status = {
                'cloudformation': self.get_cloudformation_status(env),
                'services': self.get_service_health(env),
                'api': self.get_api_status(env),
                'recent_deployments': self.get_recent_deployments(env)
            }
            
            report['environments'][env] = env_status
        
        return report
    
    def print_status_table(self, report: Dict[str, Any]) -> None:
        """Print status in table format"""
        print("\n" + "="*80)
        print("NeoHarbour Security - Deployment Status Dashboard")
        print("="*80)
        print(f"Generated: {report['timestamp']}")
        print()
        
        # Environment overview table
        env_data = []
        for env, status in report['environments'].items():
            cf_status = status['cloudformation']['status']
            api_status = status['api']['status']
            services_status = 'HEALTHY' if status['services']['status'] == 'HEALTHY' else 'ISSUES'
            
            # Get last deployment
            deployments = status['recent_deployments']
            last_deployment = deployments[0]['timestamp'].strftime('%Y-%m-%d %H:%M') if deployments else 'None'
            
            env_data.append([
                env.upper(),
                cf_status,
                services_status,
                api_status,
                last_deployment
            ])
        
        print("Environment Overview:")
        print(tabulate(env_data, headers=['Environment', 'CloudFormation', 'Services', 'API', 'Last Deployment'], tablefmt='grid'))
        
        # Detailed status for each environment
        for env, status in report['environments'].items():
            print(f"\n{env.upper()} Environment Details:")
            print("-" * 40)
            
            # CloudFormation details
            cf = status['cloudformation']
            if cf['status'] not in ['ERROR', 'NO_CONFIG', 'NO_SAM_CONFIG']:
                print(f"CloudFormation Stack: {cf.get('stack_name', 'Unknown')}")
                print(f"Status: {cf['status']}")
                print(f"Region: {cf.get('region', 'Unknown')}")
                if cf.get('last_updated'):
                    print(f"Last Updated: {cf['last_updated']}")
            else:
                print(f"CloudFormation: {cf['status']} - {cf.get('error', 'Unknown error')}")
            
            # API details
            api = status['api']
            if api['status'] == 'HEALTHY':
                print(f"API Endpoint: {api['endpoint']} (Response: {api['response_time']:.2f}s)")
            elif api['status'] == 'NO_ENDPOINT':
                print("API Endpoint: Not configured (dev environment)")
            else:
                print(f"API Status: {api['status']} - {api.get('error', 'Unknown error')}")
            
            # Services details
            services = status['services']
            if services['status'] == 'HEALTHY':
                print("Services: All healthy")
                for service, service_status in services['services'].items():
                    if 'ERROR' in service_status:
                        print(f"  ⚠️  {service}: {service_status}")
            else:
                print(f"Services: {services['status']} - {services.get('error', 'Unknown error')}")
            
            # Recent deployments
            deployments = status['recent_deployments']
            if deployments:
                print("Recent Deployments:")
                for deployment in deployments[:3]:  # Show last 3
                    if 'error' not in deployment:
                        print(f"  • {deployment['timestamp'].strftime('%Y-%m-%d %H:%M')} - {deployment['status']}")
            else:
                print("Recent Deployments: None found")
    
    def save_status_report(self, report: Dict[str, Any], filename: Optional[str] = None) -> str:
        """Save status report to file"""
        if not filename:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"deployment_status_{timestamp}.json"
        
        status_dir = self.project_root / "logs" / "deployment"
        status_dir.mkdir(parents=True, exist_ok=True)
        
        filepath = status_dir / filename
        with open(filepath, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        return str(filepath)

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='NeoHarbour Security Deployment Status')
    parser.add_argument('--environment', '-e', choices=['dev', 'staging', 'prod'], 
                       help='Check specific environment only')
    parser.add_argument('--save', '-s', action='store_true', 
                       help='Save report to file')
    parser.add_argument('--json', '-j', action='store_true', 
                       help='Output as JSON')
    
    args = parser.parse_args()
    
    status_checker = DeploymentStatus()
    
    if args.environment:
        status_checker.environments = [args.environment]
    
    # Generate report
    report = status_checker.generate_status_report()
    
    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        status_checker.print_status_table(report)
    
    if args.save:
        filepath = status_checker.save_status_report(report)
        print(f"\nStatus report saved to: {filepath}")

if __name__ == "__main__":
    main()