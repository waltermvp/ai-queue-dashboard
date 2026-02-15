import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

const DB_API = path.join(process.cwd(), 'scripts', 'db-api.js');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '50';
    const offset = searchParams.get('offset') || '0';
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const command = searchParams.get('command') || 'history';

    let args = '';
    if (command === 'history') {
      args = `history --limit ${limit} --offset ${offset}`;
      if (type) args += ` --type ${type}`;
      if (status) args += ` --status ${status}`;
    } else if (command === 'stats') {
      args = 'stats';
    } else if (command === 'run') {
      const id = searchParams.get('id');
      args = `run ${id}`;
    }

    const result = execSync(`node ${DB_API} ${args}`, {
      timeout: 5000,
      encoding: 'utf-8'
    });

    return NextResponse.json(JSON.parse(result));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
