import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { TranscriptionRecord } from '../../shared/transcription-types.js';

function rootDir(): string {
  return join(app.getPath('userData'), 'transcriptions');
}

function recordPath(id: string): string {
  return join(rootDir(), id, 'record.json');
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(join(filePath, '..'), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export async function saveTranscriptionRecord(record: TranscriptionRecord): Promise<void> {
  record.updatedAt = Date.now();
  await writeJsonAtomic(recordPath(record.id), record);
}

export async function getTranscriptionRecord(id: string): Promise<TranscriptionRecord | null> {
  try {
    const raw = await fs.readFile(recordPath(id), 'utf-8');
    return JSON.parse(raw) as TranscriptionRecord;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function listTranscriptionRecords(): Promise<TranscriptionRecord[]> {
  await fs.mkdir(rootDir(), { recursive: true });
  const entries = await fs.readdir(rootDir(), { withFileTypes: true });
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => getTranscriptionRecord(entry.name))
  );
  return records
    .filter((record): record is TranscriptionRecord => Boolean(record))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteTranscriptionRecord(id: string): Promise<void> {
  await fs.rm(join(rootDir(), id), { recursive: true, force: true });
}
