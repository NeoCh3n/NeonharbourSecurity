"""Cross-account IAM role validation and setup guidance utilities."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError


class CrossAccountValidator:
    """Utility for validating and setting up cross-account access for AWS security services."""
    
    def __init__(
        self,
        *,
        region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None,
    ) -> None:
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.neoharbour_account_id = os.getenv("NEOHARBOUR_ACCOUNT_ID", "123456789012")
        
        # Initialize boto3 session
        session_kwargs = {}
        if aws_access_key_id:
            session_kwargs["aws_access_key_id"] = aws_access_key_id
        if aws_secret_access_key:
            session_kwargs["aws_secret_access_key"] = aws_secret_access_key
        if aws_session_token:
            session_kwargs["aws_session_token"] = aws_session_token
        if self.region:
            session_kwargs["region_name"] = self.region
            
        self._session = boto3.Session(**session_kwargs)
        self._sts_client = self._session.client("sts")

    def validate_security_hub_access(
        self, 
        customer_account_id: str, 
        role_arn: str,
        external_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Validate cross-account Security Hub access."""
        return self._validate_service_access(
            service_name="securityhub",
            customer_account_id=customer_account_id,
            role_arn=role_arn,
            external_id=external_id,
            required_permissions=self._get_security_hub_permissions(),
            validation_tests=[
                ("describe_hub", "Verify Security Hub is enabled"),
                ("get_findings", "Test findings access with limit=1")
            ]
        )

    def validate_guardduty_access(
        self, 
        customer_account_id: str, 
        role_arn: str,
        external_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Validate cross-account GuardDuty access."""
        return self._validate_service_access(
            service_name="guardduty",
            customer_account_id=customer_account_id,
            role_arn=role_arn,
            external_id=external_id,
            required_permissions=self._get_guardduty_permissions(),
            validation_tests=[
                ("list_detectors", "List available GuardDuty detectors"),
                ("get_detector", "Test detector access")
            ]
        )

    def validate_cloudtrail_access(
        self, 
        customer_account_id: str, 
        role_arn: str,
        external_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Validate cross-account CloudTrail access."""
        return self._validate_service_access(
            service_name="cloudtrail",
            customer_account_id=customer_account_id,
            role_arn=role_arn,
            external_id=external_id,
            required_permissions=self._get_cloudtrail_permissions(),
            validation_tests=[
                ("describe_trails", "List CloudTrail trails"),
                ("lookup_events", "Test event lookup with limit=1")
            ]
        )

    def validate_vpc_flow_logs_access(
        self, 
        customer_account_id: str, 
        role_arn: str,
        external_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Validate cross-account VPC Flow Logs access."""
        return self._validate_service_access(
            service_name="ec2",
            customer_account_id=customer_account_id,
            role_arn=role_arn,
            external_id=external_id,
            required_permissions=self._get_vpc_flow_logs_permissions(),
            validation_tests=[
                ("describe_flow_logs", "List VPC Flow Logs"),
                ("describe_vpcs", "Test VPC access")
            ]
        )

    def _validate_service_access(
        self,
        service_name: str,
        customer_account_id: str,
        role_arn: str,
        external_id: Optional[str],
        required_permissions: List[str],
        validation_tests: List[tuple[str, str]]
    ) -> Dict[str, Any]:
        """Generic service access validation."""
        validation_result = {
            "valid": False,
            "service": service_name,
            "customer_account_id": customer_account_id,
            "role_arn": role_arn,
            "external_id": external_id,
            "errors": [],
            "warnings": [],
            "test_results": [],
            "required_permissions": required_permissions,
            "validation_timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            # Test STS assume role
            assume_role_kwargs = {
                "RoleArn": role_arn,
                "RoleSessionName": f"ValidationTest-{service_name}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
                "DurationSeconds": 900  # 15 minutes for validation
            }
            
            if external_id:
                assume_role_kwargs["ExternalId"] = external_id
            
            response = self._sts_client.assume_role(**assume_role_kwargs)
            credentials = response["Credentials"]
            
            # Create test session with assumed role
            test_session = boto3.Session(
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"],
                region_name=self.region
            )
            
            test_client = test_session.client(service_name)
            
            # Run validation tests
            all_tests_passed = True
            for test_method, test_description in validation_tests:
                test_result = self._run_validation_test(
                    test_client, test_method, test_description
                )
                validation_result["test_results"].append(test_result)
                
                if not test_result["passed"]:
                    all_tests_passed = False
                    if test_result["error_type"] == "AccessDenied":
                        validation_result["errors"].append(
                            f"Access denied for {test_description}: {test_result['error']}"
                        )
                    else:
                        validation_result["warnings"].append(
                            f"Test failed for {test_description}: {test_result['error']}"
                        )
            
            validation_result["valid"] = all_tests_passed and len(validation_result["errors"]) == 0
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            
            if error_code == "AccessDenied":
                validation_result["errors"].append(
                    f"Cannot assume role {role_arn}: {error_message}. "
                    "Check trust relationship and external ID."
                )
            elif error_code == "InvalidParameterValue":
                validation_result["errors"].append(
                    f"Invalid role ARN or external ID: {error_message}"
                )
            else:
                validation_result["errors"].append(f"Role assumption failed: {error_message}")
                
        except Exception as e:
            validation_result["errors"].append(f"Validation failed: {str(e)}")
        
        return validation_result

    def _run_validation_test(
        self, 
        client: Any, 
        method_name: str, 
        description: str
    ) -> Dict[str, Any]:
        """Run a single validation test against the service client."""
        test_result = {
            "method": method_name,
            "description": description,
            "passed": False,
            "error": None,
            "error_type": None,
            "response_summary": None
        }
        
        try:
            # Call the method with minimal parameters
            if method_name == "describe_hub":
                response = client.describe_hub()
                test_result["response_summary"] = f"Hub ARN: {response.get('HubArn', 'N/A')}"
                
            elif method_name == "get_findings":
                response = client.get_findings(MaxResults=1)
                findings_count = len(response.get("Findings", []))
                test_result["response_summary"] = f"Retrieved {findings_count} findings"
                
            elif method_name == "list_detectors":
                response = client.list_detectors()
                detector_count = len(response.get("DetectorIds", []))
                test_result["response_summary"] = f"Found {detector_count} detectors"
                
            elif method_name == "get_detector":
                # First get detector IDs
                detectors_response = client.list_detectors()
                detector_ids = detectors_response.get("DetectorIds", [])
                if detector_ids:
                    response = client.get_detector(DetectorId=detector_ids[0])
                    status = response.get("Status", "UNKNOWN")
                    test_result["response_summary"] = f"Detector status: {status}"
                else:
                    test_result["response_summary"] = "No detectors found"
                    
            elif method_name == "describe_trails":
                response = client.describe_trails()
                trail_count = len(response.get("trailList", []))
                test_result["response_summary"] = f"Found {trail_count} trails"
                
            elif method_name == "lookup_events":
                response = client.lookup_events(MaxItems=1)
                event_count = len(response.get("Events", []))
                test_result["response_summary"] = f"Retrieved {event_count} events"
                
            elif method_name == "describe_flow_logs":
                response = client.describe_flow_logs(MaxResults=1)
                flow_log_count = len(response.get("FlowLogs", []))
                test_result["response_summary"] = f"Found {flow_log_count} flow logs"
                
            elif method_name == "describe_vpcs":
                response = client.describe_vpcs(MaxResults=1)
                vpc_count = len(response.get("Vpcs", []))
                test_result["response_summary"] = f"Found {vpc_count} VPCs"
                
            else:
                # Generic method call
                response = getattr(client, method_name)()
                test_result["response_summary"] = "Method executed successfully"
            
            test_result["passed"] = True
            
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            error_message = e.response.get("Error", {}).get("Message", str(e))
            
            test_result["error"] = error_message
            test_result["error_type"] = error_code
            
            # Some errors are expected and don't indicate access issues
            if error_code in ["InvalidAccessException", "ResourceNotFoundException"]:
                test_result["passed"] = True  # Service is accessible, just no resources
                test_result["response_summary"] = f"Service accessible but {error_message}"
            
        except Exception as e:
            test_result["error"] = str(e)
            test_result["error_type"] = "UnknownError"
        
        return test_result

    def generate_security_hub_setup_guide(self, customer_account_id: str) -> Dict[str, Any]:
        """Generate comprehensive setup guide for Security Hub cross-account access."""
        role_name = "NeoHarbourSecurityHubAccess"
        external_id = f"neoharbour-{customer_account_id}"
        
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": f"arn:aws:iam::{self.neoharbour_account_id}:root"
                    },
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {
                            "sts:ExternalId": external_id
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
                    "Action": self._get_security_hub_permissions(),
                    "Resource": "*"
                }
            ]
        }
        
        return {
            "service": "Security Hub",
            "customer_account_id": customer_account_id,
            "neoharbour_account_id": self.neoharbour_account_id,
            "role_name": role_name,
            "external_id": external_id,
            "role_arn": f"arn:aws:iam::{customer_account_id}:role/{role_name}",
            "trust_policy": trust_policy,
            "permissions_policy": permissions_policy,
            "setup_steps": [
                "1. Enable AWS Security Hub in your account if not already enabled",
                "2. Navigate to IAM console and create a new role",
                f"3. Set role name as '{role_name}'",
                "4. Select 'Another AWS account' as trusted entity type",
                f"5. Enter NeoHarbour account ID: {self.neoharbour_account_id}",
                f"6. Check 'Require external ID' and enter: {external_id}",
                "7. Create and attach the provided permissions policy",
                "8. Complete role creation and copy the role ARN",
                "9. Provide the role ARN to NeoHarbour for configuration",
                "10. Test the connection using NeoHarbour's validation endpoint"
            ],
            "cli_commands": [
                f"# Create trust policy file",
                f"cat > trust-policy.json << 'EOF'\n{json.dumps(trust_policy, indent=2)}\nEOF",
                f"",
                f"# Create permissions policy file", 
                f"cat > permissions-policy.json << 'EOF'\n{json.dumps(permissions_policy, indent=2)}\nEOF",
                f"",
                f"# Create IAM role",
                f"aws iam create-role --role-name {role_name} --assume-role-policy-document file://trust-policy.json",
                f"",
                f"# Create and attach permissions policy",
                f"aws iam create-policy --policy-name {role_name}Policy --policy-document file://permissions-policy.json",
                f"aws iam attach-role-policy --role-name {role_name} --policy-arn arn:aws:iam::{customer_account_id}:policy/{role_name}Policy"
            ],
            "validation_endpoint": f"/api/validate-cross-account-access",
            "troubleshooting": {
                "common_issues": [
                    {
                        "issue": "AccessDenied when assuming role",
                        "cause": "Trust relationship not configured correctly",
                        "solution": "Verify NeoHarbour account ID and external ID in trust policy"
                    },
                    {
                        "issue": "Security Hub not enabled error",
                        "cause": "Security Hub service not activated",
                        "solution": "Enable Security Hub in AWS console or via CLI: aws securityhub enable-security-hub"
                    },
                    {
                        "issue": "Insufficient permissions for findings",
                        "cause": "Missing required Security Hub permissions",
                        "solution": "Ensure all permissions from the policy are attached to the role"
                    }
                ]
            }
        }

    def generate_multi_service_setup_guide(self, customer_account_id: str) -> Dict[str, Any]:
        """Generate setup guide for multiple AWS security services."""
        role_name = "NeoHarbourSecurityServicesAccess"
        external_id = f"neoharbour-{customer_account_id}"
        
        # Combine permissions for all services
        all_permissions = []
        all_permissions.extend(self._get_security_hub_permissions())
        all_permissions.extend(self._get_guardduty_permissions())
        all_permissions.extend(self._get_cloudtrail_permissions())
        all_permissions.extend(self._get_vpc_flow_logs_permissions())
        
        # Remove duplicates
        all_permissions = list(set(all_permissions))
        
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": f"arn:aws:iam::{self.neoharbour_account_id}:root"
                    },
                    "Action": "sts:AssumeRole",
                    "Condition": {
                        "StringEquals": {
                            "sts:ExternalId": external_id
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
                    "Action": sorted(all_permissions),
                    "Resource": "*"
                }
            ]
        }
        
        return {
            "services": ["Security Hub", "GuardDuty", "CloudTrail", "VPC Flow Logs"],
            "customer_account_id": customer_account_id,
            "neoharbour_account_id": self.neoharbour_account_id,
            "role_name": role_name,
            "external_id": external_id,
            "role_arn": f"arn:aws:iam::{customer_account_id}:role/{role_name}",
            "trust_policy": trust_policy,
            "permissions_policy": permissions_policy,
            "setup_steps": [
                "1. Enable required AWS security services (Security Hub, GuardDuty, CloudTrail, VPC Flow Logs)",
                "2. Navigate to IAM console and create a new role",
                f"3. Set role name as '{role_name}'",
                "4. Select 'Another AWS account' as trusted entity type",
                f"5. Enter NeoHarbour account ID: {self.neoharbour_account_id}",
                f"6. Check 'Require external ID' and enter: {external_id}",
                "7. Create and attach the provided comprehensive permissions policy",
                "8. Complete role creation and copy the role ARN",
                "9. Provide the role ARN to NeoHarbour for configuration",
                "10. Test connections for all services using NeoHarbour's validation endpoints"
            ]
        }

    def _get_security_hub_permissions(self) -> List[str]:
        """Get required IAM permissions for Security Hub access."""
        return [
            "securityhub:DescribeHub",
            "securityhub:GetFindings",
            "securityhub:GetInsights",
            "securityhub:GetInsightResults",
            "securityhub:ListEnabledProductsForImport",
            "securityhub:DescribeStandards",
            "securityhub:GetEnabledStandards"
        ]

    def _get_guardduty_permissions(self) -> List[str]:
        """Get required IAM permissions for GuardDuty access."""
        return [
            "guardduty:ListDetectors",
            "guardduty:GetDetector",
            "guardduty:ListFindings",
            "guardduty:GetFindings",
            "guardduty:DescribeOrganizationConfiguration",
            "guardduty:DescribePublishingDestination"
        ]

    def _get_cloudtrail_permissions(self) -> List[str]:
        """Get required IAM permissions for CloudTrail access."""
        return [
            "cloudtrail:DescribeTrails",
            "cloudtrail:GetTrailStatus",
            "cloudtrail:LookupEvents",
            "cloudtrail:ListPublicKeys",
            "cloudtrail:GetEventSelectors"
        ]

    def _get_vpc_flow_logs_permissions(self) -> List[str]:
        """Get required IAM permissions for VPC Flow Logs access."""
        return [
            "ec2:DescribeFlowLogs",
            "ec2:DescribeVpcs",
            "ec2:DescribeSubnets",
            "ec2:DescribeNetworkInterfaces",
            "ec2:DescribeInstances",
            "logs:DescribeLogGroups",
            "logs:DescribeLogStreams",
            "logs:FilterLogEvents"
        ]