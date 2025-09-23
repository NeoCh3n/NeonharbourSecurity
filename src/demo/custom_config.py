"""
Custom Scenario Configuration Interface

Provides tools for building tailored demonstrations with custom scenario configurations,
parameter tuning, and audience-specific optimizations.
"""

import json
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum

from .scenario_library import (
    ScenarioConfiguration,
    DemoPreset,
    ScenarioCategory,
    ComplianceFramework,
    AudienceType,
    scenario_library
)
from .scenario_manager import scenario_manager


class ConfigurationTemplate(Enum):
    """Pre-built configuration templates"""
    QUICK_DEMO = "quick_demo"
    COMPREHENSIVE = "comprehensive"
    COMPLIANCE_FOCUSED = "compliance_focused"
    THREAT_HUNTING = "threat_hunting"
    EXECUTIVE_BRIEFING = "executive_briefing"


@dataclass
class ScenarioWeight:
    """Scenario weighting configuration"""
    scenario_type: str
    base_weight: float
    audience_multiplier: float = 1.0
    complexity_multiplier: float = 1.0
    compliance_multiplier: float = 1.0


@dataclass
class CustomConfigurationRequest:
    """Request for custom configuration generation"""
    name: str
    description: str
    target_audience: str
    duration_minutes: Optional[int]
    primary_objectives: List[str]
    scenario_preferences: Dict[str, float]  # scenario_type -> preference weight
    compliance_requirements: List[str]
    complexity_level: str
    false_positive_target: float
    custom_parameters: Dict[str, Any]


