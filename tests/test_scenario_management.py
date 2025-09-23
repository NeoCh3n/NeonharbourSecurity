"""
Tests for the scenario management system
"""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch

from src.demo.scenario_library import (
    ScenarioLibrary,
    ScenarioConfiguration,
    DemoPreset,
    ScenarioCategory,
    ComplianceFramework,
    AudienceType
)
from src.demo.scenario_manager import ScenarioManager
from src.demo.custom_config import (
    CustomScenarioConfigurator,
    CustomConfigurationRequest,
    ConfigurationTemplate
)


class TestScenarioLibrary:
    """Test scenario library functionality"""
    
    def test_scenario_library_initialization(self):
        """Test that scenario library initializes with default templates and presets"""
        library = ScenarioLibrary()
        
        # Should have default templates
        templates = library.list_scenario_templates()
        assert len(templates) > 0
        
        # Should have default presets
        presets = library.list_demo_presets()
        assert len(presets) > 0
        
        # Check specific templates exist
        phishing_template = library.get_scenario_template("phishing_email")
        assert phishing_template is not None
        assert phishing_template.scenario_type == "phishing_email"
    
    def test_scenario_template_filtering(self):
        """Test filtering scenarios by category"""
        library = ScenarioLibrary()
        
        # Test phishing category
        phishing_scenarios = library.list_scenario_templates(ScenarioCategory.PHISHING)
        assert len(phishing_scenarios) > 0
        
        # All returned scenarios should be phishing-related
        phishing_types = ["phishing_email", "spear_phishing"]
        for scenario in phishing_scenarios:
            assert scenario.scenario_type in phishing_types
    
    def test_demo_preset_retrieval(self):
        """Test demo preset retrieval and filtering"""
        library = ScenarioLibrary()
        
        # Test getting specific preset
        technical_preset = library.get_demo_preset("technical_deep_dive")
        assert technical_preset is not None
        assert technical_preset.target_audience == AudienceType.TECHNICAL
        
        # Test filtering by audience
        executive_presets = library.list_demo_presets(AudienceType.EXECUTIVE)
        assert len(executive_presets) > 0
        
        for preset in executive_presets:
            assert preset.target_audience in [AudienceType.EXECUTIVE, AudienceType.MIXED]
    
    def test_custom_preset_creation(self):
        """Test creating custom demo presets"""
        library = ScenarioLibrary()
        
        # Create scenario configurations
        scenario_configs = [
            ScenarioConfiguration(
                scenario_id="test_phishing",
                template_name="phishing_email",
                weight=2.0,
                false_positive_probability=0.8
            ),
            ScenarioConfiguration(
                scenario_id="test_malware",
                template_name="ransomware_encryption",
                weight=1.0,
                false_positive_probability=0.6
            )
        ]
        
        # Create custom preset
        preset = library.create_custom_preset(
            preset_id="test_custom",
            name="Test Custom Preset",
            description="Test preset for unit testing",
            target_audience=AudienceType.TECHNICAL,
            scenario_configurations=scenario_configs,
            demo_parameters={"interval_seconds": 20.0},
            duration_minutes=30,
            created_by="test_user"
        )
        
        assert preset.preset_id == "test_custom"
        assert preset.name == "Test Custom Preset"
        assert len(preset.scenario_configurations) == 2
        assert preset.target_audience == AudienceType.TECHNICAL
    
    def test_preset_validation(self):
        """Test preset configuration validation"""
        library = ScenarioLibrary()
        
        # Valid configuration
        valid_configs = [
            ScenarioConfiguration(
                scenario_id="valid_1",
                template_name="phishing_email",
                weight=1.0,
                false_positive_probability=0.8
            )
        ]
        
        validation = library.validate_preset_configuration(valid_configs)
        assert validation["valid"] is True
        assert len(validation["errors"]) == 0
        
        # Invalid configuration - non-existent template
        invalid_configs = [
            ScenarioConfiguration(
                scenario_id="invalid_1",
                template_name="non_existent_template",
                weight=1.0,
                false_positive_probability=0.8
            )
        ]
        
        validation = library.validate_preset_configuration(invalid_configs)
        assert validation["valid"] is False
        assert len(validation["errors"]) > 0
    
    def test_compliance_mapping(self):
        """Test compliance framework mapping"""
        library = ScenarioLibrary()
        
        # Test HKMA SA-2 mapping
        hkma_mapping = library.get_compliance_mapping(ComplianceFramework.HKMA_SA2)
        assert len(hkma_mapping) > 0
        
        # Should include phishing scenarios
        assert "phishing_email" in hkma_mapping
        assert len(hkma_mapping["phishing_email"]) > 0
    
    def test_preset_export_import(self):
        """Test preset export and import functionality"""
        library = ScenarioLibrary()
        
        # Export existing preset
        export_data = library.export_preset("technical_deep_dive")
        assert export_data is not None
        assert export_data["preset_id"] == "technical_deep_dive"
        assert "export_timestamp" in export_data
        
        # Modify preset ID for import test
        export_data["preset_id"] = "imported_test_preset"
        
        # Import preset
        success = library.import_preset(export_data)
        assert success is True
        
        # Verify imported preset exists
        imported_preset = library.get_demo_preset("imported_test_preset")
        assert imported_preset is not None
        assert imported_preset.name == export_data["name"]


