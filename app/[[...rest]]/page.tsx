"use client"

import { SignIn, SignedIn, SignedOut, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function CatchAllPage() {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/data-sources")
    }
  }, [isSignedIn, isLoaded, router])

  return (
    <>
      <SignedIn>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">NeoHarbor Security</h1>
              <p className="text-muted-foreground">Advanced Security Investigation Platform</p>
            </div>
            <SignIn
              routing="hash"
              appearance={{
                elements: {
                  rootBox: "mx-auto",
                  card: "bg-card border border-border shadow-lg",
                },
              }}
            />
          </div>
        </div>
      </SignedOut>
    </>
  )
}