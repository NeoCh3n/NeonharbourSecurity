"""Alert variation engine to ensure diverse scenarios during continuous generation."""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List
from dataclasses import dataclass, replace

from src.demo.scenarios import ScenarioTemplate


@dataclass
class VariationConfig:
    """Configuration for alert variations."""
    time_variance_hours: int = 24  # How much to vary timestamps
    severity_variation: bool = True  # Whether to vary severity levels
    entity_randomization: bool = True  # Whether to randomize entity names
    source_rotation: bool = True  # Whether to rotate between source systems
    geographic_variation: bool = True  # Whether to vary IP locations


class AlertVariationEngine:
    """Engine for applying variations to scenario templates to ensure diversity."""
    
    def __init__(self, config: VariationConfig = None):
        self.config = config or VariationConfig()
        
        # Variation pools for randomization
        self.severity_levels = ["Low", "Medium", "High", "Critical"]
        self.source_systems = ["sentinel", "defender", "crowdstrike", "guardduty", "entra", "okta"]
        
        # Hong Kong IP ranges and common internal networks
        self.hk_ip_ranges = [
            "202.64.0.0/16",    # Hong Kong public ranges
            "203.80.0.0/16",
            "218.188.0.0/16",
            "10.20.0.0/16",     # Common internal ranges for HK banks
            "172.16.0.0/16",
            "192.168.100.0/24"
        ]
        
        # Common Hong Kong financial institution naming patterns
        self.hk_naming_patterns = {
            "hostnames": [
                "HK-WS-{:03d}", "HK-SRV-{:03d}", "HK-DC-{:02d}",
                "HKBANK-{:04d}", "TRADING-{:03d}", "BRANCH-{:02d}"
            ],
            "users": [
                "hk.ops{:02d}", "trading.desk{:02d}", "branch.mgr{:02d}",
                "compliance{:02d}", "risk.analyst{:02d}", "it.admin{:02d}"
            ],
            "services": [
                "CoreBanking", "TradingPlatform", "RiskManagement",
                "ComplianceDB", "CustomerPortal", "PaymentGateway"
            ]
        }
        
        # False positive variation strategies
        self.false_positive_variations = {
            "timing": ["scheduled_maintenance", "business_hours", "known_process"],
            "context": ["legitimate_admin", "approved_change", "system_update"],
            "indicators": ["expected_behavior", "documented_process", "authorized_user"]
        }
        
        # Genuine threat variation strategies  
        self.genuine_threat_variations = {
            "timing": ["off_hours", "holiday", "suspicious_timing"],
            "context": ["unauthorized_access", "privilege_escalation", "data_exfiltration"],
            "indicators": ["malicious_behavior", "attack_pattern", "compromise_indicators"]
        }
    
    def apply_variations(
        self,
        template: ScenarioTemplate,
        is_false_positive: bool
    ) -> ScenarioTemplate:
        """Apply variations to a scenario template to create diverse alerts."""
        varied_template = replace(template)  # Create a copy
        
        # Apply severity variation
        if self.config.severity_variation:
            varied_template = self._vary_severity(varied_template, is_false_positive)
        
        # Apply source system rotation
        if self.config.source_rotation:
            varied_template = self._vary_source_system(varied_template)
        
        # Apply entity randomization
        if self.config.entity_randomization:
            varied_template = self._vary_entities(varied_template)
        
        # Apply scenario-specific variations based on false positive status
        varied_template = self._apply_context_variations(varied_template, is_false_positive)
        
        return varied_template
    
    def _vary_severity(self, template: ScenarioTemplate, is_false_positive: bool) -> ScenarioTemplate:
        """Vary severity levels based on false positive status."""
        if is_false_positive:
            # False positives tend to have lower severity when properly analyzed
            severity_options = ["Low", "Medium"]
            if template.severity in ["High", "Critical"]:
                # Sometimes false positives initially appear high severity
                severity_options.extend(["High"] * 2)  # Weight toward High for initial detection
        else:
            # Genuine threats maintain higher severity
            severity_options = ["Medium", "High", "Critical"]
            if template.severity == "Critical":
                severity_options.extend(["Critical"] * 3)  # Weight toward Critical
        
        template.severity = random.choice(severity_options)
        return template
    
    def _vary_source_system(self, template: ScenarioTemplate) -> ScenarioTemplate:
        """Rotate source systems to show multi-platform detection."""
        # Some scenarios are more appropriate for certain sources
        scenario_source_mapping = {
            "phishing": ["sentinel", "defender", "entra"],
            "ransomware": ["crowdstrike", "defender", "sentinel"],
            "insider": ["sentinel", "entra", "okta"],
            "apt": ["crowdstrike", "defender", "guardduty"],
            "cloud": ["guardduty", "sentinel"],
            "compliance": ["sentinel", "entra"]
        }
        
        # Determine appropriate sources for this scenario type
        scenario_key = next(
            (key for key in scenario_source_mapping.keys() 
             if key in template.scenario_type.lower()),
            "default"
        )
        
        if scenario_key != "default":
            appropriate_sources = scenario_source_mapping[scenario_key]
            template.source = random.choice(appropriate_sources)
        else:
            template.source = random.choice(self.source_systems)
        
        return template
    
    def _vary_entities(self, template: ScenarioTemplate) -> ScenarioTemplate:
        """Randomize entity names and values for diversity."""
        varied_entities = []
        
        for entity in template.default_entities:
            varied_entity = entity.copy()
            entity_type = entity.get("type", "")
            entity_name = entity.get("name", "")
            
            # Apply type-specific variations
            if entity_type == "host":
                varied_entity["name"] = self._generate_hostname()
            elif entity_type == "user":
                varied_entity["name"] = self._generate_username()
            elif entity_type == "ip" or "ip" in entity_name.lower():
                varied_entity["name"] = self._generate_ip_address()
            elif entity_type == "file" or entity_type == "file_path":
                varied_entity["name"] = self._vary_file_path(entity_name)
            elif entity_type == "service":
                varied_entity["name"] = random.choice(self.hk_naming_patterns["services"])
            elif "[" in entity_name and "]" in entity_name:
                # Handle placeholder patterns like [user_name]
                varied_entity["name"] = self._replace_placeholders(entity_name)
            
            varied_entities.append(varied_entity)
        
        template.default_entities = varied_entities
        return template
    
    def _apply_context_variations(
        self,
        template: ScenarioTemplate,
        is_false_positive: bool
    ) -> ScenarioTemplate:
        """Apply context-specific variations based on false positive status."""
        if is_false_positive:
            # Modify description to include false positive indicators
            fp_context = random.choice([
                "Activity occurred during scheduled maintenance window.",
                "User has documented authorization for this access pattern.",
                "Behavior matches known legitimate business process.",
                "System update deployment explains the observed activity.",
                "Approved change management ticket covers this operation."
            ])
            template.description_template += f" Note: {fp_context}"
            
            # Adjust title to be less alarming
            if "suspicious" in template.title_template.lower():
                template.title_template = template.title_template.replace(
                    "Suspicious", "Unusual"
                ).replace("suspicious", "unusual")
        else:
            # Enhance genuine threat indicators
            threat_context = random.choice([
                "No corresponding change management authorization found.",
                "Activity patterns consistent with known attack techniques.",
                "Multiple security controls triggered simultaneously.",
                "Behavior deviates significantly from baseline patterns.",
                "Indicators match threat intelligence signatures."
            ])
            template.description_template += f" Alert: {threat_context}"
        
        return template
    
    def _generate_hostname(self) -> str:
        """Generate realistic Hong Kong financial institution hostname."""
        pattern = random.choice(self.hk_naming_patterns["hostnames"])
        return pattern.format(random.randint(1, 999))
    
    def _generate_username(self) -> str:
        """Generate realistic Hong Kong financial institution username."""
        pattern = random.choice(self.hk_naming_patterns["users"])
        username = pattern.format(random.randint(1, 99))
        return f"{username}@neonharbour.hk"
    
    def _generate_ip_address(self) -> str:
        """Generate realistic IP address for Hong Kong context."""
        # Choose between internal and external IPs
        if random.random() < 0.7:  # 70% internal IPs
            # Generate internal IP
            if random.random() < 0.5:
                return f"10.20.{random.randint(1, 254)}.{random.randint(1, 254)}"
            else:
                return f"172.16.{random.randint(1, 254)}.{random.randint(1, 254)}"
        else:
            # Generate Hong Kong public IP range
            return f"202.64.{random.randint(1, 254)}.{random.randint(1, 254)}"
    
    def _vary_file_path(self, original_path: str) -> str:
        """Vary file paths while maintaining realistic structure."""
        if "\\\\" in original_path:  # Windows UNC path
            base_path = "\\\\shared\\finance\\"
            filename = f"document_{random.randint(1000, 9999)}"
            extension = random.choice([".xlsx", ".pdf", ".docx", ".encrypted"])
            return f"{base_path}{filename}{extension}"
        elif "/" in original_path:  # Unix-style path
            base_path = "/opt/banking/data/"
            filename = f"transaction_{random.randint(1000, 9999)}"
            extension = random.choice([".log", ".dat", ".json", ".enc"])
            return f"{base_path}{filename}{extension}"
        else:
            return original_path
    
    def _replace_placeholders(self, text: str) -> str:
        """Replace placeholder patterns with realistic values."""
        replacements = {
            "[employee_name]": f"employee{random.randint(100, 999)}",
            "[user_name]": f"user{random.randint(100, 999)}",
            "[admin_user]": f"admin{random.randint(10, 99)}",
            "[service_account]": f"svc_account{random.randint(10, 99)}",
            "[suspicious_sender]": f"phishing{random.randint(100, 999)}",
            "[recipient_email]": f"staff{random.randint(100, 999)}",
            "[executive_name]": f"exec{random.randint(10, 99)}",
            "[privileged_user]": f"privuser{random.randint(10, 99)}",
            "[target_user]": f"target{random.randint(100, 999)}",
            "[number]": str(random.randint(100, 999)),
            "[suspicious_ip]": self._generate_ip_address()
        }
        
        result = text
        for placeholder, replacement in replacements.items():
            if placeholder in result:
                result = result.replace(placeholder, replacement)
        
        return result
    
    def generate_time_variation(self) -> str:
        """Generate varied timestamp for alerts."""
        # Vary time within configured range
        base_time = datetime.now(timezone.utc)
        variation_seconds = random.randint(
            -self.config.time_variance_hours * 3600,
            self.config.time_variance_hours * 3600
        )
        varied_time = base_time + timedelta(seconds=variation_seconds)
        return varied_time.isoformat()
    
    def get_variation_stats(self) -> Dict[str, Any]:
        """Get statistics about available variations."""
        return {
            "severity_levels": len(self.severity_levels),
            "source_systems": len(self.source_systems),
            "hostname_patterns": len(self.hk_naming_patterns["hostnames"]),
            "user_patterns": len(self.hk_naming_patterns["users"]),
            "service_names": len(self.hk_naming_patterns["services"]),
            "ip_ranges": len(self.hk_ip_ranges),
            "false_positive_strategies": sum(len(v) for v in self.false_positive_variations.values()),
            "genuine_threat_strategies": sum(len(v) for v in self.genuine_threat_variations.values())
        }