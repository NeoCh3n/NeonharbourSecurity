"""Tests for demo data generation infrastructure."""
from __future__ import annotations

import json
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from src.demo.generator import DemoDataGenerator, DemoAlert, GenerationSession
from src.demo.scenarios import get_scenario_templates, ScenarioTemplate
from src.demo.variations import AlertVariationEngine, VariationConfig
from src.demo.integration import DemoPipelineIntegration


class TestScenarioTemplates:
    """Test scenario template system."""
    
    def test_load_scenario_templates(self):
        """Test loading scenario templates."""
        templates = get_scenario_templates()
        
        assert len(templates) > 0
        assert all(isinstance(t, ScenarioTemplate) for t in templates)
        
        # Check required fields
        for template in templates:
            assert template.scenario_type
            assert template.attack_vector
            assert template.source
            assert template.severity
            assert template.tactics
            assert template.title_template
            assert template.description_template
            assert template.hkma_relevance
    
    def test_scenario_template_uniqueness(self):
        """Test that scenario types are unique."""
        templates = get_scenario_templates()
        scenario_types = [t.scenario_type for t in templates]
        
        assert len(scenario_types) == len(set(scenario_types))
    
    def test_scenario_template_hkma_compliance(self):
        """Test that all templates reference HKMA requirements."""
        templates = get_scenario_templates()
        
        for template in templates:
            hkma_ref = template.hkma_relevance.lower()
            assert any(keyword in hkma_ref for keyword in ["sa-2", "tm-g-1", "hkma", "pdpo"])


class TestAlertVariationEngine:
    """Test alert variation engine."""
    
    def test_variation_engine_initialization(self):
        """Test variation engine initialization."""
        engine = AlertVariationEngine()
        
        assert engine.config is not None
        assert len(engine.severity_levels) > 0
        assert len(engine.source_systems) > 0
        assert len(engine.hk_ip_ranges) > 0
    
    def test_apply_variations(self):
        """Test applying variations to templates."""
        engine = AlertVariationEngine()
        templates = get_scenario_templates()
        template = templates[0]
        
        # Test false positive variation
        fp_variant = engine.apply_variations(template, is_false_positive=True)
        assert fp_variant.scenario_type == template.scenario_type
        
        # Test genuine threat variation
        threat_variant = engine.apply_variations(template, is_false_positive=False)
        assert threat_variant.scenario_type == template.scenario_type
    
    def test_hostname_generation(self):
        """Test hostname generation."""
        engine = AlertVariationEngine()
        
        hostname = engine._generate_hostname()
        assert isinstance(hostname, str)
        assert len(hostname) > 0
        assert any(prefix in hostname for prefix in ["HK-", "HKBANK-", "TRADING-", "BRANCH-"])
    
    def test_ip_generation(self):
        """Test IP address generation."""
        engine = AlertVariationEngine()
        
        ip = engine._generate_ip_address()
        assert isinstance(ip, str)
        
        # Should be valid IP format
        parts = ip.split(".")
        assert len(parts) == 4
        assert all(0 <= int(part) <= 255 for part in parts)
    
    def test_variation_stats(self):
        """Test variation statistics."""
        engine = AlertVariationEngine()
        stats = engine.get_variation_stats()
        
        assert isinstance(stats, dict)
        assert "severity_levels" in stats
        assert "source_systems" in stats
        assert stats["severity_levels"] > 0
        assert stats["source_systems"] > 0


class TestDemoDataGenerator:
    """Test demo data generator."""
    
    @patch('src.demo.generator.BedrockAnalyst')
    def test_generator_initialization(self, mock_analyst):
        """Test generator initialization."""
        generator = DemoDataGenerator()
        
        assert generator.analyst is not None
        assert generator.variation_engine is not None
        assert len(generator.scenario_templates) > 0
    
    def test_session_management(self):
        """Test demo session management."""
        with patch('src.demo.generator.BedrockAnalyst'):
            generator = DemoDataGenerator()
            
            # Test session creation parameters
            scenario_types = ["phishing_email"]
            
            # Mock the generation loop to avoid actual threading
            with patch.object(generator, '_generation_loop'):
                session_id = generator.start_continuous_generation(
                    scenario_types=scenario_types,
                    interval_seconds=30.0,
                    false_positive_rate=0.8
                )
                
                assert session_id in generator._active_sessions
                
                # Test session status
                status = generator.get_session_status(session_id)
                assert status["session_id"] == session_id
                assert status["scenario_types"] == scenario_types
                
                # Test stopping session
                generator.stop_generation(session_id)
                assert generator._active_sessions[session_id].status == "stopped"
    
    def test_invalid_scenario_type(self):
        """Test handling of invalid scenario types."""
        with patch('src.demo.generator.BedrockAnalyst'):
            generator = DemoDataGenerator()
            
            with pytest.raises(ValueError, match="Invalid scenario types"):
                generator.start_continuous_generation(
                    scenario_types=["invalid_scenario"]
                )
    
    @patch('src.demo.generator.BedrockAnalyst')
    def test_single_alert_generation_structure(self, mock_analyst):
        """Test single alert generation structure."""
        # Mock the analyst response
        mock_analyst_instance = Mock()
        mock_analyst_instance.summarize_investigation.return_value = {
            "summary": json.dumps({
                "title": "Test Alert",
                "description": "Test description",
                "entities": [{"type": "test", "name": "test_entity"}]
            })
        }
        mock_analyst.return_value = mock_analyst_instance
        
        generator = DemoDataGenerator()
        
        alert = generator.generate_single_alert(
            scenario_type="phishing_email",
            risk_level="low"
        )
        
        assert isinstance(alert, DemoAlert)
        assert alert.alert_id
        assert alert.investigation_id
        assert alert.scenario_type == "phishing_email"
        assert alert.is_false_positive is True  # risk_level="low"
        assert alert.confidence_score < 0.5  # Low confidence for false positive
    
    @patch('boto3.client')
    def test_send_alert_to_pipeline(self, mock_boto_client):
        """Test sending alert to EventBridge."""
        mock_events_client = Mock()
        mock_boto_client.return_value = mock_events_client
        
        with patch('src.demo.generator.BedrockAnalyst'):
            generator = DemoDataGenerator()
            
            # Create test alert
            alert = DemoAlert(
                alert_id="test-123",
                investigation_id="INV-test-123",
                tenant_id="test-tenant",
                source="sentinel",
                title="Test Alert",
                description="Test description",
                severity="High",
                risk_level="high",
                entities=[],
                tactics=["InitialAccess"],
                timestamp=datetime.now(timezone.utc).isoformat(),
                scenario_type="phishing_email",
                is_false_positive=False,
                confidence_score=0.8,
                raw_data={}
            )
            
            generator.send_alert_to_pipeline(alert)
            
            # Verify EventBridge call
            mock_events_client.put_events.assert_called_once()
            call_args = mock_events_client.put_events.call_args[1]
            
            assert "Entries" in call_args
            entry = call_args["Entries"][0]
            assert entry["Source"] == "asia.agentic.soc.demo"
            assert entry["DetailType"] == "DemoAlert"
            
            detail = json.loads(entry["Detail"])
            assert detail["investigationId"] == alert.investigation_id
            assert detail["alert"]["isDemo"] is True


