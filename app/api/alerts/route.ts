import { NextResponse } from 'next/server'

export async function GET() {
  // Mock alerts data
  const mockAlerts = [
    {
      id: "alert-001",
      title: "Suspicious Login Activity",
      severity: "high",
      source: "Microsoft Defender",
      timestamp: "2024-01-07T10:30:00Z",
      status: "investigating",
      description: "Multiple failed login attempts detected from unusual geographic location"
    },
    {
      id: "alert-002", 
      title: "Malware Detection",
      severity: "critical",
      source: "CrowdStrike",
      timestamp: "2024-01-07T09:15:00Z",
      status: "contained",
      description: "Potential ransomware activity detected on endpoint"
    },
    {
      id: "alert-003",
      title: "Data Exfiltration Attempt",
      severity: "medium",
      source: "Splunk",
      timestamp: "2024-01-07T08:45:00Z", 
      status: "resolved",
      description: "Unusual data transfer patterns detected"
    },
    {
      id: "alert-004",
      title: "Privilege Escalation",
      severity: "high",
      source: "Microsoft Sentinel",
      timestamp: "2024-01-07T07:20:00Z",
      status: "investigating",
      description: "Unauthorized privilege escalation detected in Active Directory"
    }
  ]

  return NextResponse.json(mockAlerts)
}