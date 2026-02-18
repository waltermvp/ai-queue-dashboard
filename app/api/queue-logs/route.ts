import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const LOG_FILE = process.env.QUEUE_LOG_FILE || '/tmp/queue-worker.log'

export async function GET() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return NextResponse.json({ lines: [] })
    }
    const content = fs.readFileSync(LOG_FILE, 'utf8')
    const allLines = content.split('\n').filter(Boolean)
    const lines = allLines.slice(-100)
    return NextResponse.json({ lines })
  } catch (error) {
    return NextResponse.json({ lines: [], error: String(error) }, { status: 500 })
  }
}
