"""Tests for Security Hub connector and cross-account access management."""
import json
import pytest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

from src.connectors.securityhub import SecurityHubClient
from src.connectors.cross_account_validator import CrossAccountValidator
from src.connectors.secure_ingestion_pipeline import (
    SecureIngestionPipeline, 
    IngestionConfig, 
    IngestionStatus
)


class TestSecurityHubClient:
    """Test cases for Security Hub connector."""
    
    @pytest.fixture
    def mock_boto3_session(self):
        """Mock boto3 session for testing."""
        with patch('src.connectors.securityhub.boto3.Session') as mock_session:
            mock_client = Mock()
            mock_session.return_value.client.return_value = mock_client
            yield mock_session, mock_client
    
    @pytest.fixture
    def security_hub_client(self, mock_boto3_session):
        """Create Security Hub client for testing."""
        mock_session, mock_client = mock_boto3_session
        
        # Mock successful hub description
        mock_client.describe_hub.return_value = {
            "HubArn": "arn:aws:securityhub:us-east-1:123456789012:hub/default"
        }
        
        return SecurityHubClient(
            region="us-east-1",
            aws_access_key_id="test_key",
            aws_secret_access_key="test_secret"
        )
    
    @pytest.fixture
    def sample_security_hub_findings(self):
        """Sample Security Hub findings for testing."""
        return {
            "Findings": [
                {
                    "Id": "arn:aws:securityhub:us-east-1:123456789012:finding/test-finding-1",
                    "ProductArn": "arn:aws:securityhub:us-east-1::product/aws/securityhub",
                    "GeneratorId": "aws-foundational-security-standard/v/1.0.0/EC2.1",
                    "AwsAccountId": "123456789012",
                    "Region": "us-east-1",
                    "Partition": "aws",
                    "CreatedAt": "2024-01-15T10:30:00.000Z",
                    "UpdatedAt": "2024-01-15T14:45:00.000Z",
                    "Severity": {
                        "Label": "HIGH",
                        "Normalized": 70,
                        "Original": "HIGH"
                    },
                    "Confidence": 85,
                    "Title": "Test Security Finding",
                    "Description": "Test finding for unit tests",
                    "Types": ["Effects/Data Exposure/AWS EC2 Instance"],
                    "Compliance": {
                        "Status": "FAILED",
                        "RelatedRequirements": ["PCI DSS 1.2.1"]
                    },
                    "Resources": [
                        {
                            "Id": "arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0",
                            "Type": "AwsEc2Instance",
                            "Region": "us-east-1"
                        }
                    ]
                }
            ]
        }
    
    def test_initialization_with_credentials(self, mock_boto3_session):
        """Test Security Hub client initialization with credentials."""
        mock_session, mock_client = mock_boto3_session
        mock_client.describe_hub.return_value = {"HubArn": "test-arn"}
        
        client = SecurityHubClient(
            region="us-west-2",
            aws_access_key_id="test_key",
            aws_secret_access_key="test_secret"
        )
        
        assert client.region == "us-west-2"
        mock_session.assert_called_once()
        mock_client.describe_hub.assert_called_once()
    
    def test_initialization_with_cross_account_role(self, mock_boto3_session):
        """Test Security Hub client initialization with cross-account role."""
        mock_session, mock_client = mock_boto3_session
        
        # Mock STS assume role
        mock_sts_client = Mock()
        mock_sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "assumed_key",
                "SecretAccessKey": "assumed_secret",
                "SessionToken": "assumed_token"
            }
        }
        mock_session.return_value.client.side_effect = lambda service: {
            "sts": mock_sts_client,
            "securityhub": mock_client
        }[service]
        
        mock_client.describe_hub.return_value = {"HubArn": "test-arn"}
        
        client = SecurityHubClient(
            cross_account_role_arn="arn:aws:iam::123456789012:role/TestRole"
        )
        
        mock_sts_client.assume_role.assert_called_once()
        mock_client.describe_hub.assert_called_once()
    
    def test_fetch_recent_findings_success(self, security_hub_client, sample_security_hub_findings):
        """Test successful fetching of recent findings."""
        security_hub_client._client.get_findings.return_value = sample_security_hub_findings
        
        findings = security_hub_client.fetch_recent_findings(limit=10, hours_back=24)
        
        assert len(findings) == 1
        assert findings[0]["source_type"] == "securityhub"
        assert findings[0]["id"] == "arn:aws:securityhub:us-east-1:123456789012:finding/test-finding-1"
        assert findings[0]["severity"]["label"] == "HIGH"
        assert findings[0]["risk_score"] > 0
        
        security_hub_client._client.get_findings.assert_called_once()
    
    def test_fetch_critical_findings(self, security_hub_client, sample_security_hub_findings):
        """Test fetching critical severity findings."""
        security_hub_client._client.get_findings.return_value = sample_security_hub_findings
        
        findings = security_hub_client.fetch_critical_findings(limit=20)
        
        assert len(findings) == 1
        security_hub_client._client.get_findings.assert_called_once()
        
        # Verify severity filter was applied
        call_args = security_hub_client._client.get_findings.call_args
        filters = call_args[1]["Filters"]
        assert "SeverityLabel" in filters
    
    def test_fetch_compliance_findings(self, security_hub_client, sample_security_hub_findings):
        """Test fetching compliance-related findings."""
        security_hub_client._client.get_findings.return_value = sample_security_hub_findings
        
        findings = security_hub_client.fetch_compliance_findings(
            standards=["aws-foundational-security-standard"],
            limit=30
        )
        
        assert len(findings) == 1
        security_hub_client._client.get_findings.assert_called_once()
        
        # Verify compliance status filter was applied
        call_args = security_hub_client._client.get_findings.call_args
        filters = call_args[1]["Filters"]
        assert "ComplianceStatus" in filters
    
    def test_api_error_fallback_to_fixture(self, security_hub_client):
        """Test fallback to fixture data when API fails."""
        from botocore.exceptions import ClientError
        
        # Mock API error
        error_response = {"Error": {"Code": "AccessDenied", "Message": "Access denied"}}
        security_hub_client._client.get_findings.side_effect = ClientError(
            error_response, "GetFindings"
        )
        
        # Mock fixture loading
        with patch.object(security_hub_client, '_load_fixture') as mock_load_fixture:
            mock_load_fixture.return_value = [{"id": "fixture-finding"}]
            
            findings = security_hub_client.fetch_recent_findings(limit=10)
            
            assert len(findings) == 1
            assert findings[0]["id"] == "fixture-finding"
            mock_load_fixture.assert_called_once_with("securityhub_findings.json")
    
    def test_transform_finding(self, security_hub_client, sample_security_hub_findings):
        """Test finding transformation to standardized format."""
        raw_finding = sample_security_hub_findings["Findings"][0]
        transformed = security_hub_client._transform_finding(raw_finding)
        
        # Verify required fields
        assert transformed["source_type"] == "securityhub"
        assert transformed["id"] == raw_finding["Id"]
        assert transformed["severity"]["label"] == "HIGH"
        assert transformed["compliance"]["status"] == "FAILED"
        assert len(transformed["resources"]) == 1
        
        # Verify calculated fields
        assert 0.0 <= transformed["risk_score"] <= 1.0
        assert transformed["threat_category"] in ["unknown", "misconfiguration", "vulnerability"]
        assert transformed["remediation_priority"] in ["low", "medium", "high", "critical"]
    
    def test_risk_score_calculation(self, security_hub_client):
        """Test risk score calculation logic."""
        # High severity, high confidence finding
        high_risk_finding = {
            "Severity": {"Normalized": 90, "Label": "CRITICAL"},
            "Confidence": 95,
            "Criticality": 85,
            "Compliance": {"Status": "FAILED"},
            "Types": ["TTPs/Defense Evasion/Malware"]
        }
        
        risk_score = security_hub_client._calculate_risk_score(high_risk_finding)
        assert risk_score > 0.8  # Should be high risk
        
        # Low severity, low confidence finding
        low_risk_finding = {
            "Severity": {"Normalized": 20, "Label": "LOW"},
            "Confidence": 30,
            "Criticality": 25,
            "Compliance": {"Status": "PASSED"},
            "Types": ["Software and Configuration Checks"]
        }
        
        risk_score = security_hub_client._calculate_risk_score(low_risk_finding)
        assert risk_score < 0.4  # Should be low risk
    
    def test_threat_categorization(self, security_hub_client):
        """Test threat categorization logic."""
        test_cases = [
            (["TTPs/Defense Evasion/Malware"], "malware"),
            (["TTPs/Persistence/Backdoor"], "backdoor"),
            (["Effects/Data Destruction"], "unknown"),
            (["Software and Configuration Checks/Vulnerabilities/CVE"], "vulnerability"),
            (["Sensitive Data Identifications/PII"], "policy_violation")
        ]
        
        for finding_types, expected_category in test_cases:
            finding = {"Types": finding_types}
            category = security_hub_client._categorize_threat(finding)
            assert category == expected_category
    
    def test_compliance_frameworks_extraction(self, security_hub_client):
        """Test extraction of compliance frameworks from findings."""
        finding = {
            "Compliance": {
                "RelatedRequirements": [
                    "PCI DSS 1.2.1",
                    "NIST.800-53.r5 AC-4",
                    "CIS AWS Foundations Benchmark 2.1"
                ]
            },
            "GeneratorId": "aws-foundational-security-standard/v/1.0.0/EC2.1"
        }
        
        frameworks = security_hub_client._extract_compliance_frameworks(finding)
        
        assert "PCI-DSS" in frameworks
        assert "NIST" in frameworks
        assert "CIS" in frameworks
        assert "AWS-Foundational" in frameworks


