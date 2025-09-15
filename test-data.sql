-- Quick test data for web UI testing
-- Run this in your database to create sample alerts

INSERT INTO alerts (
  source, status, summary, severity, category, 
  action, technique, tactic, confidence, 
  principal, asset, entities, tenant_id
) VALUES 
(
  'EDR System', 'new', 'Suspicious PowerShell execution detected', 'high', 'malware',
  'process_execution', 'T1059.001', 'execution', 0.85,
  '{"user": "john.doe", "domain": "corp.local"}',
  '{"hostname": "WORKSTATION-01", "ip": "192.168.1.100"}',
  '{"processes": ["powershell.exe"], "files": ["suspicious.ps1"]}',
  1
),
(
  'Network Monitor', 'new', 'Unusual outbound connection to suspicious domain', 'medium', 'network',
  'network_connection', 'T1071.001', 'command_and_control', 0.75,
  '{"process": "chrome.exe", "pid": 1234}',
  '{"hostname": "LAPTOP-02", "ip": "192.168.1.101"}',
  '{"domains": ["malicious-site.com"], "ips": ["203.0.113.42"]}',
  1
),
(
  'Email Security', 'new', 'Phishing email with malicious attachment', 'critical', 'phishing',
  'email_delivery', 'T1566.001', 'initial_access', 0.95,
  '{"sender": "attacker@evil.com", "recipient": "victim@corp.local"}',
  '{"email_server": "mail.corp.local"}',
  '{"attachments": ["invoice.exe"], "subjects": ["Urgent Payment Required"]}',
  1
);