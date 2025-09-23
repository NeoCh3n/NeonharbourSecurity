"""AWS Security Hub connector for aggregated security alert ingestion."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .utils import RateLimiter


class SecurityHubClient:
    """Connector for AWS Security Hub aggregated security findings."""
    
    def __init__(
        self,
        *,
        region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None,
        cross_account_role_arn: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.cross_account_role_arn = cross_account_role_arn or os.getenv("SECURITY_HUB_CROSS_ACCOUNT_ROLE_ARN")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._limiter = rate_limiter or RateLimiter(capacity=10, refill_rate_per_sec=2)
        
        # Initialize boto3 client with cross-account role support
        session_kwargs = {}
        if aws_access_key_id:
            session_kwargs["aws_access_key_id"] = aws_access_key_id
        if aws_secret_access_key:
            session_kwargs["aws_secret_access_key"] = aws_secret_access_key
        if aws_session_token:
            session_kwargs["aws_session_token"] = aws_session_token
        if self.region:
            session_kwargs["region_name"] = self.region
            
        try:
            self._session = boto3.Session(**session_kwargs)
            
            # Use cross-account role if specified
            if self.cross_account_role_arn:
                self._client = self._assume_cross_account_role()
            else:
                self._client = self._session.client("securityhub")
                
            # Validate Security Hub is enabled
            self._validate_security_hub_enabled()
            
        except Exception as e:
            print(f"Security Hub initialization failed: {e}")
            # Fall back to fixture mode if AWS credentials are not available
            self._client = None

    def _assume_cross_account_role(self) -> Any:
        """Assume cross-account role for Security Hub access."""
        try:
            sts_client = self._session.client("sts")
            
            # Generate unique session name
            session_name = f"SecurityHub-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
            
            response = sts_client.assume_role(
                RoleArn=self.cross_account_role_arn,
                RoleSessionName=session_name,
                DurationSeconds=3600  # 1 hour
            )
            
            credentials = response["Credentials"]
            
            # Create new session with assumed role credentials
            assumed_session = boto3.Session(
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"],
                region_name=self.region
            )
            
            return assumed_session.client("securityhub")
            
        except (BotoCoreError, ClientError) as e:
            print(f"Failed to assume cross-account role: {e}")
            raise

    def _validate_security_hub_enabled(self) -> None:
        """Validate that Security Hub is enabled in the target account."""
        try:
            if self._client:
                # Try to get hub details to verify Security Hub is enabled
                self._client.describe_hub()
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "InvalidAccessException":
                raise RuntimeError(
                    "Security Hub is not enabled in this account/region. "
                    "Please enable Security Hub before using this connector."
                )
            elif error_code == "AccessDeniedException":
                raise RuntimeError(
                    "Insufficient permissions to access Security Hub. "
                    "Please ensure the IAM role has the required Security Hub permissions."
                )
            else:
                raise

    def validate_cross_account_access(self, account_id: str, role_arn: str) -> Dict[str, Any]:
        """Validate cross-account IAM role access for Security Hub."""
        validation_result = {
            "valid": False,
            "account_id": account_id,
            "role_arn": role_arn,
            "errors": [],
            "warnings": [],
            "required_permissions": self._get_required_permissions()
        }
        
        try:
            # Test STS assume role
            sts_client = self._session.client("sts")
            session_name = f"ValidationTest-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
            
            response = sts_client.assume_role(
                RoleArn=role_arn,
                RoleSessionName=session_name,
                DurationSeconds=900  # 15 minutes for validation
            )
            
            credentials = response["Credentials"]
            
            # Create test session with assumed role
            test_session = boto3.Session(
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"],
                region_name=self.region
            )
            
            test_client = test_session.client("securityhub")
            
            # Test Security Hub access
            try:
                test_client.describe_hub()
                validation_result["valid"] = True
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code == "InvalidAccessException":
                    validation_result["errors"].append(
                        "Security Hub is not enabled in the target account"
                    )
                elif error_code == "AccessDeniedException":
                    validation_result["errors"].append(
                        "Insufficient Security Hub permissions for the assumed role"
                    )
                else:
                    validation_result["errors"].append(f"Security Hub access error: {e}")
            
            # Test findings access
            try:
                test_client.get_findings(MaxResults=1)
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code", "")
                if error_code == "AccessDeniedException":
                    validation_result["warnings"].append(
                        "Limited findings access - some findings may not be retrievable"
                    )
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "AccessDenied":
                validation_result["errors"].append(
                    "Cannot assume the specified role - check trust relationship"
                )
            else:
                validation_result["errors"].append(f"Role assumption failed: {e}")
        except Exception as e:
            validation_result["errors"].append(f"Validation failed: {e}")
        
        return validation_result

    def _get_required_permissions(self) -> List[str]:
        """Get list of required IAM permissions for Security Hub access."""
        return [
            "securityhub:DescribeHub",
            "securityhub:GetFindings",
            "securityhub:GetInsights",
            "securityhub:GetInsightResults",
            "securityhub:ListEnabledProductsForImport",
            "securityhub:DescribeStandards",
            "securityhub:GetEnabledStandards"
        ]

    def generate_cross_account_setup_guide(self, customer_account_id: str) -> Dict[str, Any]:
        """Generate setup guide for cross-account Security Hub access."""
        neoharbour_account_id = os.getenv("NEOHARBOUR_ACCOUNT_ID", "123456789012")
        
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": f"arn:aws:iam::{neoharbour_account_id}:root"
                    },
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {
                            "sts:ExternalId": f"neoharbour-{customer_account_id}"
                        }
                    }
                }
            ]
        }
        
        permissions_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": self._get_required_permissions(),
                    "Resource": "*"
                }
            ]
        }
        
        return {
            "customer_account_id": customer_account_id,
            "neoharbour_account_id": neoharbour_account_id,
            "role_name": "NeoHarbourSecurityHubAccess",
            "external_id": f"neoharbour-{customer_account_id}",
            "trust_policy": trust_policy,
            "permissions_policy": permissions_policy,
            "setup_steps": [
                "1. Enable AWS Security Hub in your account if not already enabled",
                "2. Create IAM role 'NeoHarbourSecurityHubAccess' with the provided trust policy",
                "3. Attach the provided permissions policy to the role",
                "4. Provide the role ARN to NeoHarbour for configuration",
                "5. Test the connection using the validation endpoint"
            ],
            "role_arn": f"arn:aws:iam::{customer_account_id}:role/NeoHarbourSecurityHubAccess"
        }

    def fetch_recent_findings(
        self, 
        limit: int = 50,
        hours_back: int = 24,
        severity_filter: Optional[List[str]] = None,
        compliance_status_filter: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch recent Security Hub findings for investigation."""
        self._limiter.acquire()
        
        if not self._client:
            return self._load_fixture("securityhub_findings.json")[:limit]
        
        try:
            # Build filters
            filters = {
                "UpdatedAt": [
                    {
                        "Start": datetime.utcnow() - timedelta(hours=hours_back),
                        "End": datetime.utcnow()
                    }
                ]
            }
            
            # Add severity filter
            if severity_filter:
                filters["SeverityLabel"] = [{"Value": sev, "Comparison": "EQUALS"} for sev in severity_filter]
            
            # Add compliance status filter
            if compliance_status_filter:
                filters["ComplianceStatus"] = [{"Value": status, "Comparison": "EQUALS"} for status in compliance_status_filter]
            
            # Get findings
            response = self._client.get_findings(
                Filters=filters,
                MaxResults=limit
            )
            
            # Transform findings to standardized format
            findings = []
            for finding in response.get("Findings", []):
                transformed_finding = self._transform_finding(finding)
                findings.append(transformed_finding)
            
            return findings
            
        except (BotoCoreError, ClientError) as e:
            print(f"Security Hub API error: {e}")
            return self._load_fixture("securityhub_findings.json")[:limit]

    def fetch_critical_findings(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch critical and high severity Security Hub findings."""
        return self.fetch_recent_findings(
            limit=limit,
            severity_filter=["CRITICAL", "HIGH"]
        )

    def fetch_compliance_findings(
        self, 
        standards: Optional[List[str]] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Fetch compliance-related Security Hub findings."""
        self._limiter.acquire()
        
        if not self._client:
            return self._load_fixture("securityhub_findings.json")[:limit]
        
        try:
            filters = {
                "ComplianceStatus": [
                    {"Value": "FAILED", "Comparison": "EQUALS"}
                ]
            }
            
            # Filter by specific standards if provided
            if standards:
                filters["GeneratorId"] = []
                for standard in standards:
                    filters["GeneratorId"].append({"Value": standard, "Comparison": "PREFIX"})
            
            response = self._client.get_findings(
                Filters=filters,
                MaxResults=limit
            )
            
            findings = []
            for finding in response.get("Findings", []):
                transformed_finding = self._transform_finding(finding)
                findings.append(transformed_finding)
            
            return findings
            
        except (BotoCoreError, ClientError) as e:
            print(f"Security Hub API error: {e}")
            return self._load_fixture("securityhub_findings.json")[:limit]

    def fetch_findings_by_product(
        self, 
        product_arns: List[str], 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Fetch Security Hub findings from specific security products."""
        self._limiter.acquire()
        
        if not self._client:
            return self._load_fixture("securityhub_findings.json")[:limit]
        
        try:
            filters = {
                "ProductArn": [{"Value": arn, "Comparison": "EQUALS"} for arn in product_arns]
            }
            
            response = self._client.get_findings(
                Filters=filters,
                MaxResults=limit
            )
            
            findings = []
            for finding in response.get("Findings", []):
                transformed_finding = self._transform_finding(finding)
                findings.append(transformed_finding)
            
            return findings
            
        except (BotoCoreError, ClientError) as e:
            print(f"Security Hub API error: {e}")
            return self._load_fixture("securityhub_findings.json")[:limit]

    def _transform_finding(self, finding: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Security Hub finding to standardized format for investigation pipeline."""
        return {
            "id": finding.get("Id", ""),
            "product_arn": finding.get("ProductArn", ""),
            "generator_id": finding.get("GeneratorId", ""),
            "aws_account_id": finding.get("AwsAccountId", ""),
            "region": finding.get("Region", ""),
            "partition": finding.get("Partition", ""),
            "created_at": finding.get("CreatedAt", ""),
            "updated_at": finding.get("UpdatedAt", ""),
            "first_observed_at": finding.get("FirstObservedAt", ""),
            "last_observed_at": finding.get("LastObservedAt", ""),
            
            # Severity and confidence
            "severity": {
                "label": finding.get("Severity", {}).get("Label", "INFORMATIONAL"),
                "normalized": finding.get("Severity", {}).get("Normalized", 0),
                "original": finding.get("Severity", {}).get("Original", "")
            },
            "confidence": finding.get("Confidence", 0),
            "criticality": finding.get("Criticality", 0),
            
            # Finding details
            "title": finding.get("Title", ""),
            "description": finding.get("Description", ""),
            "types": finding.get("Types", []),
            "source_url": finding.get("SourceUrl", ""),
            
            # Compliance information
            "compliance": {
                "status": finding.get("Compliance", {}).get("Status", ""),
                "related_requirements": finding.get("Compliance", {}).get("RelatedRequirements", []),
                "status_reasons": finding.get("Compliance", {}).get("StatusReasons", [])
            },
            
            # Remediation information
            "remediation": {
                "recommendation": finding.get("Remediation", {}).get("Recommendation", {}),
            },
            
            # Workflow state
            "workflow_state": finding.get("WorkflowState", "NEW"),
            "workflow_status": finding.get("Workflow", {}).get("Status", "NEW"),
            
            # Record state
            "record_state": finding.get("RecordState", "ACTIVE"),
            
            # Resources affected
            "resources": [
                {
                    "id": resource.get("Id", ""),
                    "type": resource.get("Type", ""),
                    "partition": resource.get("Partition", ""),
                    "region": resource.get("Region", ""),
                    "tags": resource.get("Tags", {}),
                    "details": resource.get("Details", {})
                }
                for resource in finding.get("Resources", [])
            ],
            
            # Network information
            "network": finding.get("Network", {}),
            
            # Process information  
            "process": finding.get("Process", {}),
            
            # Threat intel indicators
            "threat_intel_indicators": finding.get("ThreatIntelIndicators", []),
            
            # Malware information
            "malware": finding.get("Malware", []),
            
            # User-defined fields
            "user_defined_fields": finding.get("UserDefinedFields", {}),
            
            # Add metadata for investigation pipeline
            "source_type": "securityhub",
            "risk_score": self._calculate_risk_score(finding),
            "threat_category": self._categorize_threat(finding),
            "remediation_priority": self._calculate_remediation_priority(finding),
            "compliance_frameworks": self._extract_compliance_frameworks(finding)
        }

    def _categorize_threat(self, finding: Dict[str, Any]) -> str:
        """Categorize threat based on Security Hub finding types."""
        finding_types = finding.get("Types", [])
        
        # Check for specific threat patterns
        for finding_type in finding_types:
            if "Malware" in finding_type:
                return "malware"
            elif "Backdoor" in finding_type:
                return "backdoor"
            elif "Trojan" in finding_type:
                return "trojan"
            elif "Botnet" in finding_type:
                return "botnet"
            elif "Cryptocurrency" in finding_type or "Mining" in finding_type:
                return "cryptocurrency_mining"
            elif "Reconnaissance" in finding_type or "Scanning" in finding_type:
                return "reconnaissance"
            elif "Brute" in finding_type or "Dictionary" in finding_type:
                return "brute_force"
            elif "Injection" in finding_type:
                return "injection_attack"
            elif "Privilege" in finding_type and "Escalation" in finding_type:
                return "privilege_escalation"
            elif "Data" in finding_type and ("Exfiltration" in finding_type or "Theft" in finding_type):
                return "data_exfiltration"
            elif "Unauthorized" in finding_type:
                return "unauthorized_access"
            elif "Vulnerabilities" in finding_type or "CVE" in finding_type:
                return "vulnerability"
            elif "Policy" in finding_type or "Compliance" in finding_type:
                return "policy_violation"
            elif "Configuration" in finding_type:
                return "misconfiguration"
            elif "Sensitive Data" in finding_type:
                return "policy_violation"
        
        return "unknown"

    def _calculate_risk_score(self, finding: Dict[str, Any]) -> float:
        """Calculate risk score (0.0-1.0) based on Security Hub finding characteristics."""
        # Base score from Security Hub normalized severity (0-100 scale)
        severity_normalized = finding.get("Severity", {}).get("Normalized", 0)
        base_score = severity_normalized / 100.0
        
        # Confidence factor (0-100 scale)
        confidence = finding.get("Confidence", 0) / 100.0
        
        # Criticality factor (0-100 scale)
        criticality = finding.get("Criticality", 0) / 100.0
        
        # Combine factors with weights
        combined_score = (base_score * 0.5) + (confidence * 0.3) + (criticality * 0.2)
        
        # Adjust based on compliance status
        compliance_status = finding.get("Compliance", {}).get("Status", "")
        if compliance_status == "FAILED":
            combined_score = min(combined_score + 0.1, 1.0)
        
        # Adjust based on workflow state
        workflow_state = finding.get("WorkflowState", "NEW")
        if workflow_state == "NEW":
            combined_score = min(combined_score + 0.05, 1.0)
        
        # Adjust based on threat category
        threat_category = self._categorize_threat(finding)
        high_risk_categories = ["malware", "backdoor", "trojan", "data_exfiltration"]
        if threat_category in high_risk_categories:
            combined_score = min(combined_score + 0.15, 1.0)
        
        return combined_score

    def _calculate_remediation_priority(self, finding: Dict[str, Any]) -> str:
        """Calculate remediation priority based on finding characteristics."""
        severity_label = finding.get("Severity", {}).get("Label", "INFORMATIONAL")
        compliance_status = finding.get("Compliance", {}).get("Status", "")
        threat_category = self._categorize_threat(finding)
        
        # Critical priority for critical severity with compliance failures
        if severity_label == "CRITICAL" and compliance_status == "FAILED":
            return "critical"
        
        # Critical priority for high-risk malware
        if (severity_label in ["CRITICAL", "HIGH"] and 
            threat_category in ["malware", "backdoor", "trojan"]):
            return "critical"
        
        # High priority for high severity findings
        if severity_label in ["CRITICAL", "HIGH"]:
            return "high"
        
        # High priority for compliance failures
        if compliance_status == "FAILED":
            return "high"
        
        # Medium priority for medium severity
        if severity_label == "MEDIUM":
            return "medium"
        
        # Low priority for everything else
        return "low"

    def _extract_compliance_frameworks(self, finding: Dict[str, Any]) -> List[str]:
        """Extract compliance frameworks from finding."""
        frameworks = []
        
        # Extract from compliance related requirements
        related_requirements = finding.get("Compliance", {}).get("RelatedRequirements", [])
        for requirement in related_requirements:
            if "PCI" in requirement:
                frameworks.append("PCI-DSS")
            elif "SOC" in requirement:
                frameworks.append("SOC")
            elif "ISO" in requirement:
                frameworks.append("ISO-27001")
            elif "NIST" in requirement:
                frameworks.append("NIST")
            elif "CIS" in requirement:
                frameworks.append("CIS")
            elif "AWS" in requirement and "Foundational" in requirement:
                frameworks.append("AWS-Foundational")
        
        # Extract from generator ID patterns
        generator_id = finding.get("GeneratorId", "")
        if "aws-foundational-security-standard" in generator_id:
            frameworks.append("AWS-Foundational")
        elif "cis-aws-foundations-benchmark" in generator_id:
            frameworks.append("CIS")
        elif "pci-dss" in generator_id:
            frameworks.append("PCI-DSS")
        
        return list(set(frameworks))  # Remove duplicates

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        """Load fixture data when AWS API is not available."""
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            
            if isinstance(data, dict) and "Findings" in data:
                return [self._transform_finding(finding) for finding in data["Findings"]]
            elif isinstance(data, list):
                return data
            else:
                return [data]
        except (json.JSONDecodeError, KeyError):
            return []

    def close(self) -> None:
        """Clean up resources."""
        # boto3 clients don't need explicit cleanup
        pass