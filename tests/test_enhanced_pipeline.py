"""Tests for enhanced multi-agent pipeline with false positive detection and automation."""
from __future__ import annotations

import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from src.agents.base import Agent, ConfidenceScore, EscalationDecision
from src.agents.analysis import AnalysisAgent
from src.agents.response import ResponseAgent
from src.agents.automation_metrics import AutomationMetricsTracker


class TestEnhancedAgentBase:
    """Test enhanced base agent functionality."""
    
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


class TestEnhancedAnalysisAgent:
    """Test enhanced analysis agent with confidence scoring."""
    
    @patch('src.agents.analysis.boto3')
    @patch('src.agents.analysis.log_stage_event')
    def test_enhanced_confidence_scoring(self, mock_log, mock_boto3):
        """Test enhanced confidence scoring in analysis agent."""
        # Mock DynamoDB
        mock_table = Mock()
        mock_table.update_item.return_value = {}
        mock_boto3.resource.return_value.Table.return_value = mock_table
        
        messaging_mock = Mock()
        agent = AnalysisAgent(messaging_mock)
        
        # Mock AI analyst
        with patch.object(agent, '_select_analyst') as mock_select:
            mock_analyst = Mock()
            mock_analyst.summarize_investigation.return_value = {
                "summary": "Test alert analysis",
                "risk_level": "low",
                "confidence": 0.6,
                "provider": "bedrock"
            }
            mock_select.return_value = mock_analyst
            
            # Mock knowledge loading
            with patch.object(agent, '_load_knowledge_summary', return_value={}):
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
                
                result = agent.handle(event)
                
                # Verify enhanced confidence metrics are included
                assert "summary" in result
                summary = result["summary"]
                assert "confidence_metrics" in summary
                
                confidence_metrics = summary["confidence_metrics"]
                assert "overall_confidence" in confidence_metrics
                assert "false_positive_probability" in confidence_metrics
                assert "automation_confidence" in confidence_metrics
                assert "reasoning" in confidence_metrics
                assert "factors" in confidence_metrics
                
                # Verify false positive assessment
                assert "false_positive_assessment" in summary
                fp_assessment = summary["false_positive_assessment"]
                assert "likelihood_score" in fp_assessment
                assert "detected_patterns" in fp_assessment
                assert "recommendation" in fp_assessment


class TestEnhancedResponseAgent:
    """Test enhanced response agent with automation decisions."""
    
    @patch('src.agents.response.boto3')
    @patch('src.agents.response.log_stage_event')
    @patch('src.agents.response.automation_tracker')
    def test_escalation_decision_framework(self, mock_tracker, mock_log, mock_boto3):
        """Test escalation decision framework for 80%+ automation."""
        # Mock DynamoDB
        mock_table = Mock()
        mock_table.update_item.return_value = {}
        mock_table.put_item.return_value = {}
        mock_boto3.resource.return_value.Table.return_value = mock_table
        
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
            },
            "summary": {
                "confidence_metrics": {
                    "overall_confidence": 0.8,
                    "false_positive_probability": 0.85,
                    "automation_confidence": 0.7
                },
                "risk_level": "low"
            }
        }
        
        result = agent.handle(event)
        
        # Verify escalation decision
        assert "escalation" in result
        escalation = result["escalation"]
        assert escalation["decision"] == "auto_close"
        assert not escalation["should_escalate"]
        assert "reasoning" in escalation
        
        # Verify automation metrics were recorded
        mock_tracker.record_automation_decision.assert_called_once()
        
    @patch('src.agents.response.boto3')
    @patch('src.agents.response.log_stage_event')
    @patch('src.agents.response.automation_tracker')
    def test_escalation_scenario(self, mock_tracker, mock_log, mock_boto3):
        """Test escalation scenario for genuine threats."""
        # Mock DynamoDB
        mock_table = Mock()
        mock_table.update_item.return_value = {}
        mock_table.put_item.return_value = {}
        mock_boto3.resource.return_value.Table.return_value = mock_table
        
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
            },
            "summary": {
                "confidence_metrics": {
                    "overall_confidence": 0.9,
                    "false_positive_probability": 0.15,
                    "automation_confidence": 0.8
                },
                "risk_level": "high"
            }
        }
        
        result = agent.handle(event)
        
        # Verify escalation decision
        assert "escalation" in result
        escalation = result["escalation"]
        assert escalation["decision"] == "escalate"
        assert escalation["should_escalate"]
        
        # Verify risk assessment
        assert "risk" in result
        risk = result["risk"]
        assert risk["level"] == "high"
        assert risk["automation_action"] == "escalate"