class TestScenarioManager:
    """Test scenario manager functionality"""
    
    def test_scenario_manager_initialization(self):
        """Test scenario manager initialization"""
        manager = ScenarioManager()
        assert manager.library is not None
    
    def test_get_available_scenarios(self):
        """Test getting available scenarios"""
        manager = ScenarioManager()
        
        scenarios = manager.get_available_scenarios()
        assert len(scenarios) > 0
        
        # Check scenario structure
        scenario = scenarios[0]
        required_fields = [
            "scenario_type", "attack_vector", "source", "severity",
            "tactics", "title_template", "description_template", "hkma_relevance"
        ]
        
        for field in required_fields:
            assert field in scenario
    
    def test_get_scenarios_by_category(self):
        """Test filtering scenarios by category"""
        manager = ScenarioManager()
        
        # Test valid category
        phishing_scenarios = manager.get_scenarios_by_category("phishing")
        assert len(phishing_scenarios) > 0
        
        # Test invalid category
        invalid_scenarios = manager.get_scenarios_by_category("invalid_category")
        assert len(invalid_scenarios) == 0
    
    def test_get_demo_presets(self):
        """Test getting demo presets"""
        manager = ScenarioManager()
        
        # Get all presets
        all_presets = manager.get_demo_presets()
        assert len(all_presets) > 0
        
        # Get presets for specific audience
        technical_presets = manager.get_demo_presets("technical")
        assert len(technical_presets) > 0
        
        # Verify preset structure
        preset = all_presets[0]
        required_fields = [
            "preset_id", "name", "description", "target_audience",
            "scenario_count", "demo_parameters"
        ]
        
        for field in required_fields:
            assert field in preset
    
    def test_get_preset_details(self):
        """Test getting detailed preset information"""
        manager = ScenarioManager()
        
        # Test existing preset
        details = manager.get_preset_details("technical_deep_dive")
        assert details is not None
        assert details["preset_id"] == "technical_deep_dive"
        assert "scenarios" in details
        assert len(details["scenarios"]) > 0
        
        # Test non-existent preset
        details = manager.get_preset_details("non_existent")
        assert details is None
    
    def test_create_custom_preset(self):
        """Test creating custom presets through manager"""
        manager = ScenarioManager()
        
        preset_config = {
            "preset_id": "test_manager_preset",
            "name": "Test Manager Preset",
            "description": "Test preset created through manager",
            "target_audience": "technical",
            "scenarios": [
                {
                    "scenario_id": "test_scenario_1",
                    "template_name": "phishing_email",
                    "weight": 1.5,
                    "false_positive_probability": 0.7
                }
            ],
            "demo_parameters": {
                "interval_seconds": 25.0,
                "complexity_level": "intermediate"
            },
            "duration_minutes": 20
        }
        
        result = manager.create_custom_preset(preset_config, "test_user")
        assert result["success"] is True
        assert result["preset_id"] == "test_manager_preset"
    
    def test_validate_scenario_configuration(self):
        """Test scenario configuration validation through manager"""
        manager = ScenarioManager()
        
        # Valid configuration
        valid_scenarios = [
            {
                "template_name": "phishing_email",
                "weight": 1.0,
                "false_positive_probability": 0.8
            }
        ]
        
        validation = manager.validate_scenario_configuration(valid_scenarios)
        assert validation["valid"] is True
        
        # Invalid configuration
        invalid_scenarios = [
            {
                "template_name": "invalid_template",
                "weight": 1.0,
                "false_positive_probability": 0.8
            }
        ]
        
        validation = manager.validate_scenario_configuration(invalid_scenarios)
        assert validation["valid"] is False
    
    def test_get_compliance_mapping(self):
        """Test compliance mapping through manager"""
        manager = ScenarioManager()
        
        # Test valid framework
        result = manager.get_compliance_mapping("hkma_sa2")
        assert result["success"] is True
        assert "mapping" in result
        assert len(result["mapping"]) > 0
        
        # Test invalid framework
        result = manager.get_compliance_mapping("invalid_framework")
        assert result["success"] is False
        assert "available_frameworks" in result
    
    def test_get_preset_recommendations(self):
        """Test preset recommendations"""
        manager = ScenarioManager()
        
        recommendations = manager.get_preset_recommendations(
            audience="technical",
            duration_minutes=30,
            compliance_requirements=["hkma_sa2"]
        )
        
        assert len(recommendations) > 0
        
        # Check recommendation structure
        rec = recommendations[0]
        required_fields = [
            "preset_id", "name", "match_score", "match_reasons",
            "target_audience", "scenario_count"
        ]
        
        for field in required_fields:
            assert field in rec
        
        # Recommendations should be sorted by match score
        scores = [r["match_score"] for r in recommendations]
        assert scores == sorted(scores, reverse=True)


