import { NextRequest, NextResponse } from 'next/server'
import { readFile, stat } from 'fs/promises'
import path from 'path'

const ARTIFACTS_DIR = path.join(process.cwd(), 'artifacts')

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.log': 'text/plain',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path
  const filePath = path.join(ARTIFACTS_DIR, ...segments)

  // Prevent directory traversal
  if (!filePath.startsWith(ARTIFACTS_DIR)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await stat(filePath)
    const data = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': ext === '.mp4' ? 'inline' : `inline; filename="${path.basename(filePath)}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
