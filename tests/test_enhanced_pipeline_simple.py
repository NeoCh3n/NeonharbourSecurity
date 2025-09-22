"""Simple tests for enhanced multi-agent pipeline functionality."""
from __future__ import annotations

import pytest
from unittest.mock import Mock

from src.agents.base import Agent, ConfidenceScore, EscalationDecision
from src.agents.analysis import AnalysisAgent
from src.agents.response import ResponseAgent


class TestEnhancedAgentFunctionality:
    """Test enhanced agent functionality without DynamoDB dependencies."""
    
    def test_confidence_score_calculation(self):
        """Test confidence score calculation with false positive indicators."""
        messaging_mock = Mock()
        
        class TestAgent(Agent):
            name = "test"
            stage = "test"
            
            def handle(self, event):
                return event
        
        agent = TestAgent(messaging_mock)
        
        # Test data with false positive indicators
        analysis_data = {
            "alert": {
                "severity": "low",
                "source_ip": "192.168.1.100",
                "repeat_count": 8
            },
            "confidence": 0.7
        }
        
        confidence_score = agent.calculate_confidence_score(analysis_data)
        
        assert isinstance(confidence_score, ConfidenceScore)
        assert 0.0 <= confidence_score.overall_confidence <= 1.0
        assert 0.0 <= confidence_score.false_positive_probability <= 1.0
        assert 0.0 <= confidence_score.automation_confidence <= 1.0
        assert confidence_score.reasoning is not None
        assert isinstance(confidence_score.factors, dict)
        
        # Low severity should increase FP probability
        assert "low_severity" in confidence_score.factors
        assert confidence_score.factors["low_severity"] > 0.5

    def test_analysis_agent_confidence_scoring(self):
        """Test enhanced confidence scoring in analysis agent."""
        messaging_mock = Mock()
        agent = AnalysisAgent(messaging_mock)

        # Test the confidence scoring method directly
        event = {
            "investigationId": "test-123",
            "tenantId": "test-tenant",
            "alert": {
                "severity": "low",
                "source_ip": "10.0.0.1",
                "description": "Administrative login",
                "repeat_count": 5
            },
            "context": {
                "user_info": {"role": "admin"},
                "network_info": {"internal": True}
            }
        }

        summary = {
            "summary": "Test alert analysis",
            "risk_level": "low",
            "confidence": 0.6,
            "provider": "bedrock"
        }

        # Test enhanced confidence scoring
        confidence_score = agent.calculate_enhanced_confidence_score(event, summary)

        # Verify confidence score structure
        assert isinstance(confidence_score, ConfidenceScore)
        assert 0.0 <= confidence_score.overall_confidence <= 1.0
        assert 0.0 <= confidence_score.false_positive_probability <= 1.0
        assert 0.0 <= confidence_score.automation_confidence <= 1.0
        assert confidence_score.reasoning is not None
        assert isinstance(confidence_score.factors, dict)

        # Verify false positive assessment
        fp_assessment = agent._assess_false_positive_likelihood(event, summary)
        assert "likelihood_score" in fp_assessment
        assert "detected_patterns" in fp_assessment
        assert "recommendation" in fp_assessment

        # Low severity should increase FP probability
        assert "low_severity" in confidence_score.factors
        assert confidence_score.factors["low_severity"] > 0.5

    def test_response_agent_escalation_decision(self):
        """Test escalation decision framework for 80%+ automation."""
        messaging_mock = Mock()
        agent = ResponseAgent(messaging_mock)

        # Test auto-close scenario (high FP probability)
        event = {
            "investigationId": "test-123",
            "tenantId": "test-tenant",
            "alert": {
                "severity": "low",
                "source_ip": "192.168.1.100",
                "description": "System backup process"
            }
        }

        summary = {
            "confidence_metrics": {
                "overall_confidence": 0.8,
                "false_positive_probability": 0.85,
                "automation_confidence": 0.7
            },
            "risk_level": "low"
        }

        # Test escalation decision making
        escalation_decision = agent._make_escalation_decision(event, summary)

        # Verify escalation decision
        assert isinstance(escalation_decision, EscalationDecision)
        assert escalation_decision.automation_action == "auto_close"
        assert not escalation_decision.should_escalate
        assert escalation_decision.reasoning is not None
        assert isinstance(escalation_decision.risk_factors, dict)

    def test_response_agent_escalation_scenario(self):
        """Test escalation scenario for genuine threats."""
        messaging_mock = Mock()
        agent = ResponseAgent(messaging_mock)

        # Test escalation scenario (low FP probability, high severity)
        event = {
            "investigationId": "test-456",
            "tenantId": "test-tenant",
            "alert": {
                "severity": "high",
                "source_ip": "203.0.113.1",  # External IP
                "description": "Malware detected on endpoint"
            }
        }

        summary = {
            "confidence_metrics": {
                "overall_confidence": 0.9,
                "false_positive_probability": 0.15,
                "automation_confidence": 0.8
            },
            "risk_level": "high"
        }

        # Test escalation decision making
        escalation_decision = agent._make_escalation_decision(event, summary)

        # Verify escalation decision
        assert isinstance(escalation_decision, EscalationDecision)
        assert escalation_decision.automation_action == "escalate"
        assert escalation_decision.should_escalate
        assert "malware" in escalation_decision.reasoning.lower() or "external" in escalation_decision.reasoning.lower()

    def test_false_positive_indicators(self):
        """Test false positive indicator detection."""
        messaging_mock = Mock()
        agent = AnalysisAgent(messaging_mock)

        # Test various false positive scenarios
        test_cases = [
            {
                "alert": {"severity": "low", "source_ip": "10.0.0.1", "description": "admin login"},
                "expected_patterns": ["administrative_activity"]
            },
            {
                "alert": {"severity": "info", "source_ip": "192.168.1.1", "process_name": "backup_service.exe"},
                "expected_patterns": ["system_process"]
            },
            {
                "alert": {"severity": "medium", "source_ip": "172.16.0.1", "repeat_count": 15},
                "expected_high_fp": True
            }
        ]

        for case in test_cases:
            event = {"alert": case["alert"], "context": {}}
            summary = {"confidence_metrics": {"false_positive_probability": 0.5}}
            
            fp_assessment = agent._assess_false_positive_likelihood(event, summary)
            
            if "expected_patterns" in case:
                for pattern in case["expected_patterns"]:
                    assert pattern in fp_assessment["detected_patterns"]
            
            if case.get("expected_high_fp"):
                # Should have high false positive indicators
                confidence_score = agent.calculate_enhanced_confidence_score(event, {"confidence": 0.5})
                assert confidence_score.false_positive_probability >= 0.6

    def test_automation_thresholds(self):
        """Test automation threshold logic."""
        messaging_mock = Mock()
        agent = ResponseAgent(messaging_mock)

        # Test threshold constants
        assert agent.AUTOMATION_THRESHOLDS["automation_target"] == 0.8  # 80% target
        assert agent.AUTOMATION_THRESHOLDS["false_positive_threshold"] == 0.7
        assert agent.AUTOMATION_THRESHOLDS["confidence_threshold"] == 0.6

        # Test threshold application
        high_fp_event = {
            "alert": {"severity": "low", "source_ip": "10.0.0.1"},
            "summary": {
                "confidence_metrics": {
                    "false_positive_probability": 0.9,
                    "overall_confidence": 0.8,
                    "automation_confidence": 0.8
                }
            }
        }

        decision = agent._make_escalation_decision(high_fp_event["alert"], high_fp_event["summary"])
        assert decision.automation_action == "auto_close"

        # Test low confidence scenario
        low_confidence_event = {
            "alert": {"severity": "medium", "source_ip": "10.0.0.1"},
            "summary": {
                "confidence_metrics": {
                    "false_positive_probability": 0.4,
                    "overall_confidence": 0.3,  # Below threshold
                    "automation_confidence": 0.3
                }
            }
        }

        decision = agent._make_escalation_decision(low_confidence_event["alert"], low_confidence_event["summary"])
        assert decision.automation_action == "monitor"

    def test_risk_assessment_adjustment(self):
        """Test risk level adjustment based on automation decisions."""
        messaging_mock = Mock()
        agent = ResponseAgent(messaging_mock)

        # Test risk adjustment for auto-close
        event = {"alert": {"severity": "high"}}
        summary = {"risk_level": "high"}
        escalation_decision = EscalationDecision(
            should_escalate=False,
            automation_action="auto_close",
            confidence_threshold_met=True,
            reasoning="High FP probability",
            risk_factors={}
        )

        risk_assessment = agent._enhanced_risk_assessment(event, summary, escalation_decision)
        
        assert risk_assessment["level"] == "low"  # Adjusted down due to auto-close
        assert risk_assessment["original_level"] == "high"
        assert risk_assessment["automation_adjusted"] == True
        assert risk_assessment["automation_action"] == "auto_close"

    def test_enhanced_metrics_computation(self):
        """Test enhanced metrics including automation statistics."""
        messaging_mock = Mock()
        agent = ResponseAgent(messaging_mock)

        event = {"receivedAt": "2024-01-15T10:00:00Z"}
        escalation_decision = EscalationDecision(
            should_escalate=False,
            automation_action="auto_close",
            confidence_threshold_met=True,
            reasoning="Test",
            risk_factors={}
        )

        metrics = agent._compute_enhanced_metrics(event, escalation_decision)

        # Verify automation metrics are included
        assert "automation_rate" in metrics
        assert "escalation_rate" in metrics
        assert "monitoring_rate" in metrics
        assert "confidence_threshold_met" in metrics

        # Verify values for auto-close scenario
        assert metrics["automation_rate"] == 1.0
        assert metrics["escalation_rate"] == 0.0
        assert metrics["confidence_threshold_met"] == 1.0