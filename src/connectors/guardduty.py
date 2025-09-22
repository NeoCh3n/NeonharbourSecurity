"""AWS GuardDuty connector for threat detection findings processing."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .utils import RateLimiter


class GuardDutyClient:
    """Connector for AWS GuardDuty threat detection findings."""
    
    def __init__(
        self,
        *,
        region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None,
        detector_id: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.detector_id = detector_id or os.getenv("GUARDDUTY_DETECTOR_ID")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._limiter = rate_limiter or RateLimiter(capacity=10, refill_rate_per_sec=2)
        
        # Initialize boto3 client
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
            self._client = self._session.client("guardduty")
            # Auto-discover detector ID if not provided
            if not self.detector_id:
                self._discover_detector_id()
        except Exception:
            # Fall back to fixture mode if AWS credentials are not available
            self._client = None

    def _discover_detector_id(self) -> None:
        """Auto-discover GuardDuty detector ID."""
        try:
            if self._client:
                response = self._client.list_detectors()
                detector_ids = response.get("DetectorIds", [])
                if detector_ids:
                    self.detector_id = detector_ids[0]  # Use first detector
        except (BotoCoreError, ClientError):
            pass  # Will fall back to fixture mode

    def fetch_recent_findings(
        self, 
        limit: int = 50,
        hours_back: int = 24,
        severity_filter: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch recent GuardDuty findings for threat analysis."""
        self._limiter.acquire()
        
        if not self._client or not self.detector_id:
            return self._load_fixture("guardduty_findings.json")[:limit]
        
        try:
            # Build finding criteria
            finding_criteria = {
                "Criterion": {
                    "updatedAt": {
                        "Gte": int((datetime.utcnow() - timedelta(hours=hours_back)).timestamp() * 1000)
                    }
                }
            }
            
            # Add severity filter if specified
            if severity_filter:
                finding_criteria["Criterion"]["severity"] = {
                    "Gte": self._severity_to_score(min(severity_filter)),
                    "Lte": self._severity_to_score(max(severity_filter))
                }
            
            # Get finding IDs
            response = self._client.list_findings(
                DetectorId=self.detector_id,
                FindingCriteria=finding_criteria,
                MaxResults=limit
            )
            
            finding_ids = response.get("FindingIds", [])
            if not finding_ids:
                return []
            
            # Get detailed findings
            findings_response = self._client.get_findings(
                DetectorId=self.detector_id,
                FindingIds=finding_ids
            )
            
            # Transform findings to standardized format
            findings = []
            for finding in findings_response.get("Findings", []):
                transformed_finding = self._transform_finding(finding)
                findings.append(transformed_finding)
            
            return findings
            
        except (BotoCoreError, ClientError) as e:
            print(f"GuardDuty API error: {e}")
            return self._load_fixture("guardduty_findings.json")[:limit]

    def fetch_high_severity_findings(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch high and critical severity GuardDuty findings."""
        return self.fetch_recent_findings(
            limit=limit,
            severity_filter=["HIGH", "CRITICAL"]
        )

    def fetch_findings_by_type(
        self, 
        finding_types: List[str], 
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Fetch GuardDuty findings filtered by specific threat types."""
        self._limiter.acquire()
        
        if not self._client or not self.detector_id:
            return self._load_fixture("guardduty_findings.json")[:limit]
        
        try:
            finding_criteria = {
                "Criterion": {
                    "type": {
                        "Eq": finding_types
                    }
                }
            }
            
            response = self._client.list_findings(
                DetectorId=self.detector_id,
                FindingCriteria=finding_criteria,
                MaxResults=limit
            )
            
            finding_ids = response.get("FindingIds", [])
            if not finding_ids:
                return []
            
            findings_response = self._client.get_findings(
                DetectorId=self.detector_id,
                FindingIds=finding_ids
            )
            
            findings = []
            for finding in findings_response.get("Findings", []):
                transformed_finding = self._transform_finding(finding)
                findings.append(transformed_finding)
            
            return findings
            
        except (BotoCoreError, ClientError) as e:
            print(f"GuardDuty API error: {e}")
            return self._load_fixture("guardduty_findings.json")[:limit]

    def fetch_malware_findings(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch malware-related GuardDuty findings."""
        malware_types = [
            "Malware:EC2/SuspiciousFile",
            "Malware:ECS/SuspiciousFile",
            "Malware:EKS/SuspiciousFile",
            "Malware:Lambda/SuspiciousFile"
        ]
        return self.fetch_findings_by_type(malware_types, limit)

    def fetch_cryptocurrency_findings(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch cryptocurrency mining related findings."""
        crypto_types = [
            "CryptoCurrency:EC2/BitcoinTool.B!DNS",
            "CryptoCurrency:EC2/BitcoinTool.B",
            "Trojan:EC2/BitcoinTool.B!DNS",
            "Trojan:EC2/BitcoinTool.B"
        ]
        return self.fetch_findings_by_type(crypto_types, limit)

    def fetch_reconnaissance_findings(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch reconnaissance and scanning related findings."""
        recon_types = [
            "Recon:EC2/PortProbeUnprotectedPort",
            "Recon:EC2/Portscan",
            "Recon:IAMUser/NetworkPermissions",
            "Recon:IAMUser/ResourcePermissions"
        ]
        return self.fetch_findings_by_type(recon_types, limit)

    def _transform_finding(self, finding: Dict[str, Any]) -> Dict[str, Any]:
        """Transform GuardDuty finding to standardized format for investigation pipeline."""
        service_info = finding.get("Service", {})
        resource_info = finding.get("Resource", {})
        
        return {
            "id": finding.get("Id", ""),
            "arn": finding.get("Arn", ""),
            "type": finding.get("Type", ""),
            "region": finding.get("Region", ""),
            "partition": finding.get("Partition", ""),
            "account_id": finding.get("AccountId", ""),
            "created_at": finding.get("CreatedAt", ""),
            "updated_at": finding.get("UpdatedAt", ""),
            "severity": self._score_to_severity(finding.get("Severity", 0)),
            "severity_score": finding.get("Severity", 0),
            "confidence": finding.get("Confidence", 0),
            "title": finding.get("Title", ""),
            "description": finding.get("Description", ""),
            
            # Service information
            "service": {
                "action": service_info.get("Action", {}),
                "evidence": service_info.get("Evidence", {}),
                "archived": service_info.get("Archived", False),
                "count": service_info.get("Count", 0),
                "detector_id": service_info.get("DetectorId", ""),
                "event_first_seen": service_info.get("EventFirstSeen", ""),
                "event_last_seen": service_info.get("EventLastSeen", ""),
                "resource_role": service_info.get("ResourceRole", ""),
                "service_name": service_info.get("ServiceName", ""),
                "user_feedback": service_info.get("UserFeedback", "")
            },
            
            # Resource information
            "resource": {
                "access_key_details": resource_info.get("AccessKeyDetails", {}),
                "s3_bucket_details": resource_info.get("S3BucketDetails", []),
                "instance_details": resource_info.get("InstanceDetails", {}),
                "eks_cluster_details": resource_info.get("EksClusterDetails", {}),
                "kubernetes_details": resource_info.get("KubernetesDetails", {}),
                "resource_type": resource_info.get("ResourceType", ""),
                "tags": resource_info.get("Tags", {})
            },
            
            # Schema version and metadata
            "schema_version": finding.get("SchemaVersion", ""),
            
            # Add metadata for investigation pipeline
            "source_type": "guardduty",
            "risk_score": self._calculate_risk_score(finding),
            "threat_category": self._categorize_threat(finding.get("Type", "")),
            "remediation_priority": self._calculate_remediation_priority(finding)
        }

    def _severity_to_score(self, severity: str) -> float:
        """Convert severity string to GuardDuty score."""
        severity_map = {
            "LOW": 1.0,
            "MEDIUM": 4.0,
            "HIGH": 7.0,
            "CRITICAL": 8.5
        }
        return severity_map.get(severity.upper(), 1.0)

    def _score_to_severity(self, score: float) -> str:
        """Convert GuardDuty severity score to string."""
        if score >= 7.0:
            return "HIGH"
        elif score >= 4.0:
            return "MEDIUM"
        else:
            return "LOW"

    def _categorize_threat(self, finding_type: str) -> str:
        """Categorize threat based on GuardDuty finding type."""
        if "Malware" in finding_type:
            return "malware"
        elif "CryptoCurrency" in finding_type or "BitcoinTool" in finding_type:
            return "cryptocurrency_mining"
        elif "Recon" in finding_type or "Portscan" in finding_type:
            return "reconnaissance"
        elif "Backdoor" in finding_type:
            return "backdoor"
        elif "Trojan" in finding_type:
            return "trojan"
        elif "Stealth" in finding_type:
            return "stealth_attack"
        elif "UnauthorizedAPI" in finding_type:
            return "unauthorized_api"
        elif "Persistence" in finding_type:
            return "persistence"
        elif "Policy" in finding_type:
            return "policy_violation"
        elif "Exfiltration" in finding_type:
            return "data_exfiltration"
        else:
            return "unknown"

    def _calculate_risk_score(self, finding: Dict[str, Any]) -> float:
        """Calculate risk score (0.0-1.0) based on GuardDuty finding characteristics."""
        # Base score from GuardDuty severity (0-10 scale) - balanced for realistic distribution
        severity_score = finding.get("Severity", 0) / 12.0  # Adjusted to allow higher scores
        
        # Confidence factor (0-10 scale) 
        confidence = finding.get("Confidence", 0) / 12.0  # Adjusted to allow higher scores
        
        # Combine severity and confidence 
        base_score = (severity_score * 0.7) + (confidence * 0.3)  # Balanced weights
        
        # Adjust based on threat type - more significant for truly dangerous threats
        finding_type = finding.get("Type", "")
        if any(threat in finding_type for threat in ["Malware", "Backdoor", "Trojan"]):
            base_score = min(base_score + 0.2, 1.0)  # Restored higher bonus for malware
        elif "CryptoCurrency" in finding_type:
            base_score = min(base_score + 0.1, 1.0)  # Moderate bonus for crypto mining
        
        # Adjust based on resource type
        resource_type = finding.get("Resource", {}).get("ResourceType", "")
        if resource_type in ["Instance", "EKSCluster"]:
            base_score = min(base_score + 0.1, 1.0)  # Bonus for critical resources
        
        return base_score

    def _calculate_remediation_priority(self, finding: Dict[str, Any]) -> str:
        """Calculate remediation priority based on finding characteristics."""
        severity_score = finding.get("Severity", 0)
        confidence = finding.get("Confidence", 0)
        finding_type = finding.get("Type", "")
        
        # Critical priority for high severity malware/backdoors
        if (severity_score >= 7.0 and confidence >= 7.0 and 
            any(threat in finding_type for threat in ["Malware", "Backdoor", "Trojan"])):
            return "critical"
        
        # High priority for high severity findings
        elif severity_score >= 7.0:
            return "high"
        
        # Medium priority for medium severity findings
        elif severity_score >= 4.0:
            return "medium"
        
        # Low priority for everything else
        else:
            return "low"

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