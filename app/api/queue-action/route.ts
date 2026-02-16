import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)
const NODE_BIN = process.execPath

// Check if worker is already running via lock file
function isWorkerRunning(): boolean {
  const lockFile = path.join(process.cwd(), 'queue-worker.lock')
  if (!fs.existsSync(lockFile)) return false
  try {
    const pid = parseInt(fs.readFileSync(lockFile, 'utf-8').trim(), 10)
    if (isNaN(pid)) return false
    process.kill(pid, 0) // throws if process doesn't exist
    return true
  } catch {
    // Process not running, clean up stale lock
    try { fs.unlinkSync(lockFile) } catch {}
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, payload } = await request.json()
    
    // Path to our local queue worker script
    const workerScript = path.join(process.cwd(), 'scripts', 'queue-worker.js')
    
    let command: string
    let message: string
    
    switch (action) {
      case 'populate':
        command = `"${NODE_BIN}" "${workerScript}" load-github`
        message = 'GitHub issues loaded into queue'
        break
      case 'process-one':
        if (isWorkerRunning()) {
          return NextResponse.json({
            success: false,
            action,
            message: 'Worker is already running. Wait for it to finish or stop it first.'
          }, { status: 409 })
        }
        command = `"${NODE_BIN}" "${workerScript}" process`
        message = 'Processing started with Ollama Llama 3.1 70B'
        break
      case 'cleanup':
        command = `"${NODE_BIN}" "${workerScript}" cleanup`
        message = 'Completed items cleaned up'
        break
      case 'status':
        command = `"${NODE_BIN}" "${workerScript}" status`
        message = 'Queue status retrieved'
        break
      case 'remove':
        if (!payload?.issueNumber) {
          return NextResponse.json({ error: 'Missing issueNumber' }, { status: 400 })
        }
        command = `"${NODE_BIN}" "${workerScript}" remove ${parseInt(payload.issueNumber)}`
        message = `Issue #${payload.issueNumber} removed from queue`
        break
      case 'retry':
        if (!payload?.issueNumber) {
          return NextResponse.json({ error: 'Missing issueNumber' }, { status: 400 })
        }
        command = `"${NODE_BIN}" "${workerScript}" retry ${parseInt(payload.issueNumber)}`
        message = `Issue #${payload.issueNumber} moved back to queue for retry`
        break
      case 'clear-all':
        command = `"${NODE_BIN}" "${workerScript}" clear-all`
        message = 'All queued items cleared'
        break
      case 'clear-history':
        command = `"${NODE_BIN}" "${workerScript}" clear-history`
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