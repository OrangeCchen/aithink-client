import { protocol, net } from 'electron';
import { createReadStream, promises as fs } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';
import { pathToFileURL } from 'url';
import { getTranscriptionRecord } from './transcription-repository.js';

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska'
};

function mimeFromPath(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function toWebStream(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as any) as ReadableStream;
}

async function serveLocalFile(filePath: string, request: Request): Promise<Response> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) return new Response('Not found', { status: 404 });

  const fileSize = stat.size;
  const mime = mimeFromPath(filePath);
  const rangeHeader = request.headers.get('Range') || request.headers.get('range');

  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) return new Response('Invalid range', { status: 416 });

    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : fileSize - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      return new Response('Requested range not satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
          'Accept-Ranges': 'bytes'
        }
      });
    }
    end = Math.min(end, fileSize - 1);
    const chunkSize = end - start + 1;
    const stream = createReadStream(filePath, { start, end });
    return new Response(toWebStream(stream), {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    });
  }

  // 无 Range 时仍声明 Accept-Ranges，并优先走 net.fetch(file:) 以便大文件流式读取
  try {
    const response = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', mime);
    headers.set('Content-Length', String(fileSize));
    headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, {
      status: response.status,
      headers
    });
  } catch {
    const stream = createReadStream(filePath);
    return new Response(toWebStream(stream), {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    });
  }
}

export function registerMediaProtocol(): void {
  protocol.handle('aithink-media', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'transcription') {
        return new Response('Not found', { status: 404 });
      }
      const id = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const record = id ? await getTranscriptionRecord(id) : null;
      if (!record?.sourcePath) return new Response('Not found', { status: 404 });
      await fs.access(record.sourcePath);
      return serveLocalFile(record.sourcePath, request);
    } catch (error: any) {
      return new Response(error?.message || 'Media error', { status: 500 });
    }
  });
}
