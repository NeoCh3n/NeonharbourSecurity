"""Integration layer for demo system with existing NeoHarbour pipeline."""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional
import logging

from src.demo.generator import DemoDataGenerator, DemoAlert
from src.demo.scenarios import get_scenario_templates

logger = logging.getLogger(__name__)


class DemoPipelineIntegration:
    """Integration layer between demo system and existing investigation pipeline."""
    
    def __init__(self):
        self.generator = DemoDataGenerator()
        self.event_bus_name = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")
        
    def create_demo_investigation_event(self, alert: DemoAlert) -> Dict[str, Any]:
        """Create EventBridge event for demo investigation."""
        return {
            "EventBusName": self.event_bus_name,
            "Source": "asia.agentic.soc.demo",
            "DetailType": "DemoAlert",
            "Detail": json.dumps({
                "investigationId": alert.investigation_id,
                "tenantId": alert.tenant_id,
                "alert": {
                    "source": alert.source,
                    "title": alert.title,
                    "description": alert.description,
                    "severity": alert.severity,
                    "entities": alert.entities,
                    "tactics": alert.tactics,
                    "alertId": alert.alert_id,
                    "scenarioType": alert.scenario_type,
                    "isDemo": True,
                    "isFalsePositive": alert.is_false_positive,
                    "confidenceScore": alert.confidence_score,
                    "rawData": alert.raw_data
                },
                "receivedAt": alert.timestamp,
                "demoMetadata": {
                    "scenarioType": alert.scenario_type,
                    "isFalsePositive": alert.is_false_positive,
                    "riskLevel": alert.risk_level,
                    "generatedBy": "demo_system"
                }
            })
        }
    
    def get_available_demo_scenarios(self) -> Dict[str, Any]:
        """Get available demo scenarios with descriptions."""
        templates = get_scenario_templates()
        
        scenarios = {}
        for template in templates:
            scenarios[template.scenario_type] = {
                "attack_vector": template.attack_vector,
                "source": template.source,
                "severity": template.severity,
                "tactics": template.tactics,
                "hkma_relevance": template.hkma_relevance,
                "description": template.description_template
            }
        
        return scenarios
    
    def create_demo_preset_configurations(self) -> Dict[str, Dict[str, Any]]:
        """Create preset demo configurations for different audiences."""
        return {
            "technical_deep_dive": {
                "name": "Technical Deep Dive",
                "description": "Comprehensive technical demonstration showing all attack types",
                "scenario_types": [
                    "phishing_email", "spear_phishing", "ransomware_encryption",
                    "apt_reconnaissance", "insider_data_exfiltration", "cloud_credential_compromise"
                ],
                "interval_seconds": 45.0,
                "false_positive_rate": 0.75,
                "duration_minutes": 30,
                "target_audience": "technical"
            },
            "executive_overview": {
                "name": "Executive Overview",
                "description": "High-level demonstration focusing on business impact",
                "scenario_types": [
                    "ransomware_encryption", "insider_data_exfiltration", "data_privacy_violation"
                ],
                "interval_seconds": 60.0,
                "false_positive_rate": 0.8,
                "duration_minutes": 15,
                "target_audience": "executive"
            },
            "compliance_focus": {
                "name": "HKMA Compliance Focus",
                "description": "Demonstration emphasizing HKMA regulatory compliance",
                "scenario_types": [
                    "data_privacy_violation", "insider_privilege_abuse", "cloud_credential_compromise"
                ],
                "interval_seconds": 90.0,
                "false_positive_rate": 0.7,
                "duration_minutes": 20,
                "target_audience": "compliance"
            },
            "soc_analyst_training": {
                "name": "SOC Analyst Training",
                "description": "Training scenario with mixed false positives and genuine threats",
                "scenario_types": [
                    "phishing_email", "ransomware_lateral_movement", "apt_persistence",
                    "insider_data_exfiltration"
                ],
                "interval_seconds": 30.0,
                "false_positive_rate": 0.85,
                "duration_minutes": 45,
                "target_audience": "analyst"
            },
            "quick_demo": {
                "name": "Quick Demo",
                "description": "Fast-paced demonstration for time-constrained presentations",
                "scenario_types": [
                    "phishing_email", "ransomware_encryption"
                ],
                "interval_seconds": 20.0,
                "false_positive_rate": 0.8,
                "duration_minutes": 5,
                "target_audience": "general"
            }
        }
    
    def validate_demo_configuration(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate demo configuration parameters."""
        errors = []
        warnings = []
        
        # Validate scenario types
        available_scenarios = [t.scenario_type for t in get_scenario_templates()]
        scenario_types = config.get("scenario_types", [])
        
        if not scenario_types:
            errors.append("At least one scenario type must be specified")
        else:
            invalid_scenarios = [s for s in scenario_types if s not in available_scenarios]
            if invalid_scenarios:
                errors.append(f"Invalid scenario types: {invalid_scenarios}")
        
        # Validate timing parameters
        interval = config.get("interval_seconds", 30.0)
        if interval < 10.0:
            warnings.append("Very short interval may overwhelm the system")
        elif interval > 300.0:
            warnings.append("Long interval may not provide engaging demonstration")
        
        # Validate false positive rate
        fp_rate = config.get("false_positive_rate", 0.8)
        if not 0.0 <= fp_rate <= 1.0:
            errors.append("False positive rate must be between 0.0 and 1.0")
        elif fp_rate < 0.5:
            warnings.append("Low false positive rate may not demonstrate automation effectively")
        
        # Validate duration
        duration = config.get("duration_minutes")
        if duration and duration > 60:
            warnings.append("Long duration demos may lose audience attention")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def get_demo_metrics_schema(self) -> Dict[str, Any]:
        """Get schema for demo metrics collection."""
        return {
            "session_metrics": {
                "session_id": "string",
                "start_time": "datetime",
                "end_time": "datetime",
                "total_alerts_generated": "integer",
                "false_positive_count": "integer",
                "genuine_threat_count": "integer",
                "automation_rate": "float",
                "scenario_distribution": "object"
            },
            "alert_metrics": {
                "alert_id": "string",
                "investigation_id": "string",
                "scenario_type": "string",
                "generation_time": "datetime",
                "processing_start": "datetime",
                "processing_end": "datetime",
                "processing_duration_ms": "integer",
                "is_false_positive": "boolean",
                "confidence_score": "float",
                "automation_decision": "string",
                "escalated_to_human": "boolean"
            },
            "performance_metrics": {
                "alerts_per_minute": "float",
                "average_processing_time": "float",
                "automation_accuracy": "float",
                "false_positive_detection_rate": "float",
                "genuine_threat_detection_rate": "float"
            }
        }


def create_demo_lambda_handler():
    """Create Lambda handler for demo system integration."""
    
    def lambda_handler(event, context):
        """AWS Lambda handler for demo system operations."""
        try:
            integration = DemoPipelineIntegration()
            
            # Parse request
            operation = event.get("operation")
            parameters = event.get("parameters", {})
            
            if operation == "start_generation":
                session_id = integration.generator.start_continuous_generation(
                    scenario_types=parameters.get("scenario_types", ["phishing_email"]),
                    interval_seconds=parameters.get("interval_seconds", 30.0),
                    false_positive_rate=parameters.get("false_positive_rate", 0.8),
                    duration_minutes=parameters.get("duration_minutes")
                )
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "session_id": session_id,
                        "message": "Demo generation started"
                    })
                }
            
            elif operation == "stop_generation":
                session_id = parameters.get("session_id")
                if not session_id:
                    return {
                        "statusCode": 400,
                        "body": json.dumps({
                            "success": False,
                            "error": "session_id required"
                        })
                    }
                
                integration.generator.stop_generation(session_id)
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "message": "Demo generation stopped"
                    })
                }
            
            elif operation == "get_scenarios":
                scenarios = integration.get_available_demo_scenarios()
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "scenarios": scenarios
                    })
                }
            
            elif operation == "get_presets":
                presets = integration.create_demo_preset_configurations()
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "presets": presets
                    })
                }
            
            elif operation == "validate_config":
                config = parameters.get("config", {})
                validation = integration.validate_demo_configuration(config)
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "validation": validation
                    })
                }
            
            else:
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "success": False,
                        "error": f"Unknown operation: {operation}"
                    })
                }
        
        except Exception as e:
            logger.error(f"Demo Lambda handler error: {e}")
            return {
                "statusCode": 500,
                "body": json.dumps({
                    "success": False,
                    "error": str(e)
                })
            }
    
    return lambda_handler