class TestAutomationMetricsTracker:
    """Test automation metrics tracking functionality."""
    
    @patch('src.agents.automation_metrics.boto3')
    def test_record_automation_decision(self, mock_boto3):
        """Test recording automation decisions."""
        # Mock DynamoDB
        mock_table = Mock()
        mock_table.put_item.return_value = {}
        mock_table.update_item.return_value = {}
        mock_boto3.resource.return_value.Table.return_value = mock_table
        
        tracker = AutomationMetricsTracker()
        
        # Record an automation decision
        tracker.record_automation_decision(
            tenant_id="test-tenant",
            investigation_id="test-123",
            automation_action="auto_close",
            confidence_score=0.8,
            false_positive_probability=0.9,
            escalated=False
        )
        
        # Verify metrics were recorded
        assert mock_table.put_item.called
        call_args = mock_table.put_item.call_args[1]
        item = call_args["Item"]
        
        assert item["metric_name"] == "automation_decision_auto_close"
        assert float(item["value"]) == 1.0
        assert "metadata" in item
        
        metadata = item["metadata"]
        assert metadata["investigation_id"] == "test-123"
        assert metadata["tenant_id"] == "test-tenant"
        assert float(metadata["confidence_score"]) == 0.8
        assert float(metadata["false_positive_probability"]) == 0.9
        assert not metadata["escalated"]
    
    @patch('src.agents.automation_metrics.boto3')
    def test_automation_rate_calculation(self, mock_boto3):
        """Test automation rate calculation."""
        # Mock DynamoDB query responses
        mock_table = Mock()
        mock_boto3.resource.return_value.Table.return_value = mock_table
        
        # Mock daily metrics
        mock_table.query.return_value = {
            "Items": [
                {"metric_name": "total_investigations", "value": 100},
                {"metric_name": "auto_closed_count", "value": 85},
                {"metric_name": "escalated_count", "value": 10},
                {"metric_name": "monitored_count", "value": 5},
                {"metric_name": "human_escalation_count", "value": 15}
            ]
        }
        
        tracker = AutomationMetricsTracker()
        
        # Get automation rate
        automation_rate = tracker.get_automation_rate(days=1)
        
        assert automation_rate["total_investigations"] == 100
        assert automation_rate["automation_rate"] == 0.9  # (85 + 5) / 100
        assert automation_rate["auto_close_rate"] == 0.85
        assert automation_rate["escalation_rate"] == 0.10
        assert automation_rate["target_met"]  # 90% > 80% target


class TestIntegrationScenarios:
    """Test integration scenarios for the enhanced pipeline."""
    
    @patch('src.agents.analysis.boto3')
    @patch('src.agents.response.boto3')
    @patch('src.agents.analysis.log_stage_event')
    @patch('src.agents.response.log_stage_event')
    @patch('src.agents.response.automation_tracker')
    def test_end_to_end_false_positive_detection(self, mock_tracker, mock_response_log, 
                                                mock_analysis_log, mock_response_boto3, 
                                                mock_analysis_boto3):
        """Test end-to-end false positive detection and automation."""
        # Mock DynamoDB for both agents
        mock_table = Mock()
        mock_table.update_item.return_value = {}
        mock_table.put_item.return_value = {}
        mock_analysis_boto3.resource.return_value.Table.return_value = mock_table
        mock_response_boto3.resource.return_value.Table.return_value = mock_table
        
        messaging_mock = Mock()
        
        # Create agents
        analysis_agent = AnalysisAgent(messaging_mock)
        response_agent = ResponseAgent(messaging_mock)
        
        # Mock AI analyst for analysis agent
        with patch.object(analysis_agent, '_select_analyst') as mock_select:
            mock_analyst = Mock()
            mock_analyst.summarize_investigation.return_value = {
                "summary": "Routine system maintenance alert",
                "risk_level": "low",
                "confidence": 0.7,
                "false_positive_likelihood": 0.85,
                "automation_recommendation": "auto_close",
                "provider": "bedrock"
            }
            mock_select.return_value = mock_analyst
            
            # Mock knowledge loading
            with patch.object(analysis_agent, '_load_knowledge_summary', return_value={}):
                # Test event representing a likely false positive
                event = {
                    "investigationId": "test-fp-123",
                    "tenantId": "test-tenant",
                    "alert": {
                        "severity": "low",
                        "source_ip": "10.0.0.50",
                        "description": "Automated backup process started",
                        "repeat_count": 12,
                        "timestamp": "2024-01-15T14:30:00Z"  # Business hours
                    },
                    "context": {
                        "user_info": {"role": "system"},
                        "system_info": {"process": "backup_service.exe"}
                    }
                }
                
                # Process through analysis agent
                analysis_result = analysis_agent.handle(event)
                
                # Verify analysis results
                assert "confidence_metrics" in analysis_result["summary"]
                confidence_metrics = analysis_result["summary"]["confidence_metrics"]
                assert confidence_metrics["false_positive_probability"] > 0.7  # High FP probability
                
                # Process through response agent
                response_result = response_agent.handle(analysis_result)
                
                # Verify automation decision
                assert response_result["escalation"]["decision"] == "auto_close"
                assert not response_result["escalation"]["should_escalate"]
                assert response_result["risk"]["level"] == "low"
                
                # Verify metrics were recorded
                mock_tracker.record_automation_decision.assert_called_once()
                call_args = mock_tracker.record_automation_decision.call_args[1]
                assert call_args["automation_action"] == "auto_close"
                assert not call_args["escalated"]