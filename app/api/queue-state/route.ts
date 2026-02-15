import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(request: NextRequest) {
  try {
    // Read from local queue-state.json file  
    const queueStatePath = join(process.cwd(), 'queue-state.json')
    
    const data = await readFile(queueStatePath, 'utf-8')
    const queueState = JSON.parse(data)
    
    // Ensure all required arrays exist to prevent frontend crashes
    if (!queueState.queue) queueState.queue = []
    if (!queueState.completed) queueState.completed = []
    if (!queueState.failed) queueState.failed = []
    
    return NextResponse.json(queueState)
  } catch (error) {
    console.error('Error reading queue state:', error)
    
    // Return default empty state if file doesn't exist
    const defaultState = {
      processing: null,
      completed: [],
      failed: [],
      queue: [
        { id: 'demo-1', title: 'Sample Task 1', priority: 'high', created_at: new Date().toISOString() },
        { id: 'demo-2', title: 'Sample Task 2', priority: 'medium', created_at: new Date().toISOString() }
      ]
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