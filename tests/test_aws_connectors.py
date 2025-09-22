"""Tests for AWS data source connectors."""
import pytest
from pathlib import Path

from src.connectors.cloudtrail import CloudTrailClient
from src.connectors.vpcflow import VPCFlowLogsClient
from src.connectors.guardduty import GuardDutyClient


class TestCloudTrailClient:
    """Test CloudTrail connector functionality."""
    
    def test_fetch_recent_events_fixture_mode(self):
        """Test fetching CloudTrail events in fixture mode."""
        client = CloudTrailClient(fixture_dir=Path("tools/seed"))
        events = client.fetch_recent_events(limit=5)
        
        assert isinstance(events, list)
        assert len(events) <= 5
        
        if events:
            event = events[0]
            assert "id" in event
            assert "timestamp" in event
            assert "event_name" in event
            assert "source_type" in event
            assert event["source_type"] == "cloudtrail"
            assert "severity" in event
            assert "risk_score" in event
    
    def test_fetch_security_events(self):
        """Test fetching security-relevant events."""
        client = CloudTrailClient(fixture_dir=Path("tools/seed"))
        events = client.fetch_security_events(limit=3)
        
        assert isinstance(events, list)
        assert len(events) <= 3
    
    def test_fetch_failed_logins(self):
        """Test fetching failed login attempts."""
        client = CloudTrailClient(fixture_dir=Path("tools/seed"))
        events = client.fetch_failed_logins(limit=2)
        
        assert isinstance(events, list)
        assert len(events) <= 2
    
    def test_severity_calculation(self):
        """Test severity calculation logic."""
        client = CloudTrailClient()
        
        # Test high severity event
        high_severity_event = {"EventName": "DeleteUser", "ErrorCode": None}
        severity = client._calculate_severity(high_severity_event)
        assert severity == "high"
        
        # Test medium severity event
        medium_severity_event = {"EventName": "ConsoleLogin", "ErrorCode": None}
        severity = client._calculate_severity(medium_severity_event)
        assert severity == "medium"
        
        # Test low severity event
        low_severity_event = {"EventName": "DescribeInstances", "ErrorCode": None}
        severity = client._calculate_severity(low_severity_event)
        assert severity == "low"
    
    def test_risk_score_calculation(self):
        """Test risk score calculation."""
        client = CloudTrailClient()
        
        event = {
            "EventName": "DeleteUser",
            "ErrorCode": "AccessDenied",
            "SourceIPAddress": "203.0.113.12",
            "ReadOnly": False
        }
        
        risk_score = client._calculate_risk_score(event)
        assert 0.0 <= risk_score <= 1.0
        assert risk_score > 0.5  # Should be high risk


class TestVPCFlowLogsClient:
    """Test VPC Flow Logs connector functionality."""
    
    def test_fetch_recent_flow_logs_fixture_mode(self):
        """Test fetching VPC Flow Logs in fixture mode."""
        client = VPCFlowLogsClient(fixture_dir=Path("tools/seed"))
        logs = client.fetch_recent_flow_logs(limit=5)
        
        assert isinstance(logs, list)
        assert len(logs) <= 5
        
        if logs:
            log = logs[0]
            assert "srcaddr" in log
            assert "dstaddr" in log
            assert "srcport" in log
            assert "dstport" in log
            assert "protocol" in log
            assert "action" in log
            assert "source_type" in log
            assert log["source_type"] == "vpc_flow_logs"
            assert "severity" in log
            assert "risk_score" in log
    
    def test_fetch_suspicious_traffic(self):
        """Test fetching suspicious traffic patterns."""
        client = VPCFlowLogsClient(fixture_dir=Path("tools/seed"))
        logs = client.fetch_suspicious_traffic(limit=3)
        
        assert isinstance(logs, list)
        assert len(logs) <= 3
    
    def test_fetch_rejected_connections(self):
        """Test fetching rejected connections."""
        client = VPCFlowLogsClient(fixture_dir=Path("tools/seed"))
        logs = client.fetch_rejected_connections(limit=2)
        
        assert isinstance(logs, list)
        assert len(logs) <= 2
    
    def test_protocol_name_conversion(self):
        """Test protocol number to name conversion."""
        client = VPCFlowLogsClient()
        
        assert client._get_protocol_name(6) == "TCP"
        assert client._get_protocol_name(17) == "UDP"
        assert client._get_protocol_name(1) == "ICMP"
        assert client._get_protocol_name(999) == "Protocol-999"
    
    def test_suspicious_traffic_detection(self):
        """Test suspicious traffic detection logic."""
        client = VPCFlowLogsClient()
        
        # Test rejected connection (suspicious)
        rejected_log = {"action": "REJECT", "packets": 10, "bytes": 640, "dstport": 80}
        assert client._is_suspicious_traffic(rejected_log) is True
        
        # Test normal traffic (not suspicious)
        normal_log = {"action": "ACCEPT", "packets": 10, "bytes": 1500, "dstport": 80}
        assert client._is_suspicious_traffic(normal_log) is False
        
        # Test potential scanning (suspicious)
        scan_log = {"action": "ACCEPT", "packets": 200, "bytes": 6400, "dstport": 80}
        assert client._is_suspicious_traffic(scan_log) is True


