"use client"

import { useState } from "react"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Shield,
  Menu,
  ChevronLeft,
  AlertTriangle,
  Clock,
  TrendingUp,
  Activity,
  BarChart3,
  Settings,
} from "lucide-react"
import { SecurityChart } from "@/components/security-chart"
import { InvestigationSidebar } from "@/components/investigation-sidebar"
import { FeedbackPanel } from "@/components/feedback-panel"

const mockAlerts = [
  {
    id: 1,
    title: "Suspicious privilege escalation by AWS-AUTOMATION",
    severity: "high",
    time: "2 hours ago",
    analyst: "Alex Chen",
    status: "investigating",
  },
  {
    id: 2,
    title: "Unusual API access pattern detected",
    severity: "medium",
    time: "4 hours ago",
    analyst: "Sarah Kim",
    status: "triaged",
  },
  {
    id: 3,
    title: "Failed authentication attempts from unknown IP",
    severity: "low",
    time: "6 hours ago",
    analyst: "Mike Johnson",
    status: "resolved",
  },
]

export default function DashboardPage() {
  const [selectedAlert, setSelectedAlert] = useState(mockAlerts[0])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div
        className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-80"
        }`}
      >
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-2">
                <Shield className="h-6 w-6 text-sidebar-primary" />
                <h1 className="text-lg font-bold text-sidebar-foreground">NeoHarbor Security</h1>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <InvestigationSidebar alerts={mockAlerts} selectedAlert={selectedAlert} onSelectAlert={setSelectedAlert} />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card/50 backdrop-blur-sm border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{selectedAlert.title}</h2>
                <div className="flex items-center space-x-4 mt-1">
                  <Badge
                    variant={selectedAlert.severity === "high" ? "destructive" : "secondary"}
                    className={
                      selectedAlert.severity === "high"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : selectedAlert.severity === "medium"
                          ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          : "bg-green-500/10 text-green-400 border-green-500/20"
                    }
                  >
                    {selectedAlert.severity.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {selectedAlert.time}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="bg-muted">
              <TabsTrigger value="overview" className="flex items-center space-x-2">
                <Activity className="h-4 w-4" />
                <span>Overview</span>
              </TabsTrigger>
              <TabsTrigger value="intuitions" className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4" />
                <span>Intuitions</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>Timeline</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-6">
              {/* Main Content */}
              <div className="flex-1 space-y-6">
                <TabsContent value="overview" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <span>1</span>
                        <span>What happened during the user session?</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground">
                        NeoHarbor Security identified actions associate @fhlohegsescalation on the EC2 instance
                        i-008b13186bc8b2227
                      </p>
                      <p className="text-muted-foreground">- using the attached instance profile,</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2">
                        <span>2</span>
                        <span>What access abuse user sections?</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground mb-4">What happened during the user session?</p>
                      <p className="text-muted-foreground mb-4">
                        What actions and services did this user interact with during the session?
                      </p>

                      <div className="bg-card p-4 rounded-lg border">
                        <h4 className="font-medium mb-3">
                          Do any of the user session actions represent potential data theft
                        </h4>
                        <SecurityChart />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Respond</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-400 mb-2">Address vulnerability CVE-2015 18935</h4>
                              <p className="text-sm text-muted-foreground">
                                (CVSS 9.9, RCE) by updating to version+-802011.14 on EC2 instance - 600bf5189b23227
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-400 mb-2">Address vulnerability CVE-2019 18665</h4>
                              <p className="text-sm text-muted-foreground">
                                (CVSs 8 RCE) by updating to version+-802011.14 on EC2 instance - 600bf5189b23227
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-400 mb-2">Revoke active sessions involving</h4>
                              <p className="text-sm text-muted-foreground">
                                arn:aws:sts::819802345888:assumed-role/AWS_AUTOMATION_ROLE1 6085/5i
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-yellow-400 mb-2">Revoke active sessions involving</h4>
                              <p className="text-sm text-muted-foreground">
                                arn:aws:sts::181532548095:assumed-role/AWS_AUTOMATION_ROLE1 6085/5i
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="intuitions">
                  <Card>
                    <CardHeader>
                      <CardTitle>AI-Powered Security Insights</CardTitle>
                      <CardDescription>Advanced analysis and threat intelligence recommendations</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Intuitions analysis coming soon...</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="timeline">
                  <Card>
                    <CardHeader>
                      <CardTitle>Investigation Timeline</CardTitle>
                      <CardDescription>Chronological view of security events and actions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">Timeline view coming soon...</p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>

              {/* Right Sidebar */}
              <div className="w-80 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <BarChart3 className="h-4 w-4" />
                      <span>Fields</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Analyst</label>
                        <p className="text-sm text-foreground">{selectedAlert.analyst}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Time</label>
                        <p className="text-sm text-foreground">{selectedAlert.time}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                        <p className="text-sm text-foreground">1 hour ago</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Determination</label>
                        <p className="text-sm text-foreground">Under Investigation</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Severity</label>
                        <Badge
                          variant={selectedAlert.severity === "high" ? "destructive" : "secondary"}
                          className={
                            selectedAlert.severity === "high"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          }
                        >
                          {selectedAlert.severity.toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Impacted Entities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Source</label>
                      <p className="text-sm text-foreground">AWS CloudTrail</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Alert Time</label>
                      <p className="text-sm text-foreground">2024-01-15 14:32:15 UTC</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>IOCs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">No indicators of compromise detected</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Audit Log</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Investigation audit trail</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Feedback Panel */}
      <FeedbackPanel />
    </div>
  )
}