class CustomScenarioConfigurator:
    """
    Advanced configuration interface for custom demo scenarios
    """
    
    def __init__(self):
        self.library = scenario_library
        self.manager = scenario_manager
        
        # Configuration templates
        self._templates = {
            ConfigurationTemplate.QUICK_DEMO: {
                "duration_minutes": 15,
                "scenario_count": 3,
                "complexity_level": "basic",
                "false_positive_rate": 0.9,
                "focus_areas": ["automation_showcase", "quick_wins"]
            },
            ConfigurationTemplate.COMPREHENSIVE: {
                "duration_minutes": 60,
                "scenario_count": 8,
                "complexity_level": "advanced",
                "false_positive_rate": 0.75,
                "focus_areas": ["technical_depth", "variety", "real_world_scenarios"]
            },
            ConfigurationTemplate.COMPLIANCE_FOCUSED: {
                "duration_minutes": 30,
                "scenario_count": 5,
                "complexity_level": "intermediate",
                "false_positive_rate": 0.8,
                "focus_areas": ["regulatory_compliance", "audit_trails", "documentation"]
            },
            ConfigurationTemplate.THREAT_HUNTING: {
                "duration_minutes": 45,
                "scenario_count": 6,
                "complexity_level": "advanced",
                "false_positive_rate": 0.6,
                "focus_areas": ["advanced_threats", "investigation_depth", "technical_analysis"]
            },
            ConfigurationTemplate.EXECUTIVE_BRIEFING: {
                "duration_minutes": 20,
                "scenario_count": 4,
                "complexity_level": "basic",
                "false_positive_rate": 0.85,
                "focus_areas": ["business_impact", "roi_demonstration", "high_level_overview"]
            }
        }
    
    def generate_custom_configuration(
        self, 
        request: CustomConfigurationRequest
    ) -> Dict[str, Any]:
        """
        Generate a custom demo configuration based on requirements
        
        Args:
            request: Configuration requirements
            
        Returns:
            Generated configuration with scenarios and parameters
        """
        try:
            # Validate request
            validation = self._validate_request(request)
            if not validation["valid"]:
                return {
                    "success": False,
                    "error": "Invalid configuration request",
                    "validation_errors": validation["errors"]
                }
            
            # Generate scenario selection
            scenarios = self._select_scenarios(request)
            
            # Optimize scenario weights
            optimized_scenarios = self._optimize_scenario_weights(scenarios, request)
            
            # Generate demo parameters
            demo_parameters = self._generate_demo_parameters(request)
            
            # Create preset configuration
            preset_config = {
                "preset_id": f"custom_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
                "name": request.name,
                "description": request.description,
                "target_audience": request.target_audience,
                "duration_minutes": request.duration_minutes,
                "scenarios": optimized_scenarios,
                "demo_parameters": demo_parameters,
                "compliance_focus": request.compliance_requirements
            }
            
            # Validate generated configuration
            validation_result = self.manager.validate_scenario_configuration(optimized_scenarios)
            
            return {
                "success": True,
                "configuration": preset_config,
                "scenario_count": len(optimized_scenarios),
                "estimated_duration": self._estimate_duration(optimized_scenarios, demo_parameters),
                "validation": validation_result,
                "optimization_notes": self._generate_optimization_notes(request, optimized_scenarios)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error generating custom configuration"
            }
    
    def apply_configuration_template(
        self, 
        template: str,
        customizations: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Apply a pre-built configuration template with optional customizations
        
        Args:
            template: Template name
            customizations: Optional customizations to apply
            
        Returns:
            Generated configuration based on template
        """
        try:
            template_enum = ConfigurationTemplate(template.lower())
            template_config = self._templates[template_enum]
            
            # Apply customizations
            if customizations:
                template_config = {**template_config, **customizations}
            
            # Convert to configuration request
            request = self._template_to_request(template_config, template)
            
            return self.generate_custom_configuration(request)
            
        except ValueError:
            return {
                "success": False,
                "error": f"Unknown template: {template}",
                "available_templates": [t.value for t in ConfigurationTemplate]
            }
    
    def optimize_for_audience(
        self, 
        base_config: Dict[str, Any],
        target_audience: str
    ) -> Dict[str, Any]:
        """
        Optimize an existing configuration for a specific audience
        
        Args:
            base_config: Base configuration to optimize
            target_audience: Target audience type
            
        Returns:
            Optimized configuration
        """
        try:
            audience_enum = AudienceType(target_audience.lower())
            
            # Audience-specific optimizations
            optimizations = {
                AudienceType.TECHNICAL: {
                    "complexity_boost": 1.3,
                    "detail_level": "high",
                    "false_positive_adjustment": -0.1,
                    "preferred_categories": ["apt", "insider_threat", "network_security"]
                },
                AudienceType.EXECUTIVE: {
                    "complexity_boost": 0.7,
                    "detail_level": "low",
                    "false_positive_adjustment": 0.1,
                    "preferred_categories": ["phishing", "malware", "compliance"]
                },
                AudienceType.COMPLIANCE: {
                    "complexity_boost": 1.0,
                    "detail_level": "medium",
                    "false_positive_adjustment": 0.0,
                    "preferred_categories": ["compliance", "data_protection", "insider_threat"]
                }
            }
            
            optimization = optimizations.get(audience_enum, {})
            
            # Apply optimizations to scenarios
            optimized_scenarios = []
            scenarios_data = base_config.get("scenarios", [])
            
            for scenario in scenarios_data:
                # Handle both direct scenario config and nested structure from preset details
                if "configuration" in scenario:
                    # This is from preset details - extract the configuration
                    optimized_scenario = scenario["configuration"].copy()
                    template_name = scenario["template"]["scenario_type"]
                else:
                    # This is direct scenario configuration
                    optimized_scenario = scenario.copy()
                    template_name = optimized_scenario.get("template_name", "")
                
                # Adjust complexity
                if "complexity_override" not in optimized_scenario:
                    complexity_boost = optimization.get("complexity_boost", 1.0)
                    if complexity_boost > 1.2:
                        optimized_scenario["complexity_override"] = "advanced"
                    elif complexity_boost < 0.8:
                        optimized_scenario["complexity_override"] = "basic"
                
                # Adjust false positive probability
                fp_adjustment = optimization.get("false_positive_adjustment", 0.0)
                current_fp = optimized_scenario.get("false_positive_probability", 0.8)
                new_fp = max(0.1, min(0.95, current_fp + fp_adjustment))
                optimized_scenario["false_positive_probability"] = new_fp
                
                # Adjust weights based on preferred categories
                preferred_cats = optimization.get("preferred_categories", [])
                
                # Simple category mapping for weight adjustment
                category_mapping = {
                    "phishing_email": "phishing",
                    "spear_phishing": "phishing",
                    "ransomware_encryption": "malware",
                    "ransomware_lateral_movement": "malware",
                    "insider_data_exfiltration": "insider_threat",
                    "insider_privilege_abuse": "insider_threat",
                    "apt_reconnaissance": "apt",
                    "apt_persistence": "apt",
                    "cloud_credential_compromise": "cloud_security",
                    "data_privacy_violation": "compliance"
                }
                
                scenario_category = category_mapping.get(template_name, "")
                if scenario_category in preferred_cats:
                    optimized_scenario["weight"] = optimized_scenario.get("weight", 1.0) * 1.5
                
                # Ensure template_name is set for consistency
                if "template_name" not in optimized_scenario and template_name:
                    optimized_scenario["template_name"] = template_name
                
                optimized_scenarios.append(optimized_scenario)
            
            # Update demo parameters
            optimized_params = base_config.get("demo_parameters", {}).copy()
            optimized_params["target_audience"] = target_audience
            optimized_params["detail_level"] = optimization.get("detail_level", "medium")
            
            # Update configuration
            optimized_config = base_config.copy()
            optimized_config["scenarios"] = optimized_scenarios
            optimized_config["demo_parameters"] = optimized_params
            optimized_config["target_audience"] = target_audience
            
            return {
                "success": True,
                "optimized_configuration": optimized_config,
                "optimizations_applied": list(optimization.keys()),
                "message": f"Configuration optimized for {target_audience} audience"
            }
            
        except ValueError:
            return {
                "success": False,
                "error": f"Invalid audience type: {target_audience}",
                "available_audiences": [a.value for a in AudienceType]
            }
    
    def tune_scenario_parameters(
        self, 
        scenario_config: Dict[str, Any],
        tuning_objectives: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Fine-tune individual scenario parameters
        
        Args:
            scenario_config: Scenario configuration to tune
            tuning_objectives: Tuning objectives and constraints
            
        Returns:
            Tuned scenario configuration
        """
        tuned_config = scenario_config.copy()
        
        # Apply tuning objectives
        if "false_positive_target" in tuning_objectives:
            target_fp = tuning_objectives["false_positive_target"]
            tuned_config["false_positive_probability"] = target_fp
        
        if "weight_adjustment" in tuning_objectives:
            weight_factor = tuning_objectives["weight_adjustment"]
            current_weight = tuned_config.get("weight", 1.0)
            tuned_config["weight"] = current_weight * weight_factor
        
        if "complexity_preference" in tuning_objectives:
            complexity = tuning_objectives["complexity_preference"]
            tuned_config["complexity_override"] = complexity
        
        if "custom_parameters" in tuning_objectives:
            custom_params = tuned_config.get("custom_parameters", {})
            custom_params.update(tuning_objectives["custom_parameters"])
            tuned_config["custom_parameters"] = custom_params
        
        return {
            "success": True,
            "tuned_configuration": tuned_config,
            "applied_tuning": list(tuning_objectives.keys())
        }
    
    def generate_scenario_variations(
        self, 
        base_scenario: str,
        variation_count: int = 3
    ) -> List[Dict[str, Any]]:
        """
        Generate variations of a base scenario
        
        Args:
            base_scenario: Base scenario template name
            variation_count: Number of variations to generate
            
        Returns:
            List of scenario variations
        """
        template = self.library.get_scenario_template(base_scenario)
        if not template:
            return []
        
        variations = []
        
        for i in range(variation_count):
            variation = {
                "scenario_id": f"{base_scenario}_var_{i+1}",
                "template_name": base_scenario,
                "enabled": True,
                "weight": 1.0,
                "custom_parameters": {},
                "false_positive_probability": 0.8,
                "complexity_override": None
            }
            
            # Apply variation-specific adjustments
            if i == 0:  # High confidence variation
                variation["false_positive_probability"] = 0.3
                variation["weight"] = 0.8
                variation["custom_parameters"]["confidence_level"] = "high"
            elif i == 1:  # Medium confidence variation
                variation["false_positive_probability"] = 0.6
                variation["weight"] = 1.2
                variation["custom_parameters"]["confidence_level"] = "medium"
            else:  # Low confidence variation (likely false positive)
                variation["false_positive_probability"] = 0.9
                variation["weight"] = 1.5
                variation["custom_parameters"]["confidence_level"] = "low"
            
            variations.append(variation)
        
        return variations
    
    def get_configuration_templates(self) -> List[Dict[str, Any]]:
        """
        Get available configuration templates
        
        Returns:
            List of available templates with descriptions
        """
        templates = []
        
        for template_enum, config in self._templates.items():
            template_info = {
                "template_id": template_enum.value,
                "name": template_enum.value.replace("_", " ").title(),
                "description": self._get_template_description(template_enum),
                "duration_minutes": config["duration_minutes"],
                "scenario_count": config["scenario_count"],
                "complexity_level": config["complexity_level"],
                "false_positive_rate": config["false_positive_rate"],
                "focus_areas": config["focus_areas"]
            }
            templates.append(template_info)
        
        return templates
    
    def _validate_request(self, request: CustomConfigurationRequest) -> Dict[str, Any]:
        """Validate configuration request"""
        errors = []
        
        # Check required fields
        if not request.name or not request.name.strip():
            errors.append("Name is required")
        
        if not request.target_audience:
            errors.append("Target audience is required")
        else:
            try:
                AudienceType(request.target_audience.lower())
            except ValueError:
                errors.append(f"Invalid audience type: {request.target_audience}")
        
        # Check duration
        if request.duration_minutes is not None and request.duration_minutes <= 0:
            errors.append("Duration must be positive")
        
        # Check false positive target
        if not (0 <= request.false_positive_target <= 1):
            errors.append("False positive target must be between 0 and 1")
        
        # Check compliance requirements
        for framework in request.compliance_requirements:
            try:
                ComplianceFramework(framework.lower())
            except ValueError:
                errors.append(f"Unknown compliance framework: {framework}")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
    
    def _select_scenarios(self, request: CustomConfigurationRequest) -> List[Dict[str, Any]]:
        """Select scenarios based on request requirements"""
        available_templates = self.library.list_scenario_templates()
        selected_scenarios = []
        
        # Calculate target scenario count based on duration
        if request.duration_minutes:
            target_count = max(3, min(10, request.duration_minutes // 5))
        else:
            target_count = 6
        
        # Score scenarios based on preferences
        scored_scenarios = []
        for template in available_templates:
            score = 0
            
            # Base score
            score += 1
            
            # Preference score
            if template.scenario_type in request.scenario_preferences:
                score += request.scenario_preferences[template.scenario_type] * 5
            
            # Compliance relevance
            for framework in request.compliance_requirements:
                if framework.lower() in template.hkma_relevance.lower():
                    score += 3
            
            # Objective alignment
            for objective in request.primary_objectives:
                if objective.lower() in template.description_template.lower():
                    score += 2
            
            scored_scenarios.append((template, score))
        
        # Sort by score and select top scenarios
        scored_scenarios.sort(key=lambda x: x[1], reverse=True)
        
        for i, (template, score) in enumerate(scored_scenarios[:target_count]):
            scenario = {
                "scenario_id": f"custom_{template.scenario_type}_{i}",
                "template_name": template.scenario_type,
                "enabled": True,
                "weight": max(0.5, score / 10),  # Convert score to weight
                "custom_parameters": {},
                "false_positive_probability": request.false_positive_target,
                "complexity_override": request.complexity_level if request.complexity_level != "auto" else None
            }
            selected_scenarios.append(scenario)
        
        return selected_scenarios
    
    def _optimize_scenario_weights(
        self, 
        scenarios: List[Dict[str, Any]], 
        request: CustomConfigurationRequest
    ) -> List[Dict[str, Any]]:
        """Optimize scenario weights for better distribution"""
        if not scenarios:
            return scenarios
        
        # Normalize weights to sum to scenario count
        total_weight = sum(s["weight"] for s in scenarios)
        target_total = len(scenarios)
        
        for scenario in scenarios:
            scenario["weight"] = (scenario["weight"] / total_weight) * target_total
        
        return scenarios
    
    def _generate_demo_parameters(self, request: CustomConfigurationRequest) -> Dict[str, Any]:
        """Generate demo parameters based on request"""
        base_params = {
            "interval_seconds": 30.0,
            "false_positive_rate": request.false_positive_target,
            "complexity_level": request.complexity_level,
            "target_audience": request.target_audience
        }
        
        # Adjust interval based on duration
        if request.duration_minutes:
            scenario_count = len(request.scenario_preferences) or 5
            base_params["interval_seconds"] = (request.duration_minutes * 60) / (scenario_count * 2)
            base_params["interval_seconds"] = max(10.0, min(120.0, base_params["interval_seconds"]))
        
        # Merge custom parameters
        base_params.update(request.custom_parameters)
        
        return base_params
    
    def _estimate_duration(
        self, 
        scenarios: List[Dict[str, Any]], 
        demo_parameters: Dict[str, Any]
    ) -> int:
        """Estimate demo duration in minutes"""
        interval = demo_parameters.get("interval_seconds", 30.0)
        scenario_count = len(scenarios)
        
        # Estimate based on interval and scenario count
        total_seconds = scenario_count * interval * 2  # Factor for processing time
        return int(total_seconds / 60)
    
    def _generate_optimization_notes(
        self, 
        request: CustomConfigurationRequest, 
        scenarios: List[Dict[str, Any]]
    ) -> List[str]:
        """Generate optimization notes for the configuration"""
        notes = []
        
        # Scenario count note
        if len(scenarios) < 3:
            notes.append("Consider adding more scenarios for better variety")
        elif len(scenarios) > 8:
            notes.append("Large number of scenarios may extend demo duration")
        
        # False positive rate note
        avg_fp = sum(s["false_positive_probability"] for s in scenarios) / len(scenarios)
        if avg_fp > 0.9:
            notes.append("High false positive rate will emphasize automation capabilities")
        elif avg_fp < 0.6:
            notes.append("Lower false positive rate will show more escalation scenarios")
        
        # Duration note
        if request.duration_minutes and request.duration_minutes < 15:
            notes.append("Short duration may limit scenario variety")
        
        return notes
    
    def _template_to_request(
        self, 
        template_config: Dict[str, Any], 
        template_name: str
    ) -> CustomConfigurationRequest:
        """Convert template configuration to request object"""
        return CustomConfigurationRequest(
            name=f"{template_name.replace('_', ' ').title()} Demo",
            description=f"Demo configuration based on {template_name} template",
            target_audience="technical",  # Default, can be overridden
            duration_minutes=template_config["duration_minutes"],
            primary_objectives=template_config["focus_areas"],
            scenario_preferences={},  # Will be filled by scenario selection
            compliance_requirements=[],
            complexity_level=template_config["complexity_level"],
            false_positive_target=template_config["false_positive_rate"],
            custom_parameters={}
        )
    
    def _get_template_description(self, template: ConfigurationTemplate) -> str:
        """Get description for configuration template"""
        descriptions = {
            ConfigurationTemplate.QUICK_DEMO: "Fast-paced demonstration highlighting key automation capabilities",
            ConfigurationTemplate.COMPREHENSIVE: "In-depth technical demonstration covering multiple threat types",
            ConfigurationTemplate.COMPLIANCE_FOCUSED: "Compliance-oriented demo emphasizing regulatory requirements",
            ConfigurationTemplate.THREAT_HUNTING: "Advanced threat hunting scenarios for technical audiences",
            ConfigurationTemplate.EXECUTIVE_BRIEFING: "High-level business-focused demonstration for executives"
        }
        return descriptions.get(template, "Custom configuration template")


# Global custom configurator instance
custom_configurator = CustomScenarioConfigurator()