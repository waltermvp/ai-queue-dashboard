import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(request: NextRequest) {
  try {
    const queueStatePath = join(
      process.env.HOME || '',
      'Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/work/ai-queue/queue-state.json'
    )
    
    const data = await readFile(queueStatePath, 'utf-8')
    const queueState = JSON.parse(data)
    
    return NextResponse.json(queueState)
  } catch (error) {
    console.error('Error reading queue state:', error)
    
    // Return default empty state if file doesn't exist
    const defaultState = {
      current_issue: null,
      processing: false,
      completed: [],
      failed: [],
      queue: []
    }
    
    return NextResponse.json(defaultState)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    // For now, just return success - the actual implementation would
    // call the bash scripts to perform the actions
    return NextResponse.json({ success: true, action })
  } catch (error) {
    console.error('Error updating queue state:', error)
    return NextResponse.json({ error: 'Failed to update queue state' }, { status: 500 })
  }
}