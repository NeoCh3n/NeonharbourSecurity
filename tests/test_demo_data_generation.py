"""
Comprehensive unit tests for demo data generation infrastructure.
Tests the core demo data generator, scenario templates, and alert variation engine.
"""

import json
import pytest
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock
from dataclasses import asdict

from src.demo.generator import (
    DemoDataGenerator, 
    DemoAlert, 
    GenerationSession
)
from src.demo.scenarios import (
    ScenarioTemplate, 
    get_scenario_templates,
    validate_scenario_template
)
from src.demo.variations import (
    AlertVariationEngine, 
    VariationConfig,
    apply_hk_context
)


class TestScenarioTemplates:
    """Test scenario template system and validation."""
    
    def test_load_all_scenario_templates(self):
        """Test loading and validating all scenario templates."""
        templates = get_scenario_templates()
        
        assert len(templates) >= 10, "Should have at least 10 scenario templates"
        
        # Verify all templates are valid
        for template in templates:
            assert isinstance(template, ScenarioTemplate)
            validation_result = validate_scenario_template(template)
            assert validation_result["valid"], f"Template {template.scenario_type} failed validation: {validation_result['errors']}"
    
    def test_scenario_template_required_fields(self):
        """Test that all templates have required fields."""
        templates = get_scenario_templates()
        
        required_fields = [
            'scenario_type', 'attack_vector', 'source', 'severity',
            'tactics', 'title_template', 'description_template', 'hkma_relevance'
        ]
        
        for template in templates:
            for field in required_fields:
                assert hasattr(template, field), f"Template {template.scenario_type} missing field: {field}"
                assert getattr(template, field), f"Template {template.scenario_type} has empty field: {field}"
    
    def test_scenario_template_uniqueness(self):
        """Test that scenario types are unique across templates."""
        templates = get_scenario_templates()
        scenario_types = [t.scenario_type for t in templates]
        
        assert len(scenario_types) == len(set(scenario_types)), "Duplicate scenario types found"
    
    def test_hkma_compliance_coverage(self):
        """Test that templates cover key HKMA compliance areas."""
        templates = get_scenario_templates()
        hkma_keywords = ['sa-2', 'tm-g-1', 'hkma', 'pdpo', 'data privacy', 'operational risk']
        
        covered_templates = []
        for template in templates:
            hkma_text = template.hkma_relevance.lower()
            if any(keyword in hkma_text for keyword in hkma_keywords):
                covered_templates.append(template.scenario_type)
        
        assert len(covered_templates) >= 5, f"Should have at least 5 HKMA-relevant templates, found: {covered_templates}"
    
    def test_scenario_template_tactics_validation(self):
        """Test that tactics follow MITRE ATT&CK format."""
        templates = get_scenario_templates()
        valid_tactics = [
            'InitialAccess', 'Execution', 'Persistence', 'PrivilegeEscalation',
            'DefenseEvasion', 'CredentialAccess', 'Discovery', 'LateralMovement',
            'Collection', 'CommandAndControl', 'Exfiltration', 'Impact', 'Reconnaissance'
        ]
        
        for template in templates:
            for tactic in template.tactics:
                assert tactic in valid_tactics, f"Invalid tactic '{tactic}' in template {template.scenario_type}"


