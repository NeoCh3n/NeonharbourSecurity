"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, ThumbsUp, ThumbsDown, Send } from "lucide-react"

export function FeedbackPanel() {
  const [feedback, setFeedback] = useState("")
  const [rating, setRating] = useState<"positive" | "negative" | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (feedback.trim()) {
      setSubmitted(true)
      // In a real app, this would send feedback to the backend
      setTimeout(() => {
        setSubmitted(false)
        setFeedback("")
        setRating(null)
      }, 2000)
    }
  }

  if (submitted) {
    return (
      <Card className="fixed bottom-6 right-6 w-80 bg-green-500/10 border-green-500/20">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2 text-green-400">
            <MessageSquare className="h-4 w-4" />
            <span className="text-sm font-medium">Feedback submitted successfully!</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="fixed bottom-6 right-6 w-80 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-sm">
          <MessageSquare className="h-4 w-4" />
          <span>Feedback</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Rate this investigation:</span>
          <Button
            variant={rating === "positive" ? "default" : "outline"}
            size="sm"
            onClick={() => setRating("positive")}
          >
            <ThumbsUp className="h-3 w-3" />
          </Button>
          <Button
            variant={rating === "negative" ? "default" : "outline"}
            size="sm"
            onClick={() => setRating("negative")}
          >
            <ThumbsDown className="h-3 w-3" />
          </Button>
        </div>

        <Textarea
          placeholder="Share your thoughts on this investigation..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="min-h-20 resize-none"
        />

        <Button onClick={handleSubmit} disabled={!feedback.trim()} className="w-full" size="sm">
          <Send className="h-3 w-3 mr-2" />
          Send Feedback
        </Button>
      </CardContent>
    </Card>
  )
}
