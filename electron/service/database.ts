import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { Session, Message, PageVisit, RecordingSession } from '../../shared/types.js';

// MVP 阶段使用 JSON 文件存储，避免原生模块编译问题
// 后续可平滑迁移到 better-sqlite3

interface DataStore {
  sessions: Session[];
  messages: Record<string, Message[]>; // sessionId -> messages
  recordings: RecordingSession[];
  pages: PageVisit[];
}

export class DatabaseService {
  private dbPath: string;
  private data: DataStore = { sessions: [], messages: {}, recordings: [], pages: [] };
  private writePromise: Promise<void> = Promise.resolve();

  constructor() {
    this.dbPath = join(app.getPath('userData'), 'aithink.json');
  }

  async initialize(): Promise<void> {
    try {
      const content = await fs.readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(content);
      if (!this.data.sessions) this.data.sessions = [];
      if (!this.data.messages) this.data.messages = {};
      if (!this.data.recordings) this.data.recordings = [];
      if (!this.data.pages) this.data.pages = [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，使用默认空数据
        await this.persist();
      } else {
        console.error('Failed to load database:', error);
      }
    }
  }

  private async persist(): Promise<void> {
    // 串行化写入，避免并发冲突
    this.writePromise = this.writePromise.then(async () => {
      try {
        await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (error) {
        console.error('Failed to persist database:', error);
      }
    });
    return this.writePromise;
  }

  // Session 操作
  async createSession(session: Session): Promise<void> {
    this.data.sessions.unshift(session);
    this.data.messages[session.id] = [];
    await this.persist();
  }

  // 同步外部会话(覆盖式更新),用于浏览器插件等外部源
  async upsertSession(session: Session, messages: Message[]): Promise<void> {
    const existing = this.data.sessions.findIndex(s => s.id === session.id);
    if (existing >= 0) {
      this.data.sessions[existing] = session;
    } else {
      this.data.sessions.unshift(session);
    }
    this.data.messages[session.id] = messages;
    await this.persist();
  }

  getSession(id: string): Session | undefined {
    return this.data.sessions.find(s => s.id === id);
  }

  listSessions(limit = 50): Session[] {
    return [...this.data.sessions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async updateSessionTitle(id: string, title: string): Promise<void> {
    const session = this.data.sessions.find(s => s.id === id);
    if (session) {
      session.title = title;
      await this.persist();
    }
  }

  async deleteSession(id: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter(s => s.id !== id);
    delete this.data.messages[id];
    await this.persist();
  }

  // Message 操作
  async createMessage(message: Message): Promise<void> {
    if (!this.data.messages[message.sessionId]) {
      this.data.messages[message.sessionId] = [];
    }
    this.data.messages[message.sessionId].push(message);
    await this.persist();
  }

  getMessages(sessionId: string): Message[] {
    return this.data.messages[sessionId] || [];
  }

  // ---------- 录制会话 ----------
  async createRecording(recording: RecordingSession): Promise<void> {
    this.data.recordings.unshift(recording);
    await this.persist();
  }

  async endRecording(id: string): Promise<void> {
    const r = this.data.recordings.find(r => r.id === id);
    if (r) {
      r.endedAt = Date.now();
      await this.persist();
    }
  }

  async renameRecording(id: string, name: string): Promise<void> {
    const r = this.data.recordings.find(r => r.id === id);
    if (r) {
      r.name = name;
      await this.persist();
    }
  }

  async deleteRecording(id: string): Promise<void> {
    this.data.recordings = this.data.recordings.filter(r => r.id !== id);
    this.data.pages = this.data.pages.filter(p => p.recordingId !== id);
    await this.persist();
  }

  listRecordings(limit = 100): RecordingSession[] {
    return [...this.data.recordings]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  getActiveRecording(): RecordingSession | undefined {
    return this.data.recordings.find(r => !r.endedAt);
  }

  // ---------- 页面足迹 ----------
  async addPageVisit(visit: PageVisit): Promise<void> {
    this.data.pages.push(visit);
    // 同步更新所属录制会话的 pageCount
    const r = this.data.recordings.find(r => r.id === visit.recordingId);
    if (r) r.pageCount = (r.pageCount || 0) + 1;
    await this.persist();
  }

  listPagesByRecording(recordingId: string): PageVisit[] {
    return this.data.pages
      .filter(p => p.recordingId === recordingId)
      .sort((a, b) => a.visitedAt - b.visitedAt);
  }

  close(): void {
    // JSON 文件存储无需特殊关闭操作
  }
}

// 单例
let dbInstance: DatabaseService | null = null;

export async function getDatabase(): Promise<DatabaseService> {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
    await dbInstance.initialize();
  }
  return dbInstance;
}