class TestAlertVariationEngine:
    """Test alert variation engine for diverse scenario generation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.engine = AlertVariationEngine()
        self.templates = get_scenario_templates()
        self.sample_template = self.templates[0]
    
    def test_variation_engine_initialization(self):
        """Test variation engine initializes with proper configuration."""
        assert self.engine.config is not None
        assert isinstance(self.engine.config, VariationConfig)
        assert len(self.engine.severity_levels) > 0
        assert len(self.engine.source_systems) > 0
        assert len(self.engine.hk_ip_ranges) > 0
    
    def test_false_positive_variation_generation(self):
        """Test generating false positive variations."""
        fp_variant = self.engine.apply_variations(self.sample_template, is_false_positive=True)
        
        assert fp_variant.scenario_type == self.sample_template.scenario_type
        assert fp_variant.is_false_positive is True
        
        # False positives should have lower severity and confidence
        severity_levels = ['Low', 'Medium', 'High', 'Critical']
        original_severity_index = severity_levels.index(self.sample_template.severity)
        variant_severity_index = severity_levels.index(fp_variant.severity)
        
        # Variant should be same or lower severity for false positives
        assert variant_severity_index <= original_severity_index
    
    def test_genuine_threat_variation_generation(self):
        """Test generating genuine threat variations."""
        threat_variant = self.engine.apply_variations(self.sample_template, is_false_positive=False)
        
        assert threat_variant.scenario_type == self.sample_template.scenario_type
        assert threat_variant.is_false_positive is False
        
        # Genuine threats should maintain or increase severity
        severity_levels = ['Low', 'Medium', 'High', 'Critical']
        original_severity_index = severity_levels.index(self.sample_template.severity)
        variant_severity_index = severity_levels.index(threat_variant.severity)
        
        # Variant should be same or higher severity for genuine threats
        assert variant_severity_index >= original_severity_index
    
    def test_hong_kong_context_application(self):
        """Test application of Hong Kong specific context."""
        hk_variant = apply_hk_context(self.sample_template)
        
        # Should have HK-specific elements
        hk_indicators = ['HK-', 'HKBANK-', 'TRADING-', 'BRANCH-', '.hk', 'hong kong', 'hkma']
        
        # Check if any HK indicators are present in the variant
        variant_text = f"{hk_variant.title_template} {hk_variant.description_template}".lower()
        has_hk_context = any(indicator.lower() in variant_text for indicator in hk_indicators)
        
        assert has_hk_context, "Hong Kong context not properly applied"
    
    def test_ip_address_generation(self):
        """Test IP address generation with Hong Kong ranges."""
        for _ in range(10):
            ip = self.engine._generate_ip_address()
            
            # Validate IP format
            parts = ip.split('.')
            assert len(parts) == 4
            assert all(0 <= int(part) <= 255 for part in parts)
            
            # Should occasionally generate HK IP ranges
            # This is probabilistic, so we test the format is valid
    
    def test_hostname_generation(self):
        """Test hostname generation with HK banking context."""
        hostnames = [self.engine._generate_hostname() for _ in range(20)]
        
        # Should have variety
        assert len(set(hostnames)) > 15, "Hostnames should be diverse"
        
        # Should include HK prefixes
        hk_prefixes = ['HK-', 'HKBANK-', 'TRADING-', 'BRANCH-']
        has_hk_prefix = any(
            any(hostname.startswith(prefix) for prefix in hk_prefixes)
            for hostname in hostnames
        )
        assert has_hk_prefix, "Should generate some HK-prefixed hostnames"
    
    def test_variation_statistics(self):
        """Test variation engine statistics and configuration."""
        stats = self.engine.get_variation_stats()
        
        assert isinstance(stats, dict)
        assert stats['severity_levels'] >= 4  # Low, Medium, High, Critical
        assert stats['source_systems'] >= 5   # Multiple SIEM/EDR systems
        assert stats['hk_ip_ranges'] >= 3      # Multiple HK IP ranges
        assert stats['hostname_prefixes'] >= 4 # Multiple HK hostname patterns
    
    def test_batch_variation_generation(self):
        """Test generating multiple variations efficiently."""
        batch_size = 50
        variations = []
        
        for i in range(batch_size):
            is_fp = i < batch_size * 0.8  # 80% false positives
            variant = self.engine.apply_variations(self.sample_template, is_false_positive=is_fp)
            variations.append(variant)
        
        # Check diversity
        unique_titles = set(v.title_template for v in variations)
        unique_descriptions = set(v.description_template for v in variations)
        
        assert len(unique_titles) > batch_size * 0.7, "Titles should be diverse"
        assert len(unique_descriptions) > batch_size * 0.7, "Descriptions should be diverse"
        
        # Check false positive distribution
        fp_count = sum(1 for v in variations if v.is_false_positive)
        fp_rate = fp_count / batch_size
        assert 0.75 <= fp_rate <= 0.85, f"False positive rate should be ~80%, got {fp_rate}"


class TestDemoDataGenerator:
    """Test the core demo data generator with LLM integration."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mock_analyst = Mock()
        self.mock_events_client = Mock()
        
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_generator_initialization(self, mock_boto_client, mock_analyst_class):
        """Test generator initialization with dependencies."""
        mock_analyst_class.return_value = self.mock_analyst
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        assert generator.analyst is not None
        assert generator.variation_engine is not None
        assert len(generator.scenario_templates) > 0
        assert generator._active_sessions == {}
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_single_alert_generation_structure(self, mock_boto_client, mock_analyst_class):
        """Test single alert generation with proper structure."""
        # Mock analyst response
        mock_analyst_instance = Mock()
        mock_analyst_instance.summarize_investigation.return_value = {
            "summary": json.dumps({
                "title": "Suspicious Email Attachment Detected",
                "description": "Potential phishing email with malicious attachment detected",
                "entities": [
                    {"type": "email", "name": "suspicious@example.com"},
                    {"type": "file", "name": "invoice.pdf.exe"}
                ],
                "risk_indicators": ["suspicious_attachment", "external_sender"]
            })
        }
        mock_analyst_class.return_value = mock_analyst_instance
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Test high-risk alert generation
        alert = generator.generate_single_alert(
            scenario_type="phishing_email",
            risk_level="high"
        )
        
        assert isinstance(alert, DemoAlert)
        assert alert.alert_id.startswith("DEMO-")
        assert alert.investigation_id.startswith("INV-DEMO-")
        assert alert.scenario_type == "phishing_email"
        assert alert.risk_level == "high"
        assert alert.is_false_positive is False  # High risk should be genuine threat
        assert alert.confidence_score >= 0.7     # High confidence for genuine threats
        assert len(alert.entities) > 0
        assert len(alert.tactics) > 0
        assert alert.timestamp is not None
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_false_positive_alert_generation(self, mock_boto_client, mock_analyst_class):
        """Test false positive alert generation."""
        mock_analyst_instance = Mock()
        mock_analyst_instance.summarize_investigation.return_value = {
            "summary": json.dumps({
                "title": "Routine System Update Notification",
                "description": "Automated system update notification flagged by security rules",
                "entities": [{"type": "system", "name": "update-server.internal"}],
                "risk_indicators": ["automated_process", "internal_system"]
            })
        }
        mock_analyst_class.return_value = mock_analyst_instance
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Test low-risk (false positive) alert generation
        alert = generator.generate_single_alert(
            scenario_type="phishing_email",
            risk_level="low"
        )
        
        assert alert.is_false_positive is True
        assert alert.confidence_score <= 0.5  # Low confidence for false positives
        assert alert.risk_level == "low"
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_continuous_generation_session_management(self, mock_boto_client, mock_analyst_class):
        """Test continuous generation session lifecycle."""
        mock_analyst_class.return_value = self.mock_analyst
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Mock the generation loop to avoid actual threading
        with patch.object(generator, '_generation_loop') as mock_loop:
            session_id = generator.start_continuous_generation(
                scenario_types=["phishing_email", "malware_detection"],
                interval_seconds=30.0,
                false_positive_rate=0.8
            )
            
            assert session_id in generator._active_sessions
            session = generator._active_sessions[session_id]
            assert session.scenario_types == ["phishing_email", "malware_detection"]
            assert session.status == "active"
            
            # Test session status retrieval
            status = generator.get_session_status(session_id)
            assert status["session_id"] == session_id
            assert status["status"] == "active"
            assert status["scenario_types"] == ["phishing_email", "malware_detection"]
            
            # Test session stopping
            generator.stop_generation(session_id)
            assert generator._active_sessions[session_id].status == "stopped"
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_invalid_scenario_handling(self, mock_boto_client, mock_analyst_class):
        """Test handling of invalid scenario types."""
        mock_analyst_class.return_value = self.mock_analyst
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Test invalid scenario type
        with pytest.raises(ValueError, match="Invalid scenario types"):
            generator.start_continuous_generation(
                scenario_types=["invalid_scenario", "another_invalid"]
            )
        
        # Test empty scenario types
        with pytest.raises(ValueError, match="At least one scenario type required"):
            generator.start_continuous_generation(scenario_types=[])
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_eventbridge_integration(self, mock_boto_client, mock_analyst_class):
        """Test EventBridge integration for alert publishing."""
        mock_analyst_class.return_value = self.mock_analyst
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Create test alert
        alert = DemoAlert(
            alert_id="DEMO-TEST-123",
            investigation_id="INV-DEMO-TEST-123",
            tenant_id="test-tenant",
            source="sentinel",
            title="Test Alert",
            description="Test alert for EventBridge integration",
            severity="Medium",
            risk_level="medium",
            entities=[{"type": "test", "name": "test_entity"}],
            tactics=["InitialAccess"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="phishing_email",
            is_false_positive=False,
            confidence_score=0.7,
            raw_data={"test": True}
        )
        
        # Test sending to pipeline
        generator.send_alert_to_pipeline(alert)
        
        # Verify EventBridge call
        self.mock_events_client.put_events.assert_called_once()
        call_args = self.mock_events_client.put_events.call_args[1]
        
        assert "Entries" in call_args
        entry = call_args["Entries"][0]
        assert entry["Source"] == "asia.agentic.soc.demo"
        assert entry["DetailType"] == "DemoAlert"
        
        # Verify event detail structure
        detail = json.loads(entry["Detail"])
        assert detail["investigationId"] == alert.investigation_id
        assert detail["alert"]["isDemo"] is True
        assert detail["demoMetadata"]["scenarioType"] == "phishing_email"
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_llm_integration_error_handling(self, mock_boto_client, mock_analyst_class):
        """Test error handling for LLM integration failures."""
        # Mock analyst to raise exception
        mock_analyst_instance = Mock()
        mock_analyst_instance.summarize_investigation.side_effect = Exception("LLM service unavailable")
        mock_analyst_class.return_value = mock_analyst_instance
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Should handle LLM errors gracefully and use fallback content
        alert = generator.generate_single_alert(
            scenario_type="phishing_email",
            risk_level="medium"
        )
        
        assert isinstance(alert, DemoAlert)
        assert alert.title is not None
        assert alert.description is not None
        # Should use template-based fallback content
        assert "phishing" in alert.title.lower() or "email" in alert.title.lower()
    
    @patch('src.demo.generator.BedrockAnalyst')
    @patch('boto3.client')
    def test_generation_performance_metrics(self, mock_boto_client, mock_analyst_class):
        """Test generation performance and timing metrics."""
        mock_analyst_instance = Mock()
        mock_analyst_instance.summarize_investigation.return_value = {
            "summary": json.dumps({"title": "Test", "description": "Test", "entities": []})
        }
        mock_analyst_class.return_value = mock_analyst_instance
        mock_boto_client.return_value = self.mock_events_client
        
        generator = DemoDataGenerator()
        
        # Test batch generation performance
        start_time = datetime.now()
        alerts = []
        
        for i in range(10):
            alert = generator.generate_single_alert(
                scenario_type="phishing_email",
                risk_level="medium"
            )
            alerts.append(alert)
        
        end_time = datetime.now()
        generation_time = (end_time - start_time).total_seconds()
        
        # Should generate alerts reasonably quickly
        assert generation_time < 30.0, f"Generation took too long: {generation_time}s"
        assert len(alerts) == 10
        
        # Verify alert diversity
        unique_titles = set(alert.title for alert in alerts)
        assert len(unique_titles) >= 7, "Generated alerts should be diverse"


class TestDemoAlertStructure:
    """Test demo alert data structure and serialization."""
    
    def test_demo_alert_serialization(self):
        """Test demo alert serialization to JSON."""
        alert = DemoAlert(
            alert_id="DEMO-TEST-001",
            investigation_id="INV-DEMO-TEST-001",
            tenant_id="test-tenant",
            source="sentinel",
            title="Test Alert",
            description="Test alert description",
            severity="High",
            risk_level="high",
            entities=[{"type": "user", "name": "test@example.com"}],
            tactics=["InitialAccess", "Execution"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="phishing_email",
            is_false_positive=False,
            confidence_score=0.85,
            raw_data={"source_ip": "192.168.1.100"}
        )
        
        # Test serialization
        alert_dict = asdict(alert)
        json_str = json.dumps(alert_dict)
        
        # Test deserialization
        deserialized = json.loads(json_str)
        
        assert deserialized["alert_id"] == alert.alert_id
        assert deserialized["is_false_positive"] == alert.is_false_positive
        assert deserialized["confidence_score"] == alert.confidence_score
        assert len(deserialized["entities"]) == 1
        assert len(deserialized["tactics"]) == 2
    
    def test_demo_alert_validation(self):
        """Test demo alert field validation."""
        # Test valid alert
        valid_alert = DemoAlert(
            alert_id="DEMO-VALID-001",
            investigation_id="INV-DEMO-VALID-001",
            tenant_id="test-tenant",
            source="sentinel",
            title="Valid Alert",
            description="Valid alert description",
            severity="Medium",
            risk_level="medium",
            entities=[],
            tactics=["Discovery"],
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type="malware_detection",
            is_false_positive=True,
            confidence_score=0.3,
            raw_data={}
        )
        
        # Basic validation checks
        assert valid_alert.alert_id.startswith("DEMO-")
        assert valid_alert.investigation_id.startswith("INV-DEMO-")
        assert 0.0 <= valid_alert.confidence_score <= 1.0
        assert valid_alert.severity in ["Low", "Medium", "High", "Critical"]
        assert valid_alert.risk_level in ["low", "medium", "high"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])