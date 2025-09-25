import { NextResponse } from 'next/server'

export async function GET() {
  // Mock timeline data
  const mockTimeline = [
    {
      id: "event-001",
      timestamp: "2024-01-07T10:30:00Z",
      type: "alert",
      title: "Initial Alert Triggered",
      description: "Suspicious login activity detected from IP 192.168.1.100",
      severity: "high",
      source: "Microsoft Defender"
    },
    {
      id: "event-002",
      timestamp: "2024-01-07T10:32:00Z", 
      type: "investigation",
      title: "Investigation Started",
      description: "SOC analyst began investigating the suspicious login activity",
      severity: "info",
      source: "NeoHarbor Security"
    },
    {
      id: "event-003",
      timestamp: "2024-01-07T10:35:00Z",
      type: "evidence",
      title: "Evidence Collected",
      description: "Login logs and user behavior data collected for analysis",
      severity: "info", 
      source: "Data Collection Agent"
    },
    {
      id: "event-004",
      timestamp: "2024-01-07T10:40:00Z",
      type: "analysis",
      title: "Pattern Analysis Complete",
      description: "AI analysis identified anomalous login patterns consistent with credential stuffing attack",
      severity: "medium",
      source: "AI Analysis Engine"
    },
    {
      id: "event-005",
      timestamp: "2024-01-07T10:45:00Z",
      type: "action",
      title: "Containment Action",
      description: "Suspicious IP addresses blocked and affected accounts flagged for MFA enforcement",
      severity: "info",
      source: "Automated Response"
    }
  ]

  return NextResponse.json(mockTimeline)
}