class TestCrossAccountValidator:
    """Test cases for cross-account access validation."""
    
    @pytest.fixture
    def validator(self):
        """Create cross-account validator for testing."""
        with patch('src.connectors.cross_account_validator.boto3.Session'):
            return CrossAccountValidator(region="us-east-1")
    
    @pytest.fixture
    def mock_sts_client(self, validator):
        """Mock STS client for testing."""
        mock_client = Mock()
        validator._sts_client = mock_client
        return mock_client
    
    def test_validate_security_hub_access_success(self, validator, mock_sts_client):
        """Test successful Security Hub access validation."""
        # Mock successful role assumption
        mock_sts_client.assume_role.return_value = {
            "Credentials": {
                "AccessKeyId": "test_key",
                "SecretAccessKey": "test_secret",
                "SessionToken": "test_token"
            }
        }
        
        # Mock Security Hub client
        with patch('src.connectors.cross_account_validator.boto3.Session') as mock_session:
            mock_securityhub_client = Mock()
            mock_securityhub_client.describe_hub.return_value = {
                "HubArn": "arn:aws:securityhub:us-east-1:123456789012:hub/default"
            }
            mock_securityhub_client.get_findings.return_value = {"Findings": []}
            
            mock_session.return_value.client.return_value = mock_securityhub_client
            
            result = validator.validate_security_hub_access(
                customer_account_id="123456789012",
                role_arn="arn:aws:iam::123456789012:role/TestRole",
                external_id="test-external-id"
            )
            
            assert result["valid"] is True
            assert result["customer_account_id"] == "123456789012"
            assert len(result["errors"]) == 0
            assert len(result["test_results"]) == 2  # describe_hub and get_findings tests
    
    def test_validate_access_role_assumption_failure(self, validator, mock_sts_client):
        """Test validation when role assumption fails."""
        from botocore.exceptions import ClientError
        
        # Mock role assumption failure
        error_response = {"Error": {"Code": "AccessDenied", "Message": "Cannot assume role"}}
        mock_sts_client.assume_role.side_effect = ClientError(error_response, "AssumeRole")
        
        result = validator.validate_security_hub_access(
            customer_account_id="123456789012",
            role_arn="arn:aws:iam::123456789012:role/TestRole"
        )
        
        assert result["valid"] is False
        assert len(result["errors"]) > 0
        assert "Cannot assume role" in result["errors"][0]
    
    def test_generate_security_hub_setup_guide(self, validator):
        """Test generation of Security Hub setup guide."""
        guide = validator.generate_security_hub_setup_guide("123456789012")
        
        assert guide["service"] == "Security Hub"
        assert guide["customer_account_id"] == "123456789012"
        assert guide["role_name"] == "NeoHarbourSecurityHubAccess"
        assert "trust_policy" in guide
        assert "permissions_policy" in guide
        assert len(guide["setup_steps"]) > 0
        assert len(guide["cli_commands"]) > 0
        
        # Verify trust policy structure
        trust_policy = guide["trust_policy"]
        assert trust_policy["Version"] == "2012-10-17"
        assert len(trust_policy["Statement"]) == 1
        
        # Verify permissions policy
        permissions_policy = guide["permissions_policy"]
        assert "securityhub:DescribeHub" in permissions_policy["Statement"][0]["Action"]
    
    def test_generate_multi_service_setup_guide(self, validator):
        """Test generation of multi-service setup guide."""
        guide = validator.generate_multi_service_setup_guide("123456789012")
        
        assert len(guide["services"]) == 4  # Security Hub, GuardDuty, CloudTrail, VPC Flow Logs
        assert guide["role_name"] == "NeoHarbourSecurityServicesAccess"
        
        # Verify permissions include all services
        permissions = guide["permissions_policy"]["Statement"][0]["Action"]
        assert any("securityhub:" in perm for perm in permissions)
        assert any("guardduty:" in perm for perm in permissions)
        assert any("cloudtrail:" in perm for perm in permissions)
        assert any("ec2:" in perm for perm in permissions)  # For VPC Flow Logs


