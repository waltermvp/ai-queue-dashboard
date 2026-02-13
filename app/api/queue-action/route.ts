import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()
    
    const scriptPath = process.env.HOME + '/.openclaw/workspace/ai-issue-queue-processor.sh'
    
    let command: string
    
    switch (action) {
      case 'populate':
        command = `bash "${scriptPath}" populate`
        break
      case 'process-one':
        command = `bash "${scriptPath}" process-one`
        break
      case 'cleanup':
        command = `bash "${scriptPath}" cleanup`
        break
      case 'status':
        command = `bash "${scriptPath}" status`
        break
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    
    console.log('Executing command:', command)
    
    // For process-one, we want to run it in the background since it takes time
    if (action === 'process-one') {
      // Don't await this - let it run in background
      execAsync(command).catch(error => {
        console.error('Background process error:', error)
      })
      
      return NextResponse.json({ 
        success: true, 
        action,
        message: 'Processing started in background'
      })
    }
    
    const { stdout, stderr } = await execAsync(command)
    
    return NextResponse.json({ 
      success: true, 
      action,
      output: stdout,
      error: stderr
    })
  } catch (error) {
    console.error('Error executing action:', error)
    return NextResponse.json({ 
      error: 'Failed to execute action',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}