import { NextResponse } from 'next/server'

export async function GET() {
  // Mock planner data
  const mockPlanner = {
    currentInvestigation: {
      id: "inv-001",
      title: "Suspicious Login Activity Investigation",
      status: "active",
      priority: "high",
      assignee: "SOC Analyst",
      createdAt: "2024-01-07T10:30:00Z"
    },
    tasks: [
      {
        id: "task-001",
        title: "Analyze login patterns",
        status: "completed",
        priority: "high",
        estimatedTime: "15 min"
      },
      {
        id: "task-002", 
        title: "Check user behavior analytics",
        status: "in-progress",
        priority: "medium",
        estimatedTime: "20 min"
      },
      {
        id: "task-003",
        title: "Review network logs",
        status: "pending",
        priority: "medium",
        estimatedTime: "25 min"
      },
      {
        id: "task-004",
        title: "Correlate with threat intelligence",
        status: "pending", 
        priority: "low",
        estimatedTime: "30 min"
      }
    ],
    recommendations: [
      "Enable MFA for affected accounts",
      "Block suspicious IP addresses",
      "Review access policies",
      "Notify security team"
    ]
  }

  return NextResponse.json(mockPlanner)
}