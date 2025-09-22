"""AWS VPC Flow Logs connector for network traffic metadata analysis."""
from __future__ import annotations

import gzip
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .utils import RateLimiter


class VPCFlowLogsClient:
    """Connector for AWS VPC Flow Logs network traffic analysis."""
    
    def __init__(
        self,
        *,
        region: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None,
        s3_bucket: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.region = region or os.getenv("AWS_REGION", "us-east-1")
        self.s3_bucket = s3_bucket or os.getenv("VPC_FLOW_LOGS_BUCKET")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._limiter = rate_limiter or RateLimiter(capacity=10, refill_rate_per_sec=2)
        
        # Initialize boto3 clients
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
            self._s3_client = self._session.client("s3")
            self._ec2_client = self._session.client("ec2")
        except Exception:
            # Fall back to fixture mode if AWS credentials are not available
            self._s3_client = None
            self._ec2_client = None

    def fetch_recent_flow_logs(
        self, 
        limit: int = 100,
        hours_back: int = 1,
        vpc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch recent VPC Flow Logs for network traffic analysis."""
        self._limiter.acquire()
        
        if not self._s3_client or not self.s3_bucket:
            return self._load_fixture("vpc_flow_logs.json")[:limit]
        
        try:
            # Calculate time range for S3 prefix
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=hours_back)
            
            # VPC Flow Logs are typically stored with date/hour partitioning
            flow_logs = []
            current_time = start_time
            
            while current_time <= end_time and len(flow_logs) < limit:
                prefix = self._build_s3_prefix(current_time)
                logs_batch = self._fetch_logs_from_s3(prefix, limit - len(flow_logs))
                
                # Filter by VPC IDs if specified
                if vpc_ids:
                    logs_batch = [log for log in logs_batch if log.get("vpc_id") in vpc_ids]
                
                flow_logs.extend(logs_batch)
                current_time += timedelta(hours=1)
            
            return flow_logs[:limit]
            
        except (BotoCoreError, ClientError) as e:
            print(f"VPC Flow Logs S3 error: {e}")
            return self._load_fixture("vpc_flow_logs.json")[:limit]

    def fetch_suspicious_traffic(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch potentially suspicious network traffic patterns."""
        flow_logs = self.fetch_recent_flow_logs(limit=limit * 2)  # Get more to filter
        
        suspicious_logs = []
        for log in flow_logs:
            if self._is_suspicious_traffic(log):
                suspicious_logs.append(log)
                
            if len(suspicious_logs) >= limit:
                break
        
        return suspicious_logs

    def fetch_rejected_connections(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch rejected/denied network connections."""
        flow_logs = self.fetch_recent_flow_logs(limit=limit * 2)
        
        rejected_logs = []
        for log in flow_logs:
            if log.get("action", "").upper() in ["REJECT", "DENIED"]:
                rejected_logs.append(log)
                
            if len(rejected_logs) >= limit:
                break
        
        return rejected_logs

    def fetch_high_volume_flows(self, limit: int = 50, byte_threshold: int = 1000000) -> List[Dict[str, Any]]:
        """Fetch high-volume network flows that might indicate data exfiltration."""
        flow_logs = self.fetch_recent_flow_logs(limit=limit * 2)
        
        high_volume_logs = []
        for log in flow_logs:
            bytes_transferred = log.get("bytes", 0)
            if bytes_transferred > byte_threshold:
                high_volume_logs.append(log)
                
            if len(high_volume_logs) >= limit:
                break
        
        return high_volume_logs

    def _fetch_logs_from_s3(self, prefix: str, limit: int) -> List[Dict[str, Any]]:
        """Fetch and parse VPC Flow Logs from S3."""
        try:
            response = self._s3_client.list_objects_v2(
                Bucket=self.s3_bucket,
                Prefix=prefix,
                MaxKeys=10  # Limit number of files to process
            )
            
            flow_logs = []
            for obj in response.get("Contents", []):
                if len(flow_logs) >= limit:
                    break
                    
                # Download and parse the log file
                log_data = self._download_and_parse_log_file(obj["Key"])
                flow_logs.extend(log_data)
            
            return flow_logs[:limit]
            
        except (BotoCoreError, ClientError) as e:
            print(f"S3 list objects error: {e}")
            return []

    def _download_and_parse_log_file(self, s3_key: str) -> List[Dict[str, Any]]:
        """Download and parse a single VPC Flow Log file from S3."""
        try:
            response = self._s3_client.get_object(Bucket=self.s3_bucket, Key=s3_key)
            content = response["Body"].read()
            
            # Handle gzipped files
            if s3_key.endswith(".gz"):
                content = gzip.decompress(content)
            
            # Parse the flow log format
            lines = content.decode("utf-8").strip().split("\n")
            flow_logs = []
            
            for line in lines:
                if line.strip() and not line.startswith("#"):  # Skip comments and empty lines
                    parsed_log = self._parse_flow_log_line(line)
                    if parsed_log:
                        flow_logs.append(parsed_log)
            
            return flow_logs
            
        except Exception as e:
            print(f"Error parsing log file {s3_key}: {e}")
            return []

    def _parse_flow_log_line(self, line: str) -> Optional[Dict[str, Any]]:
        """Parse a single VPC Flow Log line into structured data."""
        try:
            # Standard VPC Flow Log format (version 2)
            fields = line.strip().split()
            if len(fields) < 14:
                return None
            
            parsed_log = {
                "version": int(fields[0]) if fields[0].isdigit() else 2,
                "account_id": fields[1],
                "interface_id": fields[2],
                "srcaddr": fields[3],
                "dstaddr": fields[4],
                "srcport": int(fields[5]) if fields[5].isdigit() else 0,
                "dstport": int(fields[6]) if fields[6].isdigit() else 0,
                "protocol": int(fields[7]) if fields[7].isdigit() else 0,
                "packets": int(fields[8]) if fields[8].isdigit() else 0,
                "bytes": int(fields[9]) if fields[9].isdigit() else 0,
                "windowstart": int(fields[10]) if fields[10].isdigit() else 0,
                "windowend": int(fields[11]) if fields[11].isdigit() else 0,
                "action": fields[12].upper(),
                "flowlogstatus": fields[13].upper(),
            }
            
            # Add additional fields if available (version 3+)
            if len(fields) > 14:
                parsed_log["vpc_id"] = fields[14] if len(fields) > 14 else ""
                parsed_log["subnet_id"] = fields[15] if len(fields) > 15 else ""
                parsed_log["instance_id"] = fields[16] if len(fields) > 16 else ""
            
            # Add derived fields for analysis
            parsed_log.update({
                "timestamp": datetime.fromtimestamp(parsed_log["windowstart"]).isoformat(),
                "duration_seconds": parsed_log["windowend"] - parsed_log["windowstart"],
                "protocol_name": self._get_protocol_name(parsed_log["protocol"]),
                "source_type": "vpc_flow_logs",
                "severity": self._calculate_severity(parsed_log),
                "risk_score": self._calculate_risk_score(parsed_log)
            })
            
            return parsed_log
            
        except (ValueError, IndexError) as e:
            print(f"Error parsing flow log line: {e}")
            return None

    def _build_s3_prefix(self, timestamp: datetime) -> str:
        """Build S3 prefix for VPC Flow Logs based on timestamp."""
        # Common VPC Flow Logs S3 structure: AWSLogs/account-id/vpcflowlogs/region/year/month/day/hour/
        return f"AWSLogs/{timestamp.year:04d}/{timestamp.month:02d}/{timestamp.day:02d}/{timestamp.hour:02d}/"

    def _get_protocol_name(self, protocol_number: int) -> str:
        """Convert protocol number to name."""
        protocol_map = {
            1: "ICMP",
            6: "TCP",
            17: "UDP",
            47: "GRE",
            50: "ESP",
            51: "AH",
            58: "ICMPv6"
        }
        return protocol_map.get(protocol_number, f"Protocol-{protocol_number}")

    def _is_suspicious_traffic(self, log: Dict[str, Any]) -> bool:
        """Determine if network traffic appears suspicious."""
        # Check for common suspicious patterns
        
        # High packet count with low bytes (potential scanning)
        packets = log.get("packets", 0)
        bytes_transferred = log.get("bytes", 0)
        if packets > 100 and bytes_transferred < packets * 64:
            return True
        
        # Connections to unusual ports
        dstport = log.get("dstport", 0)
        suspicious_ports = [22, 23, 135, 139, 445, 1433, 1521, 3389, 5432, 5900]
        if dstport in suspicious_ports and log.get("action") == "ACCEPT":
            return True
        
        # High-frequency connections from same source
        # (This would require aggregation across multiple logs in a real implementation)
        
        # Rejected connections (potential reconnaissance)
        if log.get("action") == "REJECT":
            return True
        
        return False

    def _calculate_severity(self, log: Dict[str, Any]) -> str:
        """Calculate severity level based on flow log characteristics."""
        action = log.get("action", "")
        bytes_transferred = log.get("bytes", 0)
        dstport = log.get("dstport", 0)
        
        # High severity: Large data transfers or rejected connections to sensitive ports
        if (bytes_transferred > 10000000 or  # > 10MB
            (action == "REJECT" and dstport in [22, 3389, 1433, 5432])):
            return "high"
        
        # Medium severity: Moderate data transfers or connections to administrative ports
        elif (bytes_transferred > 1000000 or  # > 1MB
              dstport in [22, 23, 135, 139, 445, 3389]):
            return "medium"
        
        return "low"

    def _calculate_risk_score(self, log: Dict[str, Any]) -> float:
        """Calculate risk score (0.0-1.0) based on flow log characteristics."""
        score = 0.0
        
        # Base score for rejected connections
        if log.get("action") == "REJECT":
            score += 0.3  # Increased to allow higher risk scores
        
        # Score based on data volume - more aggressive for large transfers
        bytes_transferred = log.get("bytes", 0)
        if bytes_transferred > 100000000:  # > 100MB
            score += 0.5  # Increased for potential data exfiltration
        elif bytes_transferred > 10000000:  # > 10MB
            score += 0.3  # Moderate risk for large transfers
        elif bytes_transferred > 1000000:  # > 1MB
            score += 0.1  # Low risk for normal transfers
        
        # Score based on destination port - higher for vulnerable services
        dstport = log.get("dstport", 0)
        if dstport in [22, 3389, 1433, 5432]:  # Administrative/database ports
            score += 0.2  # Moderate risk for admin ports
        elif dstport in [23, 135, 139, 445]:  # Legacy/vulnerable ports
            score += 0.4  # High risk for vulnerable ports
        
        # Score based on packet patterns (potential scanning)
        packets = log.get("packets", 0)
        if packets > 1000 and bytes_transferred < packets * 64:
            score += 0.3  # Scanning behavior is concerning
        
        # External IP bonus (outside private ranges)
        srcaddr = log.get("srcaddr", "")
        if srcaddr and not srcaddr.startswith(("10.", "172.", "192.168.")):
            score += 0.1  # External sources are riskier
        
        return min(score, 1.0)

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        """Load fixture data when AWS API is not available."""
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            
            if isinstance(data, list):
                return data
            else:
                return [data]
        except (json.JSONDecodeError, KeyError):
            return []

    def close(self) -> None:
        """Clean up resources."""
        # boto3 clients don't need explicit cleanup
        pass