"""
Scenario Manager

High-level API for scenario management operations including preset management,
custom scenario configuration, and audience-specific demo setup.
"""

import json
import os
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from dataclasses import asdict

from .scenario_library import (
    ScenarioLibrary,
    ScenarioTemplate,
    ScenarioConfiguration,
    DemoPreset,
    ScenarioCategory,
    ComplianceFramework,
    AudienceType,
    scenario_library
)


class ScenarioManager:
    """
    High-level scenario management interface
    """
    
    def __init__(self, library: ScenarioLibrary = None):
        self.library = library or scenario_library
    
    def get_available_scenarios(self) -> List[Dict[str, Any]]:
        """
        Get all available scenario templates with metadata
        
        Returns:
            List of scenario template information
        """
        templates = self.library.list_scenario_templates()
        
        scenarios = []
        for template in templates:
            scenario_info = {
                "scenario_type": template.scenario_type,
                "attack_vector": template.attack_vector,
                "source": template.source,
                "severity": template.severity,
                "tactics": template.tactics,
                "title_template": template.title_template,
                "description_template": template.description_template,
                "hkma_relevance": template.hkma_relevance,
                "false_positive_indicators": template.false_positive_indicators,
                "genuine_threat_indicators": template.genuine_threat_indicators,
                "default_entities": template.default_entities
            }
            scenarios.append(scenario_info)
        
        return scenarios
    
    def get_scenarios_by_category(
        self, 
        category: str
    ) -> List[Dict[str, Any]]:
        """
        Get scenarios filtered by category
        
        Args:
            category: Scenario category name
            
        Returns:
            List of matching scenarios
        """
        try:
            cat_enum = ScenarioCategory(category.lower())
            templates = self.library.list_scenario_templates(cat_enum)
            
            scenarios = []
            for template in templates:
                scenarios.append({
                    "scenario_type": template.scenario_type,
                    "attack_vector": template.attack_vector,
                    "source": template.source,
                    "severity": template.severity,
                    "tactics": template.tactics,
                    "title_template": template.title_template,
                    "description_template": template.description_template,
                    "hkma_relevance": template.hkma_relevance
                })
            
            return scenarios
            
        except ValueError:
            return []
    
    def get_demo_presets(
        self, 
        audience: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get available demo presets, optionally filtered by audience
        
        Args:
            audience: Target audience filter (technical, executive, compliance)
            
        Returns:
            List of demo preset information
        """
        audience_filter = None
        if audience:
            try:
                audience_filter = AudienceType(audience.lower())
            except ValueError:
                pass
        
        presets = self.library.list_demo_presets(audience_filter)
        
        preset_list = []
        for preset in presets:
            preset_info = {
                "preset_id": preset.preset_id,
                "name": preset.name,
                "description": preset.description,
                "target_audience": preset.target_audience.value,
                "duration_minutes": preset.duration_minutes,
                "scenario_count": len(preset.scenario_configurations),
                "scenario_categories": [cat.value for cat in preset.scenario_categories],
                "compliance_focus": [framework.value for framework in preset.compliance_focus],
                "demo_parameters": preset.demo_parameters,
                "created_at": preset.created_at.isoformat() if preset.created_at else None,
                "created_by": preset.created_by
            }
            preset_list.append(preset_info)
        
        return preset_list
    
    def get_preset_details(self, preset_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a specific preset
        
        Args:
            preset_id: ID of the preset to retrieve
            
        Returns:
            Detailed preset information or None if not found
        """
        preset = self.library.get_demo_preset(preset_id)
        if not preset:
            return None
        
        # Get scenario details
        scenarios = self.library.get_scenarios_for_preset(preset_id)
        
        return {
            "preset_id": preset.preset_id,
            "name": preset.name,
            "description": preset.description,
            "target_audience": preset.target_audience.value,
            "duration_minutes": preset.duration_minutes,
            "scenario_categories": [cat.value for cat in preset.scenario_categories],
            "scenarios": scenarios,
            "demo_parameters": preset.demo_parameters,
            "compliance_focus": [framework.value for framework in preset.compliance_focus],
            "created_at": preset.created_at.isoformat() if preset.created_at else None,
            "created_by": preset.created_by,
            "total_weight": sum(s["configuration"]["weight"] for s in scenarios if s["configuration"]["enabled"]),
            "average_false_positive_rate": sum(s["configuration"]["false_positive_probability"] for s in scenarios) / len(scenarios) if scenarios else 0
        }
    
    def create_custom_preset(
        self,
        preset_config: Dict[str, Any],
        created_by: str = None
    ) -> Dict[str, Any]:
        """
        Create a custom demo preset
        
        Args:
            preset_config: Preset configuration dictionary
            created_by: User who created the preset
            
        Returns:
            Result dictionary with success status and preset info
        """
        try:
            # Validate required fields
            required_fields = ["preset_id", "name", "description", "target_audience", "scenarios", "demo_parameters"]
            for field in required_fields:
                if field not in preset_config:
                    return {
                        "success": False,
                        "error": f"Missing required field: {field}",
                        "message": "Invalid preset configuration"
                    }
            
            # Convert scenario configurations
            scenario_configs = []
            for scenario_data in preset_config["scenarios"]:
                config = ScenarioConfiguration(
                    scenario_id=scenario_data.get("scenario_id", f"custom_{len(scenario_configs)}"),
                    template_name=scenario_data["template_name"],
                    enabled=scenario_data.get("enabled", True),
                    weight=scenario_data.get("weight", 1.0),
                    custom_parameters=scenario_data.get("custom_parameters", {}),
                    false_positive_probability=scenario_data.get("false_positive_probability", 0.8),
                    complexity_override=scenario_data.get("complexity_override")
                )
                scenario_configs.append(config)
            
            # Validate configuration
            validation = self.library.validate_preset_configuration(scenario_configs)
            if not validation["valid"]:
                return {
                    "success": False,
                    "error": "Configuration validation failed",
                    "validation_errors": validation["errors"],
                    "message": "Invalid scenario configuration"
                }
            
            # Convert audience type
            try:
                audience = AudienceType(preset_config["target_audience"].lower())
            except ValueError:
                return {
                    "success": False,
                    "error": f"Invalid audience type: {preset_config['target_audience']}",
                    "message": "Invalid audience type"
                }
            
            # Convert compliance focus if provided
            compliance_focus = []
            if "compliance_focus" in preset_config:
                for framework_str in preset_config["compliance_focus"]:
                    try:
                        compliance_focus.append(ComplianceFramework(framework_str.lower()))
                    except ValueError:
                        pass  # Skip invalid frameworks
            
            # Create the preset
            preset = self.library.create_custom_preset(
                preset_id=preset_config["preset_id"],
                name=preset_config["name"],
                description=preset_config["description"],
                target_audience=audience,
                scenario_configurations=scenario_configs,
                demo_parameters=preset_config["demo_parameters"],
                duration_minutes=preset_config.get("duration_minutes"),
                compliance_focus=compliance_focus,
                created_by=created_by
            )
            
            return {
                "success": True,
                "preset_id": preset.preset_id,
                "message": "Custom preset created successfully",
                "validation_warnings": validation.get("warnings", [])
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error creating custom preset"
            }
    
    def update_preset(
        self,
        preset_id: str,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update an existing preset
        
        Args:
            preset_id: ID of preset to update
            updates: Dictionary of updates to apply
            
        Returns:
            Result dictionary with success status
        """
        try:
            # Check if preset exists
            if not self.library.get_demo_preset(preset_id):
                return {
                    "success": False,
                    "error": "Preset not found",
                    "message": f"No preset found with ID: {preset_id}"
                }
            
            # Process scenario configuration updates if provided
            if "scenarios" in updates:
                scenario_configs = []
                for scenario_data in updates["scenarios"]:
                    config = ScenarioConfiguration(
                        scenario_id=scenario_data.get("scenario_id", f"updated_{len(scenario_configs)}"),
                        template_name=scenario_data["template_name"],
                        enabled=scenario_data.get("enabled", True),
                        weight=scenario_data.get("weight", 1.0),
                        custom_parameters=scenario_data.get("custom_parameters", {}),
                        false_positive_probability=scenario_data.get("false_positive_probability", 0.8),
                        complexity_override=scenario_data.get("complexity_override")
                    )
                    scenario_configs.append(config)
                
                # Validate updated configuration
                validation = self.library.validate_preset_configuration(scenario_configs)
                if not validation["valid"]:
                    return {
                        "success": False,
                        "error": "Configuration validation failed",
                        "validation_errors": validation["errors"],
                        "message": "Invalid updated scenario configuration"
                    }
                
                updates["scenario_configurations"] = scenario_configs
                del updates["scenarios"]  # Remove the original key
            
            # Process compliance focus updates
            if "compliance_focus" in updates:
                compliance_focus = []
                for framework_str in updates["compliance_focus"]:
                    try:
                        compliance_focus.append(ComplianceFramework(framework_str.lower()))
                    except ValueError:
                        pass
                updates["compliance_focus"] = compliance_focus
            
            # Apply updates
            success = self.library.update_preset(preset_id, updates)
            
            if success:
                return {
                    "success": True,
                    "preset_id": preset_id,
                    "message": "Preset updated successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "Update failed",
                    "message": "Failed to update preset"
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error updating preset"
            }
    
    def delete_preset(self, preset_id: str) -> Dict[str, Any]:
        """
        Delete a custom preset
        
        Args:
            preset_id: ID of preset to delete
            
        Returns:
            Result dictionary with success status
        """
        try:
            success = self.library.delete_preset(preset_id)
            
            if success:
                return {
                    "success": True,
                    "preset_id": preset_id,
                    "message": "Preset deleted successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "Cannot delete preset",
                    "message": "Preset not found or cannot be deleted (default presets cannot be deleted)"
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error deleting preset"
            }
    
    def validate_scenario_configuration(
        self, 
        scenarios: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Validate a scenario configuration
        
        Args:
            scenarios: List of scenario configuration dictionaries
            
        Returns:
            Validation result with errors and warnings
        """
        try:
            # Convert to ScenarioConfiguration objects
            scenario_configs = []
            for scenario_data in scenarios:
                config = ScenarioConfiguration(
                    scenario_id=scenario_data.get("scenario_id", f"validate_{len(scenario_configs)}"),
                    template_name=scenario_data["template_name"],
                    enabled=scenario_data.get("enabled", True),
                    weight=scenario_data.get("weight", 1.0),
                    custom_parameters=scenario_data.get("custom_parameters", {}),
                    false_positive_probability=scenario_data.get("false_positive_probability", 0.8),
                    complexity_override=scenario_data.get("complexity_override")
                )
                scenario_configs.append(config)
            
            return self.library.validate_preset_configuration(scenario_configs)
            
        except Exception as e:
            return {
                "valid": False,
                "errors": [f"Validation error: {str(e)}"],
                "warnings": []
            }
    
    def get_compliance_mapping(
        self, 
        framework: str
    ) -> Dict[str, Any]:
        """
        Get compliance framework mapping for scenarios
        
        Args:
            framework: Compliance framework name
            
        Returns:
            Mapping of scenarios to compliance requirements
        """
        try:
            framework_enum = ComplianceFramework(framework.lower())
            mapping = self.library.get_compliance_mapping(framework_enum)
            
            return {
                "success": True,
                "framework": framework,
                "mapping": mapping,
                "scenario_count": len(mapping)
            }
            
        except ValueError:
            return {
                "success": False,
                "error": f"Unknown compliance framework: {framework}",
                "available_frameworks": [f.value for f in ComplianceFramework]
            }
    
    def get_scenario_categories(self) -> List[Dict[str, Any]]:
        """
        Get available scenario categories
        
        Returns:
            List of scenario categories with descriptions
        """
        categories = []
        for category in ScenarioCategory:
            # Get scenario count for each category
            templates = self.library.list_scenario_templates(category)
            
            category_info = {
                "category": category.value,
                "name": category.value.replace("_", " ").title(),
                "scenario_count": len(templates),
                "description": self._get_category_description(category)
            }
            categories.append(category_info)
        
        return categories
    
    def get_audience_types(self) -> List[Dict[str, Any]]:
        """
        Get available audience types with descriptions
        
        Returns:
            List of audience types
        """
        audiences = []
        for audience in AudienceType:
            audience_info = {
                "audience": audience.value,
                "name": audience.value.title(),
                "description": self._get_audience_description(audience),
                "preset_count": len(self.library.list_demo_presets(audience))
            }
            audiences.append(audience_info)
        
        return audiences
    
    def export_preset(self, preset_id: str) -> Optional[Dict[str, Any]]:
        """
        Export a preset configuration
        
        Args:
            preset_id: ID of preset to export
            
        Returns:
            Exported preset data or None if not found
        """
        return self.library.export_preset(preset_id)
    
    def import_preset(self, preset_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Import a preset configuration
        
        Args:
            preset_data: Preset data to import
            
        Returns:
            Result dictionary with success status
        """
        try:
            success = self.library.import_preset(preset_data)
            
            if success:
                return {
                    "success": True,
                    "preset_id": preset_data.get("preset_id"),
                    "message": "Preset imported successfully"
                }
            else:
                return {
                    "success": False,
                    "error": "Import failed",
                    "message": "Failed to import preset configuration"
                }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Error importing preset"
            }
    
    def get_preset_recommendations(
        self, 
        audience: str,
        duration_minutes: Optional[int] = None,
        compliance_requirements: List[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get preset recommendations based on requirements
        
        Args:
            audience: Target audience
            duration_minutes: Desired duration
            compliance_requirements: Required compliance frameworks
            
        Returns:
            List of recommended presets with match scores
        """
        try:
            audience_enum = AudienceType(audience.lower())
        except ValueError:
            return []
        
        presets = self.library.list_demo_presets(audience_enum)
        recommendations = []
        
        for preset in presets:
            score = 0
            reasons = []
            
            # Audience match (base score)
            if preset.target_audience == audience_enum:
                score += 10
                reasons.append("Perfect audience match")
            elif preset.target_audience == AudienceType.MIXED:
                score += 7
                reasons.append("Suitable for mixed audiences")
            
            # Duration match
            if duration_minutes and preset.duration_minutes:
                duration_diff = abs(preset.duration_minutes - duration_minutes)
                if duration_diff <= 5:
                    score += 5
                    reasons.append("Duration matches requirements")
                elif duration_diff <= 15:
                    score += 3
                    reasons.append("Duration close to requirements")
            elif duration_minutes is None and preset.duration_minutes is None:
                score += 3
                reasons.append("Continuous duration as requested")
            
            # Compliance requirements match
            if compliance_requirements:
                preset_frameworks = [f.value for f in preset.compliance_focus]
                matching_frameworks = set(compliance_requirements) & set(preset_frameworks)
                if matching_frameworks:
                    score += len(matching_frameworks) * 3
                    reasons.append(f"Covers {len(matching_frameworks)} required compliance frameworks")
            
            # Scenario variety bonus
            if len(preset.scenario_configurations) >= 4:
                score += 2
                reasons.append("Good scenario variety")
            
            recommendation = {
                "preset_id": preset.preset_id,
                "name": preset.name,
                "description": preset.description,
                "match_score": score,
                "match_reasons": reasons,
                "target_audience": preset.target_audience.value,
                "duration_minutes": preset.duration_minutes,
                "scenario_count": len(preset.scenario_configurations),
                "compliance_focus": [f.value for f in preset.compliance_focus]
            }
            recommendations.append(recommendation)
        
        # Sort by match score (descending)
        recommendations.sort(key=lambda x: x["match_score"], reverse=True)
        
        return recommendations
    
    def _get_category_description(self, category: ScenarioCategory) -> str:
        """Get description for scenario category"""
        descriptions = {
            ScenarioCategory.PHISHING: "Email-based attacks and social engineering scenarios",
            ScenarioCategory.MALWARE: "Malicious software including ransomware and trojans",
            ScenarioCategory.INSIDER_THREAT: "Internal threats from privileged users and employees",
            ScenarioCategory.APT: "Advanced persistent threat and sophisticated attack campaigns",
            ScenarioCategory.CLOUD_SECURITY: "Cloud infrastructure and service security incidents",
            ScenarioCategory.COMPLIANCE: "Regulatory compliance violations and data protection issues",
            ScenarioCategory.NETWORK_SECURITY: "Network-based attacks and infrastructure threats",
            ScenarioCategory.DATA_PROTECTION: "Data privacy violations and unauthorized access incidents"
        }
        return descriptions.get(category, "Security incident scenarios")
    
    def _get_audience_description(self, audience: AudienceType) -> str:
        """Get description for audience type"""
        descriptions = {
            AudienceType.TECHNICAL: "Technical stakeholders including SOC analysts, security engineers, and IT professionals",
            AudienceType.EXECUTIVE: "Executive leadership focused on business impact, ROI, and strategic value",
            AudienceType.COMPLIANCE: "Compliance officers and auditors interested in regulatory requirements and controls",
            AudienceType.MIXED: "Mixed audiences with varied technical backgrounds and interests"
        }
        return descriptions.get(audience, "General audience")


# Global scenario manager instance
scenario_manager = ScenarioManager()