class TestDemoPipelineIntegration:
    """Test demo pipeline integration."""
    
    def test_integration_initialization(self):
        """Test integration initialization."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            assert integration.generator is not None
    
    def test_get_available_scenarios(self):
        """Test getting available scenarios."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            scenarios = integration.get_available_demo_scenarios()
            
            assert isinstance(scenarios, dict)
            assert len(scenarios) > 0
            
            # Check scenario structure
            for scenario_type, details in scenarios.items():
                assert "attack_vector" in details
                assert "source" in details
                assert "severity" in details
                assert "tactics" in details
                assert "hkma_relevance" in details
    
    def test_demo_presets(self):
        """Test demo preset configurations."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            presets = integration.create_demo_preset_configurations()
            
            assert isinstance(presets, dict)
            assert len(presets) > 0
            
            # Check required presets
            required_presets = [
                "technical_deep_dive", "executive_overview", 
                "compliance_focus", "soc_analyst_training", "quick_demo"
            ]
            
            for preset_name in required_presets:
                assert preset_name in presets
                preset = presets[preset_name]
                assert "name" in preset
                assert "description" in preset
                assert "scenario_types" in preset
                assert "target_audience" in preset
    
    def test_configuration_validation(self):
        """Test demo configuration validation."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            
            # Valid configuration
            valid_config = {
                "scenario_types": ["phishing_email"],
                "interval_seconds": 30.0,
                "false_positive_rate": 0.8,
                "duration_minutes": 15
            }
            
            result = integration.validate_demo_configuration(valid_config)
            assert result["valid"] is True
            assert len(result["errors"]) == 0
            
            # Invalid configuration
            invalid_config = {
                "scenario_types": ["invalid_scenario"],
                "interval_seconds": 5.0,  # Too short
                "false_positive_rate": 1.5,  # Invalid range
            }
            
            result = integration.validate_demo_configuration(invalid_config)
            assert result["valid"] is False
            assert len(result["errors"]) > 0
    
    def test_create_demo_event(self):
        """Test creating demo investigation event."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            
            # Create test alert
            alert = DemoAlert(
                alert_id="test-123",
                investigation_id="INV-test-123",
                tenant_id="test-tenant",
                source="sentinel",
                title="Test Alert",
                description="Test description",
                severity="High",
                risk_level="high",
                entities=[],
                tactics=["InitialAccess"],
                timestamp=datetime.now(timezone.utc).isoformat(),
                scenario_type="phishing_email",
                is_false_positive=False,
                confidence_score=0.8,
                raw_data={}
            )
            
            event = integration.create_demo_investigation_event(alert)
            
            assert event["Source"] == "asia.agentic.soc.demo"
            assert event["DetailType"] == "DemoAlert"
            
            detail = json.loads(event["Detail"])
            assert detail["alert"]["isDemo"] is True
            assert detail["demoMetadata"]["scenarioType"] == "phishing_email"
    
    def test_metrics_schema(self):
        """Test demo metrics schema."""
        with patch('src.demo.integration.DemoDataGenerator'):
            integration = DemoPipelineIntegration()
            schema = integration.get_demo_metrics_schema()
            
            assert isinstance(schema, dict)
            assert "session_metrics" in schema
            assert "alert_metrics" in schema
            assert "performance_metrics" in schema
            
            # Check session metrics schema
            session_schema = schema["session_metrics"]
            required_fields = [
                "session_id", "start_time", "end_time", 
                "total_alerts_generated", "automation_rate"
            ]
            for field in required_fields:
                assert field in session_schema