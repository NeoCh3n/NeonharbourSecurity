import { NextResponse } from 'next/server'

export async function GET() {
  // Mock investigations data
  const mockInvestigations = [
    {
      id: "inv-001",
      title: "Suspicious Login Activity",
      status: "active",
      priority: "high", 
      assignee: "John Doe",
      createdAt: "2024-01-07T10:30:00Z",
      updatedAt: "2024-01-07T11:15:00Z",
      alertCount: 3,
      source: "Microsoft Defender",
      description: "Multiple failed login attempts from unusual geographic locations"
    },
    {
      id: "inv-002",
      title: "Malware Detection Investigation", 
      status: "resolved",
      priority: "critical",
      assignee: "Jane Smith",
      createdAt: "2024-01-07T09:15:00Z",
      updatedAt: "2024-01-07T10:45:00Z",
      alertCount: 1,
      source: "CrowdStrike",
      description: "Ransomware activity detected and contained on endpoint"
    },
    {
      id: "inv-003",
      title: "Data Exfiltration Analysis",
      status: "resolved",
      priority: "medium",
      assignee: "Mike Johnson", 
      createdAt: "2024-01-07T08:45:00Z",
      updatedAt: "2024-01-07T09:30:00Z",
      alertCount: 2,
      source: "Splunk",
      description: "Unusual data transfer patterns investigated and cleared"
    },
    {
      id: "inv-004",
      title: "Privilege Escalation Event",
      status: "investigating",
      priority: "high",
      assignee: "Sarah Wilson",
      createdAt: "2024-01-07T07:20:00Z", 
      updatedAt: "2024-01-07T08:10:00Z",
      alertCount: 4,
      source: "Microsoft Sentinel",
      description: "Unauthorized privilege escalation in Active Directory under review"
    },
    {
      id: "inv-005",
      title: "Network Anomaly Detection",
      status: "pending",
      priority: "low",
      assignee: "Unassigned",
      createdAt: "2024-01-07T06:00:00Z",
      updatedAt: "2024-01-07T06:00:00Z", 
      alertCount: 1,
      source: "Network Monitor",
      description: "Unusual network traffic patterns detected, awaiting analysis"
    }
  ]

  return NextResponse.json(mockInvestigations)
}