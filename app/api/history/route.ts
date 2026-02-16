import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

const NODE_BIN = process.execPath
const DB_API = path.join(process.cwd(), 'scripts', 'db-api.js')

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') || '50'
    const offset = searchParams.get('offset') || '0'
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const command = searchParams.get('command') || 'history'

    // Validate inputs to prevent injection
    const validCommands = ['history', 'stats', 'run']
    if (!validCommands.includes(command)) {
      return NextResponse.json({ error: 'Invalid command' }, { status: 400 })
    }

    const parsedLimit = parseInt(limit, 10)
    const parsedOffset = parseInt(offset, 10)
    if (isNaN(parsedLimit) || isNaN(parsedOffset) || parsedLimit < 0 || parsedOffset < 0) {
      return NextResponse.json({ error: 'Invalid limit or offset' }, { status: 400 })
    }

    // Build args array (no shell interpretation with execFileSync)
    const args: string[] = [DB_API]
    if (command === 'history') {
      args.push('history', '--limit', String(parsedLimit), '--offset', String(parsedOffset))
      if (type && /^[a-zA-Z0-9_-]+$/.test(type)) args.push('--type', type)
      if (status && /^[a-zA-Z0-9_-]+$/.test(status)) args.push('--status', status)
    } else if (command === 'stats') {
      args.push('stats')
    } else if (command === 'run') {
      const id = searchParams.get('id')
      if (id && /^[a-zA-Z0-9_-]+$/.test(id)) {
        args.push('run', id)
      } else {
        return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
      }
    }

    const result = execFileSync(NODE_BIN, args, {
      timeout: 5000,
      encoding: 'utf-8'
    })

    return NextResponse.json(JSON.parse(result))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
