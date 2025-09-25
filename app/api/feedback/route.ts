import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Mock feedback processing
    console.log('Feedback received:', body)
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    return NextResponse.json({ 
      success: true, 
      message: 'Feedback submitted successfully',
      id: `feedback-${Date.now()}`
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}