class TestGuardDutyClient:
    """Test GuardDuty connector functionality."""
    
    def test_fetch_recent_findings_fixture_mode(self):
        """Test fetching GuardDuty findings in fixture mode."""
        client = GuardDutyClient(fixture_dir=Path("tools/seed"))
        findings = client.fetch_recent_findings(limit=5)
        
        assert isinstance(findings, list)
        assert len(findings) <= 5
        
        if findings:
            finding = findings[0]
            assert "id" in finding
            assert "type" in finding
            assert "severity" in finding
            assert "confidence" in finding
            assert "source_type" in finding
            assert finding["source_type"] == "guardduty"
            assert "risk_score" in finding
            assert "threat_category" in finding
    
    def test_fetch_high_severity_findings(self):
        """Test fetching high severity findings."""
        client = GuardDutyClient(fixture_dir=Path("tools/seed"))
        findings = client.fetch_high_severity_findings(limit=3)
        
        assert isinstance(findings, list)
        assert len(findings) <= 3
    
    def test_fetch_malware_findings(self):
        """Test fetching malware-related findings."""
        client = GuardDutyClient(fixture_dir=Path("tools/seed"))
        findings = client.fetch_malware_findings(limit=2)
        
        assert isinstance(findings, list)
        assert len(findings) <= 2
    
    def test_severity_conversion(self):
        """Test severity score to string conversion."""
        client = GuardDutyClient()
        
        assert client._score_to_severity(8.5) == "HIGH"
        assert client._score_to_severity(5.0) == "MEDIUM"
        assert client._score_to_severity(2.0) == "LOW"
    
    def test_threat_categorization(self):
        """Test threat categorization based on finding type."""
        client = GuardDutyClient()
        
        assert client._categorize_threat("Malware:EC2/SuspiciousFile") == "malware"
        assert client._categorize_threat("CryptoCurrency:EC2/BitcoinTool.B") == "cryptocurrency_mining"
        assert client._categorize_threat("Recon:EC2/PortProbeUnprotectedPort") == "reconnaissance"
        assert client._categorize_threat("Backdoor:EC2/C&CActivity.B") == "backdoor"
        assert client._categorize_threat("UnknownThreat") == "unknown"
    
    def test_risk_score_calculation(self):
        """Test risk score calculation."""
        client = GuardDutyClient()
        
        # High severity malware finding
        high_risk_finding = {
            "Severity": 8.5,
            "Confidence": 9.0,
            "Type": "Malware:EC2/SuspiciousFile",
            "Resource": {"ResourceType": "Instance"}
        }
        
        risk_score = client._calculate_risk_score(high_risk_finding)
        assert 0.0 <= risk_score <= 1.0
        assert risk_score > 0.7  # Should be high risk
        
        # Low severity reconnaissance finding
        low_risk_finding = {
            "Severity": 2.0,
            "Confidence": 5.0,
            "Type": "Recon:EC2/PortProbeUnprotectedPort",
            "Resource": {"ResourceType": "Instance"}
        }
        
        risk_score = client._calculate_risk_score(low_risk_finding)
        assert 0.0 <= risk_score <= 1.0
        assert risk_score < 0.5  # Should be lower risk
    
    def test_remediation_priority_calculation(self):
        """Test remediation priority calculation."""
        client = GuardDutyClient()
        
        # Critical priority finding
        critical_finding = {
            "Severity": 8.5,
            "Confidence": 9.0,
            "Type": "Malware:EC2/SuspiciousFile"
        }
        priority = client._calculate_remediation_priority(critical_finding)
        assert priority == "critical"
        
        # High priority finding
        high_finding = {
            "Severity": 7.5,
            "Confidence": 6.0,
            "Type": "Recon:EC2/PortProbeUnprotectedPort"
        }
        priority = client._calculate_remediation_priority(high_finding)
        assert priority == "high"
        
        # Low priority finding
        low_finding = {
            "Severity": 2.0,
            "Confidence": 4.0,
            "Type": "Policy:IAMUser/RootCredentialUsage"
        }
        priority = client._calculate_remediation_priority(low_finding)
        assert priority == "low"


class TestConnectorIntegration:
    """Test integration between connectors."""
    
    def test_all_connectors_return_consistent_format(self):
        """Test that all connectors return data in consistent format."""
        cloudtrail_client = CloudTrailClient(fixture_dir=Path("tools/seed"))
        vpcflow_client = VPCFlowLogsClient(fixture_dir=Path("tools/seed"))
        guardduty_client = GuardDutyClient(fixture_dir=Path("tools/seed"))
        
        # Fetch data from all connectors
        cloudtrail_events = cloudtrail_client.fetch_recent_events(limit=1)
        vpcflow_logs = vpcflow_client.fetch_recent_flow_logs(limit=1)
        guardduty_findings = guardduty_client.fetch_recent_findings(limit=1)
        
        # Check that all have required fields for investigation pipeline
        for data_source, data in [
            ("cloudtrail", cloudtrail_events),
            ("vpcflow", vpcflow_logs),
            ("guardduty", guardduty_findings)
        ]:
            if data:
                item = data[0]
                assert "source_type" in item, f"{data_source} missing source_type"
                assert "severity" in item, f"{data_source} missing severity"
                assert "risk_score" in item, f"{data_source} missing risk_score"
                assert isinstance(item["risk_score"], (int, float)), f"{data_source} risk_score not numeric"
                assert 0.0 <= item["risk_score"] <= 1.0, f"{data_source} risk_score out of range"
    
    def test_connector_cleanup(self):
        """Test that connectors clean up resources properly."""
        clients = [
            CloudTrailClient(fixture_dir=Path("tools/seed")),
            VPCFlowLogsClient(fixture_dir=Path("tools/seed")),
            GuardDutyClient(fixture_dir=Path("tools/seed"))
        ]
        
        # Test that close() method exists and doesn't raise exceptions
        for client in clients:
            assert hasattr(client, "close")
            client.close()  # Should not raise any exceptions