class TestSecureIngestionPipeline:
    """Test cases for secure data ingestion pipeline."""
    
    @pytest.fixture
    def pipeline(self):
        """Create ingestion pipeline for testing."""
        return SecureIngestionPipeline()
    
    @pytest.fixture
    def ingestion_config(self):
        """Create ingestion configuration for testing."""
        return IngestionConfig(
            source_type="securityhub",
            customer_account_id="123456789012",
            role_arn="arn:aws:iam::123456789012:role/TestRole",
            external_id="test-external-id",
            batch_size=10,
            max_retries=2
        )
    
    @pytest.mark.asyncio
    async def test_ingest_security_hub_findings_success(self, pipeline, ingestion_config):
        """Test successful Security Hub findings ingestion."""
        # Mock the client creation and batch processing
        with patch.object(pipeline, '_create_secure_client') as mock_create_client:
            mock_client = Mock()
            mock_client.fetch_recent_findings.return_value = [
                {"id": "finding-1", "title": "Test Finding 1"},
                {"id": "finding-2", "title": "Test Finding 2"}
            ]
            mock_create_client.return_value = mock_client
            
            with patch.object(pipeline, '_process_security_finding') as mock_process:
                mock_process.return_value = {"processed": True}
                
                result = await pipeline.ingest_security_hub_findings(ingestion_config)
                
                assert result.status == IngestionStatus.SUCCESS
                assert result.records_processed == 2
                assert result.records_successful == 2
                assert result.records_failed == 0
                assert len(result.errors) == 0
    
    @pytest.mark.asyncio
    async def test_ingest_with_retry_logic(self, pipeline, ingestion_config):
        """Test ingestion with retry logic on failures."""
        from botocore.exceptions import ClientError
        
        with patch.object(pipeline, '_create_secure_client') as mock_create_client:
            mock_client = Mock()
            
            # First call fails, second succeeds
            error_response = {"Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}}
            mock_client.fetch_recent_findings.side_effect = [
                ClientError(error_response, "GetFindings"),
                [{"id": "finding-1", "title": "Test Finding"}]
            ]
            mock_create_client.return_value = mock_client
            
            with patch.object(pipeline, '_process_security_finding') as mock_process:
                mock_process.return_value = {"processed": True}
                
                result = await pipeline.ingest_security_hub_findings(ingestion_config)
                
                assert result.status == IngestionStatus.SUCCESS
                assert result.retry_attempts == 1
                assert len(result.errors) == 1  # One error from first attempt
    
    @pytest.mark.asyncio
    async def test_ingest_max_retries_exceeded(self, pipeline, ingestion_config):
        """Test ingestion failure when max retries exceeded."""
        from botocore.exceptions import ClientError
        
        with patch.object(pipeline, '_create_secure_client') as mock_create_client:
            mock_client = Mock()
            
            # All calls fail
            error_response = {"Error": {"Code": "AccessDenied", "Message": "Access denied"}}
            mock_client.fetch_recent_findings.side_effect = ClientError(error_response, "GetFindings")
            mock_create_client.return_value = mock_client
            
            result = await pipeline.ingest_security_hub_findings(ingestion_config)
            
            assert result.status == IngestionStatus.FAILED
            assert result.retry_attempts > ingestion_config.max_retries
            assert len(result.errors) > 0
    
    def test_get_ingestion_metrics(self, pipeline):
        """Test ingestion metrics collection."""
        # Add some mock active ingestions
        from src.connectors.secure_ingestion_pipeline import IngestionResult
        
        result1 = IngestionResult(
            config=Mock(),
            status=IngestionStatus.RUNNING,
            start_time=datetime.utcnow()
        )
        result2 = IngestionResult(
            config=Mock(),
            status=IngestionStatus.SUCCESS,
            start_time=datetime.utcnow()
        )
        
        pipeline._active_ingestions = {
            "ingestion-1": result1,
            "ingestion-2": result2
        }
        
        metrics = pipeline.get_ingestion_metrics()
        
        assert metrics["active_ingestions"] == 2
        assert metrics["status_breakdown"]["running"] == 1
        assert metrics["status_breakdown"]["success"] == 1
        assert "timestamp" in metrics


if __name__ == "__main__":
    pytest.main([__file__])