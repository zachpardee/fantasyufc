import { contextBridge, shell } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openExternal: (url: string) => shell.openExternal(url),
});
