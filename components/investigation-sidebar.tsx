"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Clock, User } from "lucide-react"

interface Alert {
  id: number
  title: string
  severity: string
  time: string
  analyst: string
  status: string
}

interface InvestigationSidebarProps {
  alerts: Alert[]
  selectedAlert: Alert
  onSelectAlert: (alert: Alert) => void
}

const planningQuestions = [
  "What was the latest alert activity s...",
  "Are there tickets related to the sessi...",
  "Do any of the user session actions e...",
  "Is there any internal investigation re...",
  "How often does the EC2 workload i...",
  "Did AWS-AUTOMATION-ROLE assu...",
  "Did AWS-AUTOMATION-ROLE assu...",
  "What department or user owns this...",
]

export function InvestigationSidebar({ alerts, selectedAlert, onSelectAlert }: InvestigationSidebarProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Planning Section */}
      <div>
        <h3 className="text-lg font-semibold text-sidebar-foreground mb-4">Planning</h3>
        <div className="space-y-2">
          {planningQuestions.map((question, index) => (
            <Button
              key={index}
              variant="ghost"
              className={`w-full text-left justify-start h-auto p-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent ${
                index === 0 ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""
              }`}
            >
              {question}
            </Button>
          ))}
        </div>
      </div>

      {/* Respond Section */}
      <div>
        <h3 className="text-lg font-semibold text-sidebar-foreground mb-4">Respond</h3>
        <div className="space-y-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-yellow-400 font-medium">Address vulnerability CVE-2015 18935</p>
                <p className="text-xs text-muted-foreground mt-1">(CVSS 9.9, RCE) by updating to</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-yellow-400 font-medium">Revoke active sessions involving</p>
                <p className="text-xs text-muted-foreground mt-1">arn:aws:sts::819802345888:assumed-role/</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Alerts */}
      <div>
        <h3 className="text-lg font-semibold text-sidebar-foreground mb-4">Recent Alerts</h3>
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`cursor-pointer transition-colors ${
                selectedAlert.id === alert.id
                  ? "bg-sidebar-accent border-sidebar-primary"
                  : "hover:bg-sidebar-accent/50"
              }`}
              onClick={() => onSelectAlert(alert)}
            >
              <CardContent className="p-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <Badge
                      variant="secondary"
                      className={
                        alert.severity === "high"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : alert.severity === "medium"
                            ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                            : "bg-green-500/10 text-green-400 border-green-500/20"
                      }
                    >
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-medium text-sidebar-foreground line-clamp-2">{alert.title}</h4>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {alert.time}
                    </span>
                    <span className="flex items-center">
                      <User className="h-3 w-3 mr-1" />
                      {alert.analyst}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
