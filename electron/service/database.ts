import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import type {
  Session,
  Message,
  PageVisit,
  RecordingSession,
  WorkspaceSpace,
  ExternalTask
} from '../../shared/types.js';

// MVP 阶段使用 JSON 文件存储，避免原生模块编译问题
// 后续可平滑迁移到 better-sqlite3

interface DataStore {
  sessions: Session[];
  messages: Record<string, Message[]>; // sessionId -> messages
  recordings: RecordingSession[];
  pages: PageVisit[];
  spaces: WorkspaceSpace[];
  /** 派发到外部 App 的子任务；随所属会话一起删除 */
  externalTasks: ExternalTask[];
}

function defaultWorkspacePath(): string {
  return join(homedir(), 'Documents', 'AIThink-Workspace');
}

export class DatabaseService {
  private dbPath: string;
  private data: DataStore = {
    sessions: [],
    messages: {},
    recordings: [],
    pages: [],
    spaces: [],
    externalTasks: []
  };
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
      if (!this.data.spaces) this.data.spaces = [];
      if (!this.data.externalTasks) this.data.externalTasks = [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        await this.persist();
      } else {
        console.error('Failed to load database:', error);
      }
    }
    await this.ensureDefaultSpace();
  }

  /** 确保存在不可删除的默认空间；旧数据会补 isDefault */
  private async ensureDefaultSpace(): Promise<void> {
    let changed = false;

    if (this.data.spaces.length === 0) {
      const now = Date.now();
      const folderPath = defaultWorkspacePath();
      try {
        await fs.mkdir(folderPath, { recursive: true });
      } catch {
        // 忽略创建失败，仍写入记录
      }

      const space: WorkspaceSpace = {
        id: randomUUID(),
        name: '默认空间',
        folderPath,
        createdAt: now,
        updatedAt: now,
        isDefault: true
      };
      this.data.spaces.push(space);
      changed = true;

      for (const s of this.data.sessions) {
        if (!s.spaceId && s.workspacePath === folderPath) {
          s.spaceId = space.id;
        }
      }
    } else if (!this.data.spaces.some((s) => s.isDefault)) {
      // 迁移：优先名称「默认空间」，否则取最早创建的一个
      const byName = this.data.spaces.find((s) => s.name === '默认空间');
      const target =
        byName ||
        [...this.data.spaces].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (target) {
        target.isDefault = true;
        changed = true;
      }
    }

    if (changed) await this.persist();
  }

  private async persist(): Promise<void> {
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

  async upsertSession(session: Session, messages: Message[]): Promise<void> {
    const existing = this.data.sessions.findIndex((s) => s.id === session.id);
    if (existing >= 0) {
      this.data.sessions[existing] = session;
    } else {
      this.data.sessions.unshift(session);
    }
    this.data.messages[session.id] = messages;
    await this.persist();
  }

  getSession(id: string): Session | undefined {
    return this.data.sessions.find((s) => s.id === id);
  }

  listSessions(limit = 50): Session[] {
    return [...this.data.sessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async updateSessionTitle(id: string, title: string): Promise<void> {
    const session = this.data.sessions.find((s) => s.id === id);
    if (session) {
      session.title = title;
      await this.persist();
    }
  }

  async deleteSession(id: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    delete this.data.messages[id];
    this.data.externalTasks = this.data.externalTasks.filter((t) => t.sessionId !== id);
    await this.persist();
  }

  async deleteAllSessions(): Promise<number> {
    const count = this.data.sessions.length;
    this.data.sessions = [];
    this.data.messages = {};
    this.data.externalTasks = [];
    await this.persist();
    return count;
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

  /** 覆盖某会话的消息列表（前端整体同步时使用） */
  async replaceMessages(sessionId: string, messages: Message[]): Promise<void> {
    this.data.messages[sessionId] = messages;
    await this.persist();
  }

  // ---------- 外部任务 ----------
  listExternalTasks(): ExternalTask[] {
    return [...this.data.externalTasks].sort((a, b) => a.createdAt - b.createdAt);
  }

  async upsertExternalTask(task: ExternalTask): Promise<void> {
    const index = this.data.externalTasks.findIndex((t) => t.id === task.id);
    if (index >= 0) {
      this.data.externalTasks[index] = task;
    } else {
      this.data.externalTasks.push(task);
    }
    await this.persist();
  }

  async deleteExternalTask(id: string): Promise<void> {
    this.data.externalTasks = this.data.externalTasks.filter((t) => t.id !== id);
    await this.persist();
  }

  // ---------- 空间 ----------
  listSpaces(): WorkspaceSpace[] {
    return [...this.data.spaces].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  getSpace(id: string): WorkspaceSpace | undefined {
    return this.data.spaces.find((s) => s.id === id);
  }

  async createSpace(space: WorkspaceSpace): Promise<WorkspaceSpace> {
    this.data.spaces.unshift(space);
    await this.persist();
    return space;
  }

  async updateSpace(
    id: string,
    patch: Partial<Pick<WorkspaceSpace, 'name' | 'folderPath' | 'examProfile'>>
  ): Promise<WorkspaceSpace | null> {
    const space = this.data.spaces.find((s) => s.id === id);
    if (!space) return null;
    if (patch.name !== undefined) space.name = patch.name;
    if (patch.examProfile !== undefined) space.examProfile = patch.examProfile;
    if (patch.folderPath !== undefined && patch.folderPath !== space.folderPath) {
      space.folderPath = patch.folderPath;
      // 同步该空间下会话的工作目录，避免旧路径残留
      for (const s of this.data.sessions) {
        if (s.spaceId === id) {
          s.workspacePath = patch.folderPath;
        }
      }
    }
    space.updatedAt = Date.now();
    await this.persist();
    return space;
  }

  async deleteSpace(id: string): Promise<{ ok: boolean; error?: string }> {
    const space = this.data.spaces.find((s) => s.id === id);
    if (!space) return { ok: false, error: '空间不存在' };
    if (space.isDefault) return { ok: false, error: '默认空间不可删除' };

    this.data.spaces = this.data.spaces.filter((s) => s.id !== id);
    for (const s of this.data.sessions) {
      if (s.spaceId === id) delete s.spaceId;
    }
    await this.persist();
    return { ok: true };
  }

  // ---------- 录制会话 ----------
  async createRecording(recording: RecordingSession): Promise<void> {
    this.data.recordings.unshift(recording);
    await this.persist();
  }

  async endRecording(id: string): Promise<void> {
    const r = this.data.recordings.find((r) => r.id === id);
    if (r) {
      r.endedAt = Date.now();
      await this.persist();
    }
  }

  async renameRecording(id: string, name: string): Promise<void> {
    const r = this.data.recordings.find((r) => r.id === id);
    if (r) {
      r.name = name;
      await this.persist();
    }
  }

  async deleteRecording(id: string): Promise<void> {
    this.data.recordings = this.data.recordings.filter((r) => r.id !== id);
    this.data.pages = this.data.pages.filter((p) => p.recordingId !== id);
    await this.persist();
  }

  listRecordings(limit = 100): RecordingSession[] {
    return [...this.data.recordings].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  getActiveRecording(): RecordingSession | undefined {
    return this.data.recordings.find((r) => !r.endedAt);
  }

  // ---------- 页面足迹 ----------
  async addPageVisit(visit: PageVisit): Promise<void> {
    this.data.pages.push(visit);
    const r = this.data.recordings.find((r) => r.id === visit.recordingId);
    if (r) r.pageCount = (r.pageCount || 0) + 1;
    await this.persist();
  }

  listPagesByRecording(recordingId: string): PageVisit[] {
    return this.data.pages
      .filter((p) => p.recordingId === recordingId)
      .sort((a, b) => a.visitedAt - b.visitedAt);
  }

  close(): void {
    // JSON 文件存储无需特殊关闭操作
  }
}

let dbInstance: DatabaseService | null = null;

export async function getDatabase(): Promise<DatabaseService> {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
    await dbInstance.initialize();
  }
  return dbInstance;
}

export { defaultWorkspacePath };
