import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const { action, payload } = await request.json()
    
    // Path to our local queue worker script
    const workerScript = path.join(process.cwd(), 'scripts', 'queue-worker.js')
    
    let command: string
    let message: string
    
    switch (action) {
      case 'populate':
        command = `node "${workerScript}" load-github`
        message = 'GitHub issues loaded into queue'
        break
      case 'process-one':
        command = `node "${workerScript}" process`
        message = 'Processing started with Ollama Llama 3.1 70B'
        break
      case 'cleanup':
        command = `node "${workerScript}" cleanup`
        message = 'Completed items cleaned up'
        break
      case 'status':
        command = `node "${workerScript}" status`
        message = 'Queue status retrieved'
        break
      case 'remove':
        if (!payload?.issueNumber) {
          return NextResponse.json({ error: 'Missing issueNumber' }, { status: 400 })
        }
        command = `node "${workerScript}" remove ${parseInt(payload.issueNumber)}`
        message = `Issue #${payload.issueNumber} removed from queue`
        break
      case 'clear-all':
        command = `node "${workerScript}" clear-all`
        message = 'All queued items cleared'
        break
      case 'clear-history':
        command = `node "${workerScript}" clear-history`
        message = 'Completed and failed history cleared'
        break
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    
    console.log('🚀 Executing:', command)
    
    // For process-one, run in background since Ollama processing takes time
    if (action === 'process-one') {
      execAsync(command).then(({ stdout }) => {
        console.log('✅ Processing completed:', stdout)
      }).catch(error => {
        console.error('❌ Background processing error:', error)
      })
      
      return NextResponse.json({ 
        success: true, 
        action,
        message: 'Processing started with Llama 3.1 70B model...'
      })
    }
    
    const { stdout, stderr } = await execAsync(command)
    
    return NextResponse.json({ 
      success: true, 
      action,
      output: stdout,
      message,
      error: stderr
    })
  } catch (error) {
    console.error('❌ Error executing action:', error)
    return NextResponse.json({ 
      error: 'Failed to execute action',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}