class TestCustomScenarioConfigurator:
    """Test custom scenario configurator"""
    
    def test_configurator_initialization(self):
        """Test configurator initialization"""
        configurator = CustomScenarioConfigurator()
        assert configurator.library is not None
        assert configurator.manager is not None
    
    def test_generate_custom_configuration(self):
        """Test generating custom configurations"""
        configurator = CustomScenarioConfigurator()
        
        request = CustomConfigurationRequest(
            name="Test Custom Config",
            description="Test configuration for unit testing",
            target_audience="technical",
            duration_minutes=30,
            primary_objectives=["automation", "threat_detection"],
            scenario_preferences={"phishing_email": 2.0, "ransomware_encryption": 1.5},
            compliance_requirements=["hkma_sa2"],
            complexity_level="intermediate",
            false_positive_target=0.8,
            custom_parameters={"test_mode": True}
        )
        
        result = configurator.generate_custom_configuration(request)
        assert result["success"] is True
        assert "configuration" in result
        assert result["scenario_count"] > 0
        
        config = result["configuration"]
        assert config["name"] == "Test Custom Config"
        assert config["target_audience"] == "technical"
        assert len(config["scenarios"]) > 0
    
    def test_apply_configuration_template(self):
        """Test applying configuration templates"""
        configurator = CustomScenarioConfigurator()
        
        # Test valid template
        result = configurator.apply_configuration_template("quick_demo")
        assert result["success"] is True
        assert "configuration" in result
        
        # Test invalid template
        result = configurator.apply_configuration_template("invalid_template")
        assert result["success"] is False
        assert "available_templates" in result
    
    def test_optimize_for_audience(self):
        """Test audience optimization"""
        configurator = CustomScenarioConfigurator()
        
        base_config = {
            "scenarios": [
                {
                    "template_name": "phishing_email",
                    "weight": 1.0,
                    "false_positive_probability": 0.8
                }
            ],
            "demo_parameters": {
                "interval_seconds": 30.0
            }
        }
        
        # Test technical audience optimization
        result = configurator.optimize_for_audience(base_config, "technical")
        assert result["success"] is True
        assert "optimized_configuration" in result
        
        optimized = result["optimized_configuration"]
        assert optimized["target_audience"] == "technical"
        assert "optimizations_applied" in result
    
    def test_tune_scenario_parameters(self):
        """Test scenario parameter tuning"""
        configurator = CustomScenarioConfigurator()
        
        scenario_config = {
            "template_name": "phishing_email",
            "weight": 1.0,
            "false_positive_probability": 0.8
        }
        
        tuning_objectives = {
            "false_positive_target": 0.6,
            "weight_adjustment": 1.5,
            "complexity_preference": "advanced"
        }
        
        result = configurator.tune_scenario_parameters(scenario_config, tuning_objectives)
        assert result["success"] is True
        
        tuned = result["tuned_configuration"]
        assert tuned["false_positive_probability"] == 0.6
        assert tuned["weight"] == 1.5
        assert tuned["complexity_override"] == "advanced"
    
    def test_generate_scenario_variations(self):
        """Test generating scenario variations"""
        configurator = CustomScenarioConfigurator()
        
        variations = configurator.generate_scenario_variations("phishing_email", 3)
        assert len(variations) == 3
        
        # Each variation should have different characteristics
        fp_rates = [v["false_positive_probability"] for v in variations]
        assert len(set(fp_rates)) > 1  # Should have different false positive rates
        
        # Check variation structure
        variation = variations[0]
        required_fields = [
            "scenario_id", "template_name", "enabled", "weight",
            "false_positive_probability", "custom_parameters"
        ]
        
        for field in required_fields:
            assert field in variation
    
    def test_get_configuration_templates(self):
        """Test getting configuration templates"""
        configurator = CustomScenarioConfigurator()
        
        templates = configurator.get_configuration_templates()
        assert len(templates) > 0
        
        # Check template structure
        template = templates[0]
        required_fields = [
            "template_id", "name", "description", "duration_minutes",
            "scenario_count", "complexity_level", "focus_areas"
        ]
        
        for field in required_fields:
            assert field in template
        
        # Should include expected templates
        template_ids = [t["template_id"] for t in templates]
        expected_templates = ["quick_demo", "comprehensive", "compliance_focused"]
        
        for expected in expected_templates:
            assert expected in template_ids


