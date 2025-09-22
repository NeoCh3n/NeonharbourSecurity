"""AWS CloudTrail connector for account operation audit log ingestion."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .utils import RateLimiter


class CloudTrailClient:
    """Connector for AWS CloudTrail audit logs."""
    
    def __init__(
        self,
        *,
        region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: str = None,
        aws_session_token: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
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
            self._client = self._session.client("cloudtrail")
            self._s3_client = self._session.client("s3")
        except Exception:
            # Fall back to fixture mode if AWS credentials are not available
            self._client = None
            self._s3_client = None

    def fetch_recent_events(
        self, 
        limit: int = 50,
        hours_back: int = 24,
        event_names: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch recent CloudTrail events for security analysis."""
        self._limiter.acquire()
        
        if not self._client:
            return self._load_fixture("cloudtrail_events.json")[:limit]
        
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours_back)
            
            lookup_kwargs = {
                "StartTime": start_time,
                "EndTime": end_time,
                "MaxResults": limit
            }
            
            # Filter by specific event names if provided
            if event_names:
                lookup_kwargs["LookupAttributes"] = [
                    {
                        "AttributeKey": "EventName",
                        "AttributeValue": event_name
                    }
                    for event_name in event_names
                ]
            
            response = self._client.lookup_events(**lookup_kwargs)
            
            # Transform events to standardized format
            events = []
            for event in response.get("Events", []):
                transformed_event = self._transform_event(event)
                events.append(transformed_event)
            
            return events
            
        except (BotoCoreError, ClientError) as e:
            print(f"CloudTrail API error: {e}")
            return self._load_fixture("cloudtrail_events.json")[:limit]

    def fetch_security_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch security-relevant CloudTrail events."""
        security_event_names = [
            "ConsoleLogin",
            "AssumeRole",
            "CreateUser",
            "DeleteUser",
            "AttachUserPolicy",
            "DetachUserPolicy",
            "CreateRole",
            "DeleteRole",
            "PutBucketPolicy",
            "DeleteBucketPolicy",
            "CreateAccessKey",
            "DeleteAccessKey",
            "ChangePassword",
            "CreateLoginProfile",
            "DeleteLoginProfile",
            "EnableMfaDevice",
            "DeactivateMfaDevice",
            "CreateVirtualMfaDevice",
            "DeleteVirtualMfaDevice"
        ]
        
        return self.fetch_recent_events(
            limit=limit,
            event_names=security_event_names
        )

    def fetch_failed_logins(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch failed login attempts from CloudTrail."""
        self._limiter.acquire()
        
        if not self._client:
            return self._load_fixture("cloudtrail_failed_logins.json")[:limit]
        
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=24)
            
            response = self._client.lookup_events(
                LookupAttributes=[
                    {
                        "AttributeKey": "EventName",
                        "AttributeValue": "ConsoleLogin"
                    }
                ],
                StartTime=start_time,
                EndTime=end_time,
                MaxResults=limit * 2  # Get more to filter for failures
            )
            
            failed_events = []
            for event in response.get("Events", []):
                # Parse CloudTrail event to check for login failures
                if self._is_failed_login(event):
                    transformed_event = self._transform_event(event)
                    failed_events.append(transformed_event)
                    
                if len(failed_events) >= limit:
                    break
            
            return failed_events
            
        except (BotoCoreError, ClientError) as e:
            print(f"CloudTrail API error: {e}")
            return self._load_fixture("cloudtrail_failed_logins.json")[:limit]

    def _transform_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Transform CloudTrail event to standardized format for investigation pipeline."""
        # Handle timestamp conversion
        event_time = event.get("EventTime")
        if isinstance(event_time, str):
            timestamp = event_time
        elif hasattr(event_time, 'isoformat'):
            timestamp = event_time.isoformat()
        else:
            timestamp = datetime.utcnow().isoformat()
            
        return {
            "id": event.get("EventId", ""),
            "timestamp": timestamp,
            "event_name": event.get("EventName", ""),
            "event_source": event.get("EventSource", ""),
            "aws_region": event.get("AwsRegion", ""),
            "source_ip": event.get("SourceIPAddress", ""),
            "user_agent": event.get("UserAgent", ""),
            "user_identity": event.get("UserIdentity", {}),
            "request_parameters": event.get("RequestParameters", {}),
            "response_elements": event.get("ResponseElements", {}),
            "error_code": event.get("ErrorCode"),
            "error_message": event.get("ErrorMessage"),
            "resources": event.get("Resources", []),
            "cloud_trail_event": event.get("CloudTrailEvent", ""),
            "read_only": event.get("ReadOnly", True),
            "event_type": event.get("EventType", ""),
            "api_version": event.get("ApiVersion", ""),
            "management_event": event.get("ManagementEvent", True),
            "recipient_account_id": event.get("RecipientAccountId", ""),
            "service_event_details": event.get("ServiceEventDetails", {}),
            "shared_event_id": event.get("SharedEventID", ""),
            "vpc_endpoint_id": event.get("VpcEndpointId", ""),
            # Add metadata for investigation pipeline
            "source_type": "cloudtrail",
            "severity": self._calculate_severity(event),
            "risk_score": self._calculate_risk_score(event)
        }

    def _is_failed_login(self, event: Dict[str, Any]) -> bool:
        """Check if CloudTrail event represents a failed login attempt."""
        if event.get("EventName") != "ConsoleLogin":
            return False
        
        # Parse the CloudTrail event JSON to check response elements
        cloud_trail_event = event.get("CloudTrailEvent", "{}")
        if isinstance(cloud_trail_event, str):
            try:
                parsed_event = json.loads(cloud_trail_event)
                response_elements = parsed_event.get("responseElements", {})
                return response_elements.get("ConsoleLogin") == "Failure"
            except json.JSONDecodeError:
                pass
        
        # Check error codes that indicate authentication failures
        error_code = event.get("ErrorCode", "")
        return error_code in ["SigninFailure", "InvalidUserID.NotFound", "AuthFailure"]

    def _calculate_severity(self, event: Dict[str, Any]) -> str:
        """Calculate severity level based on event characteristics."""
        event_name = event.get("EventName", "")
        error_code = event.get("ErrorCode")
        
        # High severity events
        high_severity_events = [
            "DeleteUser", "DeleteRole", "DeleteBucketPolicy", 
            "DeleteAccessKey", "DeactivateMfaDevice", "DeleteVirtualMfaDevice"
        ]
        
        # Medium severity events
        medium_severity_events = [
            "CreateUser", "CreateRole", "AttachUserPolicy", 
            "CreateAccessKey", "ConsoleLogin", "AssumeRole"
        ]
        
        if event_name in high_severity_events or error_code:
            return "high"
        elif event_name in medium_severity_events:
            return "medium"
        else:
            return "low"

    def _calculate_risk_score(self, event: Dict[str, Any]) -> float:
        """Calculate risk score (0.0-1.0) based on event characteristics."""
        score = 0.0
        
        # Base score for event type - balanced for realistic distribution
        event_name = event.get("EventName", "")
        if event_name in ["DeleteUser", "DeleteRole", "DeleteBucketPolicy"]:
            score += 0.5  # Increased for truly dangerous operations
        elif event_name in ["CreateUser", "CreateRole", "AttachUserPolicy"]:
            score += 0.3  # Moderate risk for user management
        elif event_name == "ConsoleLogin":
            score += 0.1  # Low risk for normal logins
        else:
            score += 0.05  # Very low risk for read operations
        
        # Increase score for errors - failures are concerning
        if event.get("ErrorCode"):
            score += 0.3  # Restored higher penalty for errors
        
        # Increase score for external source IPs
        source_ip = event.get("SourceIPAddress", "")
        if source_ip and not source_ip.startswith(("10.", "172.", "192.168.")):
            score += 0.2  # External access is riskier
        
        # Increase score for non-read-only operations
        if not event.get("ReadOnly", True):
            score += 0.2  # Write operations are riskier
        
        return min(score, 1.0)

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        """Load fixture data when AWS API is not available."""
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            
            if isinstance(data, dict) and "Events" in data:
                return [self._transform_event(event) for event in data["Events"]]
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