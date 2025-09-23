"""
Scenario Library Management System

Provides comprehensive scenario management with pre-defined attack patterns,
compliance scenarios, and custom configuration capabilities for the Interactive Demo System.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any, Set
from enum import Enum
from datetime import datetime

from .scenarios import ScenarioTemplate, get_scenario_templates


class ScenarioCategory(Enum):
    """Scenario categories for organization"""
    PHISHING = "phishing"
    MALWARE = "malware"
    INSIDER_THREAT = "insider_threat"
    APT = "advanced_persistent_threat"
    CLOUD_SECURITY = "cloud_security"
    COMPLIANCE = "compliance"
    NETWORK_SECURITY = "network_security"
    DATA_PROTECTION = "data_protection"


class ComplianceFramework(Enum):
    """Supported compliance frameworks"""
    HKMA_SA2 = "hkma_sa2"
    HKMA_TMG1 = "hkma_tmg1"
    PDPO = "pdpo"
    ISO27001 = "iso27001"
    NIST = "nist"


class AudienceType(Enum):
    """Target audience types"""
    TECHNICAL = "technical"
    EXECUTIVE = "executive"
    COMPLIANCE = "compliance"
    MIXED = "mixed"


@dataclass
class ScenarioConfiguration:
    """Configuration for a specific scenario instance"""
    scenario_id: str
    template_name: str
    enabled: bool = True
    weight: float = 1.0  # Relative probability of selection
    custom_parameters: Dict[str, Any] = None
    false_positive_probability: float = 0.8
    complexity_override: Optional[str] = None
    
    def __post_init__(self):
        if self.custom_parameters is None:
            self.custom_parameters = {}


@dataclass
class DemoPreset:
    """Demo preset configuration for different audience types"""
    preset_id: str
    name: str
    description: str
    target_audience: AudienceType
    duration_minutes: Optional[int]
    scenario_categories: List[ScenarioCategory]
    scenario_configurations: List[ScenarioConfiguration]
    demo_parameters: Dict[str, Any]
    compliance_focus: List[ComplianceFramework] = None
    created_at: datetime = None
    created_by: str = None
    
    def __post_init__(self):
        if self.compliance_focus is None:
            self.compliance_focus = []
        if self.created_at is None:
            self.created_at = datetime.utcnow()


class ScenarioLibrary:
    """
    Comprehensive scenario library with management capabilities
    """
    
    def __init__(self):
        self._templates: Dict[str, ScenarioTemplate] = {}
        self._presets: Dict[str, DemoPreset] = {}
        self._custom_scenarios: Dict[str, ScenarioConfiguration] = {}
        self._load_default_templates()
        self._load_default_presets()
    
    def _load_default_templates(self):
        """Load default scenario templates"""
        templates = get_scenario_templates()
        for template in templates:
            self._templates[template.scenario_type] = template
    
    def _load_default_presets(self):
        """Load default demo presets"""
        self._presets.update({
            "technical_deep_dive": DemoPreset(
                preset_id="technical_deep_dive",
                name="Technical Deep Dive",
                description="Comprehensive technical demonstration showcasing advanced threat detection and multi-agent analysis capabilities",
                target_audience=AudienceType.TECHNICAL,
                duration_minutes=45,
                scenario_categories=[
                    ScenarioCategory.APT,
                    ScenarioCategory.INSIDER_THREAT,
                    ScenarioCategory.CLOUD_SECURITY,
                    ScenarioCategory.NETWORK_SECURITY
                ],
                scenario_configurations=[
                    ScenarioConfiguration(
                        scenario_id="apt_recon_1",
                        template_name="apt_reconnaissance",
                        weight=2.0,
                        false_positive_probability=0.3,
                        complexity_override="advanced"
                    ),
                    ScenarioConfiguration(
                        scenario_id="apt_persist_1",
                        template_name="apt_persistence",
                        weight=2.0,
                        false_positive_probability=0.2,
                        complexity_override="advanced"
                    ),
                    ScenarioConfiguration(
                        scenario_id="insider_exfil_1",
                        template_name="insider_data_exfiltration",
                        weight=1.5,
                        false_positive_probability=0.4
                    ),
                    ScenarioConfiguration(
                        scenario_id="cloud_cred_1",
                        template_name="cloud_credential_compromise",
                        weight=1.5,
                        false_positive_probability=0.3
                    ),
                    ScenarioConfiguration(
                        scenario_id="spear_phish_1",
                        template_name="spear_phishing",
                        weight=1.0,
                        false_positive_probability=0.6
                    )
                ],
                demo_parameters={
                    "interval_seconds": 15.0,
                    "false_positive_rate": 0.65,
                    "complexity_level": "advanced",
                    "show_detailed_analysis": True,
                    "enable_real_time_metrics": True
                },
                compliance_focus=[ComplianceFramework.HKMA_SA2, ComplianceFramework.ISO27001]
            ),
            
            "executive_overview": DemoPreset(
                preset_id="executive_overview",
                name="Executive Overview",
                description="High-level business-focused demonstration emphasizing ROI, automation rates, and operational efficiency",
                target_audience=AudienceType.EXECUTIVE,
                duration_minutes=20,
                scenario_categories=[
                    ScenarioCategory.PHISHING,
                    ScenarioCategory.MALWARE,
                    ScenarioCategory.DATA_PROTECTION
                ],
                scenario_configurations=[
                    ScenarioConfiguration(
                        scenario_id="phish_basic_1",
                        template_name="phishing_email",
                        weight=3.0,
                        false_positive_probability=0.9
                    ),
                    ScenarioConfiguration(
                        scenario_id="malware_basic_1",
                        template_name="ransomware_encryption",
                        weight=1.0,
                        false_positive_probability=0.7,
                        complexity_override="basic"
                    ),
                    ScenarioConfiguration(
                        scenario_id="data_privacy_1",
                        template_name="data_privacy_violation",
                        weight=1.5,
                        false_positive_probability=0.8
                    )
                ],
                demo_parameters={
                    "interval_seconds": 45.0,
                    "false_positive_rate": 0.85,
                    "complexity_level": "basic",
                    "show_detailed_analysis": False,
                    "focus_on_metrics": True,
                    "highlight_automation": True
                },
                compliance_focus=[ComplianceFramework.HKMA_SA2]
            ),
            
            "compliance_focus": DemoPreset(
                preset_id="compliance_focus",
                name="Compliance & Regulatory Focus",
                description="Compliance-oriented demonstration highlighting HKMA requirements, audit trails, and regulatory reporting",
                target_audience=AudienceType.COMPLIANCE,
                duration_minutes=30,
                scenario_categories=[
                    ScenarioCategory.COMPLIANCE,
                    ScenarioCategory.DATA_PROTECTION,
                    ScenarioCategory.INSIDER_THREAT
                ],
                scenario_configurations=[
                    ScenarioConfiguration(
                        scenario_id="data_privacy_comp_1",
                        template_name="data_privacy_violation",
                        weight=2.5,
                        false_positive_probability=0.7
                    ),
                    ScenarioConfiguration(
                        scenario_id="insider_priv_1",
                        template_name="insider_privilege_abuse",
                        weight=2.0,
                        false_positive_probability=0.6
                    ),
                    ScenarioConfiguration(
                        scenario_id="phish_comp_1",
                        template_name="phishing_email",
                        weight=1.5,
                        false_positive_probability=0.8,
                        custom_parameters={"compliance_focus": True}
                    )
                ],
                demo_parameters={
                    "interval_seconds": 30.0,
                    "false_positive_rate": 0.75,
                    "complexity_level": "intermediate",
                    "generate_compliance_reports": True,
                    "show_audit_trail": True,
                    "highlight_hkma_mapping": True
                },
                compliance_focus=[
                    ComplianceFramework.HKMA_SA2,
                    ComplianceFramework.HKMA_TMG1,
                    ComplianceFramework.PDPO
                ]
            ),
            
            "financial_sector_demo": DemoPreset(
                preset_id="financial_sector_demo",
                name="Financial Sector Specialized",
                description="Hong Kong financial sector specific scenarios with banking and fintech threat patterns",
                target_audience=AudienceType.MIXED,
                duration_minutes=35,
                scenario_categories=[
                    ScenarioCategory.PHISHING,
                    ScenarioCategory.INSIDER_THREAT,
                    ScenarioCategory.COMPLIANCE,
                    ScenarioCategory.CLOUD_SECURITY
                ],
                scenario_configurations=[
                    ScenarioConfiguration(
                        scenario_id="banking_phish_1",
                        template_name="phishing_email",
                        weight=2.0,
                        false_positive_probability=0.8,
                        custom_parameters={
                            "sector_focus": "banking",
                            "hk_specific": True
                        }
                    ),
                    ScenarioConfiguration(
                        scenario_id="insider_banking_1",
                        template_name="insider_data_exfiltration",
                        weight=2.0,
                        false_positive_probability=0.5,
                        custom_parameters={
                            "data_type": "customer_financial_records",
                            "regulatory_impact": "high"
                        }
                    ),
                    ScenarioConfiguration(
                        scenario_id="cloud_banking_1",
                        template_name="cloud_credential_compromise",
                        weight=1.5,
                        false_positive_probability=0.4,
                        custom_parameters={
                            "cloud_service": "core_banking_system"
                        }
                    )
                ],
                demo_parameters={
                    "interval_seconds": 25.0,
                    "false_positive_rate": 0.78,
                    "complexity_level": "intermediate",
                    "sector_customization": "financial_services",
                    "regulatory_focus": "hkma",
                    "show_business_impact": True
                },
                compliance_focus=[
                    ComplianceFramework.HKMA_SA2,
                    ComplianceFramework.HKMA_TMG1,
                    ComplianceFramework.PDPO
                ]
            ),
            
            "continuous_monitoring": DemoPreset(
                preset_id="continuous_monitoring",
                name="Continuous Monitoring",
                description="Long-running demonstration for continuous threat monitoring and automated response capabilities",
                target_audience=AudienceType.TECHNICAL,
                duration_minutes=None,  # Continuous
                scenario_categories=[
                    ScenarioCategory.PHISHING,
                    ScenarioCategory.MALWARE,
                    ScenarioCategory.NETWORK_SECURITY,
                    ScenarioCategory.CLOUD_SECURITY
                ],
                scenario_configurations=[
                    ScenarioConfiguration(
                        scenario_id="phish_continuous_1",
                        template_name="phishing_email",
                        weight=3.0,
                        false_positive_probability=0.9
                    ),
                    ScenarioConfiguration(
                        scenario_id="malware_continuous_1",
                        template_name="ransomware_encryption",
                        weight=1.0,
                        false_positive_probability=0.8
                    ),
                    ScenarioConfiguration(
                        scenario_id="cloud_continuous_1",
                        template_name="cloud_credential_compromise",
                        weight=1.5,
                        false_positive_probability=0.85
                    ),
                    ScenarioConfiguration(
                        scenario_id="apt_continuous_1",
                        template_name="apt_reconnaissance",
                        weight=0.5,
                        false_positive_probability=0.7
                    )
                ],
                demo_parameters={
                    "interval_seconds": 60.0,
                    "false_positive_rate": 0.88,
                    "complexity_level": "basic",
                    "continuous_mode": True,
                    "adaptive_timing": True
                },
                compliance_focus=[ComplianceFramework.HKMA_SA2]
            )
        })
    
    def get_scenario_template(self, template_name: str) -> Optional[ScenarioTemplate]:
        """Get a specific scenario template"""
        return self._templates.get(template_name)
    
    def list_scenario_templates(
        self, 
        category: Optional[ScenarioCategory] = None
    ) -> List[ScenarioTemplate]:
        """List available scenario templates, optionally filtered by category"""
        templates = list(self._templates.values())
        
        if category:
            # Filter by category based on scenario type
            category_mapping = {
                ScenarioCategory.PHISHING: ["phishing_email", "spear_phishing"],
                ScenarioCategory.MALWARE: ["ransomware_encryption", "ransomware_lateral_movement"],
                ScenarioCategory.INSIDER_THREAT: ["insider_data_exfiltration", "insider_privilege_abuse"],
                ScenarioCategory.APT: ["apt_reconnaissance", "apt_persistence"],
                ScenarioCategory.CLOUD_SECURITY: ["cloud_credential_compromise"],
                ScenarioCategory.COMPLIANCE: ["data_privacy_violation"],
                ScenarioCategory.NETWORK_SECURITY: ["apt_reconnaissance", "ransomware_lateral_movement"],
                ScenarioCategory.DATA_PROTECTION: ["data_privacy_violation", "insider_data_exfiltration"]
            }
            
            if category in category_mapping:
                relevant_types = set(category_mapping[category])
                templates = [t for t in templates if t.scenario_type in relevant_types]
        
        return templates
    
    def get_demo_preset(self, preset_id: str) -> Optional[DemoPreset]:
        """Get a specific demo preset"""
        return self._presets.get(preset_id)
    
    def list_demo_presets(
        self, 
        audience: Optional[AudienceType] = None
    ) -> List[DemoPreset]:
        """List available demo presets, optionally filtered by audience"""
        presets = list(self._presets.values())
        
        if audience:
            presets = [p for p in presets if p.target_audience == audience or p.target_audience == AudienceType.MIXED]
        
        return presets
    
    def create_custom_preset(
        self,
        preset_id: str,
        name: str,
        description: str,
        target_audience: AudienceType,
        scenario_configurations: List[ScenarioConfiguration],
        demo_parameters: Dict[str, Any],
        duration_minutes: Optional[int] = None,
        compliance_focus: List[ComplianceFramework] = None,
        created_by: str = None
    ) -> DemoPreset:
        """Create a custom demo preset"""
        
        # Determine scenario categories from configurations
        scenario_categories = []
        for config in scenario_configurations:
            template = self.get_scenario_template(config.template_name)
            if template:
                # Map template types to categories
                type_to_category = {
                    "phishing_email": ScenarioCategory.PHISHING,
                    "spear_phishing": ScenarioCategory.PHISHING,
                    "ransomware_encryption": ScenarioCategory.MALWARE,
                    "ransomware_lateral_movement": ScenarioCategory.MALWARE,
                    "insider_data_exfiltration": ScenarioCategory.INSIDER_THREAT,
                    "insider_privilege_abuse": ScenarioCategory.INSIDER_THREAT,
                    "apt_reconnaissance": ScenarioCategory.APT,
                    "apt_persistence": ScenarioCategory.APT,
                    "cloud_credential_compromise": ScenarioCategory.CLOUD_SECURITY,
                    "data_privacy_violation": ScenarioCategory.COMPLIANCE
                }
                
                category = type_to_category.get(template.scenario_type)
                if category and category not in scenario_categories:
                    scenario_categories.append(category)
        
        preset = DemoPreset(
            preset_id=preset_id,
            name=name,
            description=description,
            target_audience=target_audience,
            duration_minutes=duration_minutes,
            scenario_categories=scenario_categories,
            scenario_configurations=scenario_configurations,
            demo_parameters=demo_parameters,
            compliance_focus=compliance_focus or [],
            created_by=created_by
        )
        
        self._presets[preset_id] = preset
        return preset
    
    def update_preset(
        self,
        preset_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """Update an existing demo preset"""
        if preset_id not in self._presets:
            return False
        
        preset = self._presets[preset_id]
        
        # Update allowed fields
        allowed_updates = [
            'name', 'description', 'duration_minutes', 
            'scenario_configurations', 'demo_parameters', 'compliance_focus'
        ]
        
        for key, value in updates.items():
            if key in allowed_updates and hasattr(preset, key):
                setattr(preset, key, value)
        
        return True
    
    def delete_preset(self, preset_id: str) -> bool:
        """Delete a custom demo preset (cannot delete default presets)"""
        default_presets = {
            "technical_deep_dive", "executive_overview", 
            "compliance_focus", "financial_sector_demo", "continuous_monitoring"
        }
        
        if preset_id in default_presets:
            return False  # Cannot delete default presets
        
        if preset_id in self._presets:
            del self._presets[preset_id]
            return True
        
        return False
    
    def get_scenarios_for_preset(
        self, 
        preset_id: str
    ) -> List[Dict[str, Any]]:
        """Get configured scenarios for a specific preset"""
        preset = self.get_demo_preset(preset_id)
        if not preset:
            return []
        
        scenarios = []
        for config in preset.scenario_configurations:
            template = self.get_scenario_template(config.template_name)
            if template:
                scenario_info = {
                    "scenario_id": config.scenario_id,
                    "template": asdict(template),
                    "configuration": asdict(config),
                    "effective_false_positive_rate": config.false_positive_probability,
                    "weight": config.weight,
                    "enabled": config.enabled
                }
                scenarios.append(scenario_info)
        
        return scenarios
    
    def validate_preset_configuration(
        self, 
        scenario_configurations: List[ScenarioConfiguration]
    ) -> Dict[str, Any]:
        """Validate a preset configuration"""
        validation_result = {
            "valid": True,
            "errors": [],
            "warnings": []
        }
        
        # Check if all templates exist
        for config in scenario_configurations:
            if config.template_name not in self._templates:
                validation_result["valid"] = False
                validation_result["errors"].append(
                    f"Template '{config.template_name}' not found"
                )
        
        # Check weight distribution
        total_weight = sum(config.weight for config in scenario_configurations if config.enabled)
        if total_weight == 0:
            validation_result["valid"] = False
            validation_result["errors"].append("No enabled scenarios with positive weight")
        
        # Check false positive rates
        fp_rates = [config.false_positive_probability for config in scenario_configurations]
        if any(rate < 0 or rate > 1 for rate in fp_rates):
            validation_result["valid"] = False
            validation_result["errors"].append("False positive probabilities must be between 0 and 1")
        
        # Warnings for best practices
        if len(scenario_configurations) < 3:
            validation_result["warnings"].append(
                "Consider adding more scenarios for better variety"
            )
        
        avg_fp_rate = sum(fp_rates) / len(fp_rates) if fp_rates else 0
        if avg_fp_rate < 0.7:
            validation_result["warnings"].append(
                "Average false positive rate is low - may not demonstrate automation effectively"
            )
        
        return validation_result
    
    def get_compliance_mapping(
        self, 
        framework: ComplianceFramework
    ) -> Dict[str, List[str]]:
        """Get compliance framework mapping for scenarios"""
        mappings = {
            ComplianceFramework.HKMA_SA2: {
                "phishing_email": ["SA-2 Section 4.2 - Email security controls"],
                "spear_phishing": ["SA-2 Section 4.2 - Email security controls", "SA-2 Section 6.1 - User awareness"],
                "ransomware_encryption": ["SA-2 Section 5.3 - Business continuity"],
                "ransomware_lateral_movement": ["SA-2 Section 4.4 - Network segmentation"],
                "insider_data_exfiltration": ["SA-2 Section 6.2 - Privileged access monitoring"],
                "insider_privilege_abuse": ["SA-2 Section 6.2 - Privileged access monitoring"],
                "apt_reconnaissance": ["SA-2 Section 4.1 - Network monitoring"],
                "apt_persistence": ["SA-2 Section 4.3 - Endpoint protection"],
                "cloud_credential_compromise": ["SA-2 Section 7.1 - Cloud security"],
                "data_privacy_violation": ["SA-2 Section 6.1 - Data protection controls"]
            },
            ComplianceFramework.HKMA_TMG1: {
                "spear_phishing": ["TM-G-1 Section 3.1 - Senior management awareness"],
                "insider_privilege_abuse": ["TM-G-1 Section 4.2 - Privileged access management"],
                "data_privacy_violation": ["TM-G-1 Section 5.1 - Data governance"]
            },
            ComplianceFramework.PDPO: {
                "data_privacy_violation": ["PDPO Section 4 - Data protection principles"],
                "insider_data_exfiltration": ["PDPO Section 27 - Data security measures"]
            }
        }
        
        return mappings.get(framework, {})
    
    def export_preset(self, preset_id: str) -> Optional[Dict[str, Any]]:
        """Export a preset configuration to JSON-serializable format"""
        preset = self.get_demo_preset(preset_id)
        if not preset:
            return None
        
        # Convert to serializable format
        export_data = {
            "preset_id": preset.preset_id,
            "name": preset.name,
            "description": preset.description,
            "target_audience": preset.target_audience.value,
            "duration_minutes": preset.duration_minutes,
            "scenario_categories": [cat.value for cat in preset.scenario_categories],
            "scenario_configurations": [asdict(config) for config in preset.scenario_configurations],
            "demo_parameters": preset.demo_parameters,
            "compliance_focus": [framework.value for framework in preset.compliance_focus],
            "created_at": preset.created_at.isoformat() if preset.created_at else None,
            "created_by": preset.created_by,
            "export_timestamp": datetime.utcnow().isoformat()
        }
        
        return export_data
    
    def import_preset(self, preset_data: Dict[str, Any]) -> bool:
        """Import a preset configuration from JSON data"""
        try:
            # Convert back from serializable format
            scenario_configs = []
            for config_data in preset_data.get("scenario_configurations", []):
                scenario_configs.append(ScenarioConfiguration(**config_data))
            
            compliance_focus = []
            for framework_str in preset_data.get("compliance_focus", []):
                try:
                    compliance_focus.append(ComplianceFramework(framework_str))
                except ValueError:
                    pass  # Skip invalid framework values
            
            scenario_categories = []
            for cat_str in preset_data.get("scenario_categories", []):
                try:
                    scenario_categories.append(ScenarioCategory(cat_str))
                except ValueError:
                    pass  # Skip invalid category values
            
            preset = DemoPreset(
                preset_id=preset_data["preset_id"],
                name=preset_data["name"],
                description=preset_data["description"],
                target_audience=AudienceType(preset_data["target_audience"]),
                duration_minutes=preset_data.get("duration_minutes"),
                scenario_categories=scenario_categories,
                scenario_configurations=scenario_configs,
                demo_parameters=preset_data["demo_parameters"],
                compliance_focus=compliance_focus,
                created_at=datetime.fromisoformat(preset_data["created_at"]) if preset_data.get("created_at") else None,
                created_by=preset_data.get("created_by")
            )
            
            self._presets[preset.preset_id] = preset
            return True
            
        except Exception as e:
            print(f"Error importing preset: {e}")
            return False


# Global scenario library instance
scenario_library = ScenarioLibrary()