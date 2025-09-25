"use client"

import { useState } from "react"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Shield, Search, Filter, Plus, Clock, User, AlertTriangle, CheckCircle } from "lucide-react"

const investigations = [
  {
    id: "INV-001",
    title: "Suspicious privilege escalation by AWS-AUTOMATION",
    severity: "high",
    status: "investigating",
    analyst: "Alex Chen",
    created: "2024-01-15 14:32:15",
    updated: "2 hours ago",
    source: "AWS CloudTrail",
    entities: ["EC2 Instance", "IAM Role", "API Gateway"],
  },
  {
    id: "INV-002",
    title: "Unusual API access pattern detected",
    severity: "medium",
    status: "triaged",
    analyst: "Sarah Kim",
    created: "2024-01-15 10:15:30",
    updated: "4 hours ago",
    source: "AWS CloudWatch",
    entities: ["API Gateway", "Lambda Function"],
  },
  {
    id: "INV-003",
    title: "Failed authentication attempts from unknown IP",
    severity: "low",
    status: "resolved",
    analyst: "Mike Johnson",
    created: "2024-01-15 08:45:22",
    updated: "6 hours ago",
    source: "AWS CloudTrail",
    entities: ["IAM User", "IP Address"],
  },
  {
    id: "INV-004",
    title: "Data exfiltration attempt detected",
    severity: "critical",
    status: "investigating",
    analyst: "Emma Davis",
    created: "2024-01-15 16:20:10",
    updated: "30 minutes ago",
    source: "AWS GuardDuty",
    entities: ["S3 Bucket", "EC2 Instance", "Network Interface"],
  },
]

const statusColors = {
  investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  triaged: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  resolved: "bg-green-500/10 text-green-400 border-green-500/20",
  closed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
}

const severityColors = {
  critical: "bg-red-600/10 text-red-400 border-red-600/20",
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-green-500/10 text-green-400 border-green-500/20",
}

export default function InvestigationsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")

  const filteredInvestigations = investigations.filter((inv) => {
    const matchesSearch =
      inv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = selectedStatus === "all" || inv.status === selectedStatus
    return matchesSearch && matchesStatus
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Shield className="h-8 w-8 text-primary" />
                <h1 className="text-2xl font-bold text-foreground">NeoHarbor Security</h1>
              </div>
            </div>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-10 w-10",
                },
              }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Investigations</h2>
              <p className="text-muted-foreground mt-1">
                Manage and track security investigations across your infrastructure
              </p>
            </div>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>New Investigation</span>
            </Button>
          </div>

          {/* Filters and Search */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search investigations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-background border border-border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="investigating">Investigating</option>
                    <option value="triaged">Triaged</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investigations List */}
          <div className="space-y-4">
            {filteredInvestigations.map((investigation) => (
              <Card key={investigation.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-foreground">{investigation.title}</h3>
                        <Badge
                          variant="secondary"
                          className={severityColors[investigation.severity as keyof typeof severityColors]}
                        >
                          {investigation.severity.toUpperCase()}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={statusColors[investigation.status as keyof typeof statusColors]}
                        >
                          {investigation.status.toUpperCase()}
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                        <span className="flex items-center space-x-1">
                          <span className="font-medium">ID:</span>
                          <span>{investigation.id}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <User className="h-3 w-3" />
                          <span>{investigation.analyst}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>Updated {investigation.updated}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <span className="font-medium">Source:</span>
                          <span>{investigation.source}</span>
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">Entities:</span>
                        <div className="flex items-center space-x-2">
                          {investigation.entities.map((entity, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {entity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {investigation.status === "investigating" && <AlertTriangle className="h-5 w-5 text-blue-400" />}
                      {investigation.status === "resolved" && <CheckCircle className="h-5 w-5 text-green-400" />}
                      {investigation.status === "triaged" && <Clock className="h-5 w-5 text-yellow-400" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredInvestigations.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No investigations found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search criteria or create a new investigation.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
