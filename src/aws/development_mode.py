"""
Development Mode Configuration

Provides a development-friendly mode that can work without full AWS setup
while still validating the integration framework.
"""

import os
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class DevelopmentConfig:
    """Development mode configuration"""
    enable_mock_services: bool = True
    skip_missing_resources: bool = True
    use_local_fallbacks: bool = True
    validate_code_only: bool = False


class DevelopmentModeManager:
    """
    Manages development mode settings and provides fallbacks
    for missing AWS resources during development.
    """
    
    def __init__(self):
        self.config = DevelopmentConfig()
        self.is_development = self._detect_development_mode()
    
    def _detect_development_mode(self) -> bool:
        """Detect if we're running in development mode"""
        # Check for development indicators
        dev_indicators = [
            os.getenv('ENVIRONMENT') == 'development',
            os.getenv('NODE_ENV') == 'development',
            os.getenv('FLASK_ENV') == 'development',
            os.getenv('DEBUG') == 'true',
            'pytest' in os.environ.get('_', ''),
            '.venv' in os.getcwd(),
            'localhost' in os.getenv('DATABASE_URL', ''),
        ]
        
        return any(dev_indicators)
    
    def should_skip_service(self, service_name: str) -> bool:
        """Check if a service should be skipped in development mode"""
        if not self.is_development:
            return False
        
        # Services that are optional in development
        optional_services = {
            'bedrock': True,  # Can use alternative AI providers
            'kms': True,      # Can use default encryption
            'eventbridge': True,  # Can use direct invocation
            'stepfunctions': True,  # Can test individual functions
        }
        
        return optional_services.get(service_name.lower(), False)
    
    def get_fallback_config(self, service_name: str) -> Optional[Dict[str, Any]]:
        """Get fallback configuration for development mode"""
        fallbacks = {
            'bedrock': {
                'use_alternative': True,
                'alternative_provider': 'deepseek',
                'mock_responses': True
            },
            'kms': {
                'use_default_encryption': True,
                'skip_object_lock': True
            },
            'eventbridge': {
                'use_default_bus': True,
                'direct_invocation': True
            },
            'stepfunctions': {
                'test_individual_functions': True,
                'mock_workflow': True
            }
        }
        
        return fallbacks.get(service_name.lower())
    
    def enhance_validation_for_development(self, validation_result: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance validation results for development mode"""
        if not self.is_development:
            return validation_result
        
        # Add development mode context
        validation_result['development_mode'] = True
        validation_result['development_notes'] = []
        
        # Adjust expectations for development
        if not validation_result.get('all_services_healthy', False):
            core_services = ['dynamodb', 's3']
            core_healthy = all(
                any(check.service_name.lower().startswith(service) and check.status.value != 'unavailable' 
                    for check in validation_result.get('service_health_checks', []))
                for service in core_services
            )
            
            if core_healthy:
                validation_result['development_ready'] = True
                validation_result['development_notes'].append(
                    "Core services (DynamoDB, S3) are healthy - sufficient for development"
                )
            else:
                validation_result['development_ready'] = False
                validation_result['development_notes'].append(
                    "Core services need setup - run minimal setup script"
                )
        
        return validation_result
    
    def get_development_recommendations(self) -> list[str]:
        """Get development-specific recommendations"""
        recommendations = []
        
        if self.is_development:
            recommendations.extend([
                "🚀 Development Mode Detected",
                "",
                "Quick Setup Options:",
                "1. Minimal AWS Setup: ./scripts/setup_aws_minimal.sh",
                "2. Use Mock Mode: Set DEVELOPMENT_MODE=true in .env",
                "3. Core Services Only: Focus on DynamoDB + S3 setup",
                "",
                "For full testing, you can:",
                "- Use the generated setup script: ./setup_aws_resources.sh",
                "- Deploy with SAM: sam build && sam deploy --guided",
                "- Enable Bedrock models in AWS console",
            ])
        
        return recommendations


# Global development mode manager
development_mode = DevelopmentModeManager()