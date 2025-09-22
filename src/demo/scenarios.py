"""Scenario template system for different attack types."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class ScenarioTemplate:
    """Template for generating specific attack scenario types."""
    scenario_type: str
    attack_vector: str
    source: str  # Source system (sentinel, defender, crowdstrike, etc.)
    severity: str
    tactics: List[str]  # MITRE ATT&CK tactics
    title_template: str
    description_template: str
    default_entities: List[Dict[str, Any]]
    false_positive_indicators: List[str]  # What makes this look like a false positive
    genuine_threat_indicators: List[str]  # What makes this look like a real threat
    hkma_relevance: str  # How this relates to HKMA requirements


def get_scenario_templates() -> List[ScenarioTemplate]:
    """Get all available scenario templates for demo generation."""
    return [
        # Phishing Attack Scenarios
        ScenarioTemplate(
            scenario_type="phishing_email",
            attack_vector="Email-based credential harvesting",
            source="sentinel",
            severity="High",
            tactics=["InitialAccess", "CredentialAccess"],
            title_template="Suspicious email with credential harvesting attempt",
            description_template="Email detected with suspicious links targeting employee credentials. "
                               "Contains Hong Kong banking-themed content designed to steal login information.",
            default_entities=[
                {"type": "email", "name": "[recipient_email]@neonharbour.hk"},
                {"type": "sender", "name": "[suspicious_sender]@fake-domain.com"},
                {"type": "url", "name": "https://fake-hkbank-login.com/secure"}
            ],
            false_positive_indicators=[
                "Legitimate banking partner communication",
                "Scheduled security awareness training email",
                "Internal IT department notification",
                "Vendor onboarding documentation"
            ],
            genuine_threat_indicators=[
                "Typosquatting domain mimicking real bank",
                "Credential harvesting form detected",
                "Suspicious sender reputation",
                "Urgency tactics in email content"
            ],
            hkma_relevance="SA-2 Section 4.2 - Email security controls and phishing prevention"
        ),
        
        ScenarioTemplate(
            scenario_type="spear_phishing",
            attack_vector="Targeted phishing against executives",
            source="defender",
            severity="Critical",
            tactics=["InitialAccess", "CredentialAccess", "Persistence"],
            title_template="Targeted spear phishing against C-level executive",
            description_template="Highly targeted phishing email sent to senior executive with "
                               "personalized content and malicious attachment designed to establish persistence.",
            default_entities=[
                {"type": "user", "name": "[executive_name]@neonharbour.hk"},
                {"type": "attachment", "name": "Q4_Financial_Report.pdf.exe"},
                {"type": "sender", "name": "[spoofed_partner]@legitimate-looking-domain.com"}
            ],
            false_positive_indicators=[
                "Legitimate business partner communication",
                "Expected quarterly report delivery",
                "Scheduled board meeting materials",
                "Authorized external consultant email"
            ],
            genuine_threat_indicators=[
                "Executable disguised as PDF",
                "Social engineering with personal details",
                "Domain spoofing of known partner",
                "Unusual sending patterns"
            ],
            hkma_relevance="TM-G-1 Section 3.1 - Senior management cybersecurity awareness"
        ),
        
        # Ransomware Scenarios
        ScenarioTemplate(
            scenario_type="ransomware_encryption",
            attack_vector="File encryption with ransom demand",
            source="crowdstrike",
            severity="Critical",
            tactics=["Impact", "DefenseEvasion", "Discovery"],
            title_template="Ransomware encryption activity detected on endpoint",
            description_template="Endpoint protection detected rapid file encryption patterns "
                               "consistent with ransomware deployment. Multiple file extensions "
                               "being modified simultaneously across network shares.",
            default_entities=[
                {"type": "host", "name": "HK-WS-[number]"},
                {"type": "process", "name": "svchost.exe"},
                {"type": "file_path", "name": "\\\\shared\\finance\\*.encrypted"},
                {"type": "user", "name": "[user_account]@neonharbour.hk"}
            ],
            false_positive_indicators=[
                "Legitimate file compression activity",
                "Scheduled backup encryption process",
                "Software update with file modifications",
                "Authorized data archival operation"
            ],
            genuine_threat_indicators=[
                "Rapid mass file encryption",
                "Ransom note creation",
                "Network share enumeration",
                "Process injection techniques"
            ],
            hkma_relevance="SA-2 Section 5.3 - Business continuity and ransomware resilience"
        ),
        
        ScenarioTemplate(
            scenario_type="ransomware_lateral_movement",
            attack_vector="Ransomware spreading across network",
            source="sentinel",
            severity="Critical",
            tactics=["LateralMovement", "Discovery", "Impact"],
            title_template="Ransomware lateral movement across network segments",
            description_template="Network monitoring detected suspicious lateral movement patterns "
                               "consistent with ransomware propagation. Multiple systems showing "
                               "similar encryption behaviors across different network segments.",
            default_entities=[
                {"type": "network", "name": "10.20.30.0/24"},
                {"type": "host", "name": "HK-SRV-[number]"},
                {"type": "service", "name": "SMB"},
                {"type": "credential", "name": "[service_account]"}
            ],
            false_positive_indicators=[
                "Scheduled system maintenance",
                "Software deployment across fleet",
                "Legitimate administrative tasks",
                "Backup system synchronization"
            ],
            genuine_threat_indicators=[
                "Credential dumping activity",
                "SMB enumeration patterns",
                "Privilege escalation attempts",
                "Encryption across multiple hosts"
            ],
            hkma_relevance="SA-2 Section 4.4 - Network segmentation and lateral movement prevention"
        ),
        
        # Insider Threat Scenarios
        ScenarioTemplate(
            scenario_type="insider_data_exfiltration",
            attack_vector="Unauthorized data access and download",
            source="sentinel",
            severity="High",
            tactics=["Collection", "Exfiltration"],
            title_template="Unusual data access patterns by privileged user",
            description_template="Privileged user account accessed unusually large volumes of "
                               "sensitive customer data outside normal business hours. "
                               "Pattern suggests potential data exfiltration attempt.",
            default_entities=[
                {"type": "user", "name": "[privileged_user]@neonharbour.hk"},
                {"type": "database", "name": "CustomerDB_Production"},
                {"type": "query", "name": "SELECT * FROM customer_accounts"},
                {"type": "volume", "name": "50,000 records"}
            ],
            false_positive_indicators=[
                "Authorized data analysis project",
                "Compliance audit data extraction",
                "System migration preparation",
                "Scheduled reporting process"
            ],
            genuine_threat_indicators=[
                "Access outside business hours",
                "Unusual query patterns",
                "Large volume data extraction",
                "No corresponding work authorization"
            ],
            hkma_relevance="SA-2 Section 6.2 - Privileged access monitoring and insider threat detection"
        ),
        
        ScenarioTemplate(
            scenario_type="insider_privilege_abuse",
            attack_vector="Abuse of administrative privileges",
            source="entra",
            severity="Medium",
            tactics=["PrivilegeEscalation", "Persistence"],
            title_template="Administrative privilege escalation outside approval process",
            description_template="System administrator granted elevated privileges to user account "
                               "without following standard approval workflow. Action performed "
                               "outside normal change management process.",
            default_entities=[
                {"type": "admin", "name": "[admin_user]@neonharbour.hk"},
                {"type": "target_user", "name": "[target_user]@neonharbour.hk"},
                {"type": "privilege", "name": "Domain Admin"},
                {"type": "system", "name": "Active Directory"}
            ],
            false_positive_indicators=[
                "Emergency access for critical issue",
                "Approved change with delayed documentation",
                "Temporary access for specific project",
                "Standard role assignment process"
            ],
            genuine_threat_indicators=[
                "No change management ticket",
                "Unusual timing of privilege grant",
                "Excessive permissions granted",
                "Lack of business justification"
            ],
            hkma_relevance="TM-G-1 Section 4.2 - Privileged access management controls"
        ),
        
        # Advanced Persistent Threat (APT) Scenarios
        ScenarioTemplate(
            scenario_type="apt_reconnaissance",
            attack_vector="Network reconnaissance and enumeration",
            source="crowdstrike",
            severity="Medium",
            tactics=["Discovery", "Reconnaissance"],
            title_template="Suspicious network reconnaissance activity detected",
            description_template="Endpoint detected unusual network scanning and enumeration "
                               "activities targeting internal infrastructure. Patterns consistent "
                               "with advanced persistent threat reconnaissance phase.",
            default_entities=[
                {"type": "host", "name": "HK-WS-[number]"},
                {"type": "process", "name": "powershell.exe"},
                {"type": "network_scan", "name": "10.20.0.0/16"},
                {"type": "ports", "name": "22,80,443,3389,5985"}
            ],
            false_positive_indicators=[
                "Authorized vulnerability scanning",
                "Network troubleshooting by IT",
                "Security assessment activity",
                "Infrastructure monitoring tools"
            ],
            genuine_threat_indicators=[
                "Unusual scanning patterns",
                "Targeting of critical systems",
                "Steganographic techniques",
                "Living-off-the-land tactics"
            ],
            hkma_relevance="SA-2 Section 4.1 - Network monitoring and threat detection"
        ),
        
        ScenarioTemplate(
            scenario_type="apt_persistence",
            attack_vector="Establishing persistent access mechanisms",
            source="defender",
            severity="High",
            tactics=["Persistence", "DefenseEvasion"],
            title_template="Suspicious persistence mechanism established",
            description_template="Advanced malware detected establishing multiple persistence "
                               "mechanisms including registry modifications, scheduled tasks, "
                               "and service installations designed to maintain long-term access.",
            default_entities=[
                {"type": "registry", "name": "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"},
                {"type": "task", "name": "SystemHealthCheck"},
                {"type": "service", "name": "WindowsUpdateService"},
                {"type": "file", "name": "C:\\Windows\\System32\\svchost32.exe"}
            ],
            false_positive_indicators=[
                "Legitimate software installation",
                "System update components",
                "Authorized monitoring tools",
                "Standard Windows services"
            ],
            genuine_threat_indicators=[
                "Suspicious file locations",
                "Unusual persistence combinations",
                "Masquerading as system processes",
                "Encrypted communication channels"
            ],
            hkma_relevance="SA-2 Section 4.3 - Endpoint protection and advanced threat detection"
        ),
        
        # Cloud Security Scenarios
        ScenarioTemplate(
            scenario_type="cloud_credential_compromise",
            attack_vector="Compromised cloud service credentials",
            source="guardduty",
            severity="High",
            tactics=["InitialAccess", "CredentialAccess", "Discovery"],
            title_template="Suspicious AWS API activity from compromised credentials",
            description_template="GuardDuty detected unusual AWS API calls from service account "
                               "credentials. Activity includes resource enumeration and privilege "
                               "escalation attempts from unexpected geographic locations.",
            default_entities=[
                {"type": "aws_user", "name": "[service_account]"},
                {"type": "source_ip", "name": "[suspicious_ip]"},
                {"type": "api_calls", "name": "DescribeInstances, ListUsers, GetPolicy"},
                {"type": "region", "name": "ap-southeast-1"}
            ],
            false_positive_indicators=[
                "Authorized cloud administration",
                "Scheduled automation scripts",
                "Legitimate DevOps activities",
                "Approved third-party integrations"
            ],
            genuine_threat_indicators=[
                "Unusual geographic source",
                "Privilege escalation attempts",
                "Resource enumeration patterns",
                "Credential stuffing indicators"
            ],
            hkma_relevance="SA-2 Section 7.1 - Cloud security and access controls"
        ),
        
        # Compliance and Regulatory Scenarios
        ScenarioTemplate(
            scenario_type="data_privacy_violation",
            attack_vector="Unauthorized personal data access",
            source="sentinel",
            severity="Medium",
            tactics=["Collection", "Impact"],
            title_template="Potential personal data privacy violation detected",
            description_template="System detected unauthorized access to customer personal data "
                               "repository. Access patterns suggest potential violation of Hong Kong "
                               "Personal Data Privacy Ordinance requirements.",
            default_entities=[
                {"type": "user", "name": "[user_account]@neonharbour.hk"},
                {"type": "database", "name": "CustomerPII_Database"},
                {"type": "data_type", "name": "HKID, Phone, Address"},
                {"type": "access_count", "name": "1,250 records"}
            ],
            false_positive_indicators=[
                "Authorized customer service access",
                "Compliance audit activities",
                "Legitimate business process",
                "Approved data analytics project"
            ],
            genuine_threat_indicators=[
                "Excessive data access volume",
                "No business justification",
                "Access outside role permissions",
                "Potential data harvesting pattern"
            ],
            hkma_relevance="PDPO compliance and SA-2 Section 6.1 - Data protection controls"
        )
    ]