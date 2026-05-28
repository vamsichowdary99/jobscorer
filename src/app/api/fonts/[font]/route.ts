import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { Readable } from 'stream'
import path from 'path'
import { existsSync } from 'fs'

const ALLOWED_FONTS = new Set([
  'Roboto-Regular.ttf',
  'Roboto-Bold.ttf',
  'Merriweather-Regular.ttf',
  'Merriweather-Bold.ttf',
  'Lora-Regular.ttf',
  'Lora-Bold.ttf',
  'Lato-Regular.ttf',
  'Lato-Bold.ttf',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ font: string }> }
) {
  const { font } = await params

  if (!ALLOWED_FONTS.has(font)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const fontPath = path.join(process.cwd(), 'public', 'fonts', font)

  if (!existsSync(fontPath)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const nodeStream = createReadStream(fontPath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new Response(webStream, {
    headers: {
      'Content-Type': 'font/ttf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
