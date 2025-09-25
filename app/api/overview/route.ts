import { NextResponse } from 'next/server'

export async function GET() {
  // Mock overview data
  const mockData = {
    totalAlerts: 247,
    criticalAlerts: 12,
    resolvedToday: 18,
    avgResponseTime: "4.2 min",
    trends: {
      alerts: [
        { date: "2024-01-01", count: 45 },
        { date: "2024-01-02", count: 52 },
        { date: "2024-01-03", count: 38 },
        { date: "2024-01-04", count: 61 },
        { date: "2024-01-05", count: 47 },
        { date: "2024-01-06", count: 55 },
        { date: "2024-01-07", count: 49 }
      ]
    }
  }

  return NextResponse.json(mockData)
}