class TestIntegration:
    """Integration tests for scenario management system"""
    
    def test_end_to_end_custom_preset_creation(self):
        """Test complete workflow of creating and using custom preset"""
        # Initialize components
        library = ScenarioLibrary()
        manager = ScenarioManager(library)
        configurator = CustomScenarioConfigurator()
        
        # Step 1: Generate custom configuration
        request = CustomConfigurationRequest(
            name="Integration Test Preset",
            description="End-to-end test preset",
            target_audience="compliance",
            duration_minutes=25,
            primary_objectives=["compliance", "audit_trails"],
            scenario_preferences={"data_privacy_violation": 2.0},
            compliance_requirements=["hkma_sa2", "pdpo"],
            complexity_level="intermediate",
            false_positive_target=0.75,
            custom_parameters={"integration_test": True}
        )
        
        config_result = configurator.generate_custom_configuration(request)
        assert config_result["success"] is True
        
        # Step 2: Create preset through manager
        preset_result = manager.create_custom_preset(
            config_result["configuration"], 
            "integration_test_user"
        )
        assert preset_result["success"] is True
        
        preset_id = preset_result["preset_id"]
        
        # Step 3: Retrieve and verify preset
        preset_details = manager.get_preset_details(preset_id)
        assert preset_details is not None
        assert preset_details["name"] == "Integration Test Preset"
        assert preset_details["target_audience"] == "compliance"
        assert len(preset_details["scenarios"]) > 0
        
        # Step 4: Get scenarios for preset
        scenarios = library.get_scenarios_for_preset(preset_id)
        assert len(scenarios) > 0
        
        # Verify scenario structure
        scenario = scenarios[0]
        assert "template" in scenario
        assert "configuration" in scenario
        assert scenario["configuration"]["false_positive_probability"] == 0.75
    
    def test_preset_recommendation_and_optimization(self):
        """Test preset recommendation and optimization workflow"""
        manager = ScenarioManager()
        configurator = CustomScenarioConfigurator()
        
        # Step 1: Get recommendations
        recommendations = manager.get_preset_recommendations(
            audience="executive",
            duration_minutes=20,
            compliance_requirements=["hkma_sa2"]
        )
        
        assert len(recommendations) > 0
        best_preset = recommendations[0]
        
        # Step 2: Get preset details
        preset_details = manager.get_preset_details(best_preset["preset_id"])
        assert preset_details is not None
        
        # Step 3: Optimize for different audience
        optimized_result = configurator.optimize_for_audience(
            preset_details, 
            "technical"
        )
        
        assert optimized_result["success"] is True
        optimized_config = optimized_result["optimized_configuration"]
        
        # Verify optimization applied
        assert optimized_config["target_audience"] == "technical"
        assert len(optimized_result["optimizations_applied"]) > 0


if __name__ == "__main__":
    pytest.main([__file__])