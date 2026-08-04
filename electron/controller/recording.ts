import { ipcMain } from 'electron';
import { getDatabase } from '../service/database.js';

export function registerRecordingHandlers() {
  // 列出所有录制会话
  ipcMain.handle('recording:list', async () => {
    const db = await getDatabase();
    return db.listRecordings();
  });

  // 列出某个录制会话下的页面足迹
  ipcMain.handle('recording:listPages', async (_event, recordingId: string) => {
    const db = await getDatabase();
    return db.listPagesByRecording(recordingId);
  });

  // 重命名录制会话
  ipcMain.handle('recording:rename', async (_event, params: { id: string; name: string }) => {
    const db = await getDatabase();
    await db.renameRecording(params.id, params.name);
  });

  // 删除录制会话
  ipcMain.handle('recording:delete', async (_event, id: string) => {
    const db = await getDatabase();
    await db.deleteRecording(id);
  });

  // 获取当前进行中的录制
  ipcMain.handle('recording:getActive', async () => {
    const db = await getDatabase();
    return db.getActiveRecording() || null;
  });
}
