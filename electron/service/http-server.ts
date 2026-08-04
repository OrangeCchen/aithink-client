import { createServer, IncomingMessage, ServerResponse } from 'http';
import { BrowserWindow } from 'electron';
import { getDatabase } from './database.js';
import type { Session, Message, PageVisit, RecordingSession } from '../../shared/types.js';

const PORT = process.env.AITHINK_HTTP_PORT ? parseInt(process.env.AITHINK_HTTP_PORT) : 18790;

// 插件心跳记录
let lastExtensionPing = 0;

export function getLastExtensionPing() {
  return lastExtensionPing;
}

interface SyncSessionPayload {
  source: 'extension' | 'desktop';
  sessionId: string;
  title?: string;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
  }>;
  sourceMeta?: {
    pageUrl?: string;
    pageTitle?: string;
    [key: string]: any;
  };
  createdAt?: number;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res: ServerResponse, status: number, payload: any) {
  setCors(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function notifyRenderers(channel: string, payload?: any) {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(channel, payload);
  });
}

function formatDefaultName(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `录制 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function handleSync(payload: SyncSessionPayload) {
  const db = await getDatabase();

  if (!payload.sessionId || !Array.isArray(payload.messages)) {
    throw new Error('Invalid payload: sessionId and messages are required');
  }

  const firstUserMsg = payload.messages.find(m => m.role === 'user');
  const title =
    payload.title ||
    (firstUserMsg ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '') : '插件会话');

  const session: Session = {
    id: payload.sessionId,
    title,
    model: payload.model || 'unknown',
    workspacePath: '',
    createdAt: payload.createdAt || Date.now(),
    source: payload.source || 'extension',
    sourceMeta: payload.sourceMeta
  };

  const now = Date.now();
  const messages: Message[] = payload.messages.map((m, i) => ({
    id: `${payload.sessionId}-${i}`,
    sessionId: payload.sessionId,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp || now + i
  }));

  await db.upsertSession(session, messages);

  // 通知所有渲染进程刷新会话列表
  notifyRenderers('sessions:updated');
}

export function startHttpServer(): void {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = req.url || '/';

    // 记录插件心跳（除了 /health 外的所有请求都认为是插件活动）
    if (url !== '/health') {
      lastExtensionPing = Date.now();
    }

    // 健康检查
    if (req.method === 'GET' && url === '/health') {
      json(res, 200, { status: 'ok', service: 'aithink-client', version: '0.1.0' });
      return;
    }

    // 同步外部会话
    if (req.method === 'POST' && url === '/api/sessions/sync') {
      try {
        const body = await readBody(req);
        const payload: SyncSessionPayload = JSON.parse(body);
        await handleSync(payload);
        json(res, 200, { ok: true, sessionId: payload.sessionId });
      } catch (error: any) {
        console.error('[http] sync failed:', error);
        json(res, 400, { ok: false, error: error.message || 'sync failed' });
      }
      return;
    }

    // 列出所有会话(给插件查询用)
    if (req.method === 'GET' && url === '/api/sessions') {
      try {
        const db = await getDatabase();
        const sessions = db.listSessions();
        json(res, 200, { ok: true, sessions });
      } catch (error: any) {
        json(res, 500, { ok: false, error: error.message });
      }
      return;
    }

    // ---------- 录制 / 足迹接口 ----------

    // 开始录制
    if (req.method === 'POST' && url === '/api/recording/start') {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const db = await getDatabase();

        // 若已有进行中的录制，直接返回它
        const active = db.getActiveRecording();
        if (active) {
          json(res, 200, { ok: true, recording: active, resumed: true });
          return;
        }

        const now = Date.now();
        const recording: RecordingSession = {
          id: `rec-${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: payload.name || formatDefaultName(now),
          startedAt: now,
          pageCount: 0
        };
        await db.createRecording(recording);
        notifyRenderers('recordings:updated');
        json(res, 200, { ok: true, recording });
      } catch (error: any) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    // 停止录制
    if (req.method === 'POST' && url === '/api/recording/stop') {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const db = await getDatabase();
        const target = payload.id ? db.listRecordings().find(r => r.id === payload.id) : db.getActiveRecording();
        if (!target) {
          json(res, 404, { ok: false, error: '没有进行中的录制' });
          return;
        }
        await db.endRecording(target.id);
        notifyRenderers('recordings:updated');
        json(res, 200, { ok: true, recordingId: target.id });
      } catch (error: any) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    // 查询当前录制状态(给插件用,用于跨 sidepanel 关闭后恢复状态)
    if (req.method === 'GET' && url === '/api/recording/active') {
      try {
        const db = await getDatabase();
        const active = db.getActiveRecording();
        json(res, 200, { ok: true, recording: active || null });
      } catch (error: any) {
        json(res, 500, { ok: false, error: error.message });
      }
      return;
    }

    // 上报页面足迹
    if (req.method === 'POST' && url === '/api/pages/track') {
      try {
        const body = await readBody(req);
        const payload = JSON.parse(body);
        if (!payload.url || !payload.recordingId) {
          throw new Error('url 和 recordingId 必填');
        }
        const db = await getDatabase();
        // 校验 recordingId 存在且未结束
        const rec = db.listRecordings().find(r => r.id === payload.recordingId);
        if (!rec) {
          json(res, 404, { ok: false, error: '录制会话不存在' });
          return;
        }
        if (rec.endedAt) {
          json(res, 400, { ok: false, error: '该录制会话已结束' });
          return;
        }
        const visit: PageVisit = {
          id: `pv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          url: payload.url,
          title: payload.title || payload.url,
          visitedAt: payload.visitedAt || Date.now(),
          recordingId: payload.recordingId
        };
        await db.addPageVisit(visit);
        notifyRenderers('pages:updated', { recordingId: rec.id });
        json(res, 200, { ok: true, visit });
      } catch (error: any) {
        json(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    json(res, 404, { ok: false, error: 'Not Found' });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[http] aithink-client server listening on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[http] Port ${PORT} already in use, sync server not started`);
    } else {
      console.error('[http] server error:', err);
    }
  });
}
