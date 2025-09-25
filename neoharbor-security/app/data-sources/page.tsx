"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Cloud, Database, Shield, Zap } from "lucide-react"

const dataSources = [
  {
    id: "aws",
    name: "Amazon Web Services",
    description: "Connect to AWS CloudTrail, GuardDuty, and Security Hub for comprehensive cloud security monitoring",
    icon: Cloud,
    status: "available",
    features: ["CloudTrail Logs", "GuardDuty Findings", "Security Hub", "IAM Analysis"],
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    description: "Integrate with Azure Security Center and Sentinel for enterprise security insights",
    icon: Shield,
    status: "coming-soon",
    features: ["Security Center", "Sentinel SIEM", "Activity Logs", "Defender"],
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  {
    id: "gcp",
    name: "Google Cloud Platform",
    description: "Monitor GCP Security Command Center and Cloud Logging for threat detection",
    icon: Database,
    status: "coming-soon",
    features: ["Security Command Center", "Cloud Logging", "Cloud Audit", "Chronicle"],
    color: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  {
    id: "on-premise",
    name: "On-Premise SIEM",
    description: "Connect to Splunk, QRadar, and other enterprise SIEM solutions",
    icon: Zap,
    status: "coming-soon",
    features: ["Splunk Integration", "QRadar Connector", "Custom APIs", "Log Forwarding"],
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
]

export default function DataSourcesPage() {
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const router = useRouter()

  const handleConnect = (sourceId: string) => {
    if (sourceId === "aws") {
      router.push("/dashboard")
    }
  }

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
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-foreground mb-4">Connect Your Data Sources</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose your security data sources to begin advanced threat investigation and analysis
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {dataSources.map((source) => {
              const Icon = source.icon
              const isAvailable = source.status === "available"
              const isSelected = selectedSource === source.id

              return (
                <Card
                  key={source.id}
                  className={`relative transition-all duration-200 cursor-pointer hover:shadow-lg ${
                    isSelected ? "ring-2 ring-primary" : ""
                  } ${!isAvailable ? "opacity-60" : ""}`}
                  onClick={() => isAvailable && setSelectedSource(source.id)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${source.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        {isAvailable ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">
                            Available
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                            Coming Soon
                          </Badge>
                        )}
                        {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                      </div>
                    </div>
                    <CardTitle className="text-xl">{source.name}</CardTitle>
                    <CardDescription className="text-muted-foreground">{source.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-foreground">Key Features:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {source.features.map((feature, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                            <span className="text-sm text-muted-foreground">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {selectedSource && (
            <div className="mt-8 text-center">
              <Button size="lg" onClick={() => handleConnect(selectedSource)} className="px-8 py-3 text-lg">
                Connect to {dataSources.find((s) => s.id === selectedSource)?.name}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
