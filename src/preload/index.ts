import { contextBridge, ipcRenderer } from 'electron'
import type {
  CaptureSource,
  CursorSample,
  ExportAudio,
  ExportOptions,
  ProjectState,
  RecordingMeta,
  SaveRecordingArgs
} from '../shared/types'

const api = {
  listSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('sources:list'),
  getDisplays: (): Promise<{ id: string; bounds: Electron.Rectangle; scaleFactor: number }[]> =>
    ipcRenderer.invoke('app:displays'),

  startCursor: (sourceId: string, displayId: string): Promise<boolean> =>
    ipcRenderer.invoke('cursor:start', sourceId, displayId),
  stopCursor: (): Promise<CursorSample[]> => ipcRenderer.invoke('cursor:stop'),

  saveRecording: (args: SaveRecordingArgs): Promise<RecordingMeta> =>
    ipcRenderer.invoke('recording:save', args),

  nativeStartRecording: (opts: {
    windowId?: number
    displayId?: number
    fps: number
  }): Promise<{ ok: boolean; width?: number; height?: number; reason?: string }> =>
    ipcRenderer.invoke('recording:nativeStart', opts),
  nativeStopRecording: (): Promise<{ media: Uint8Array } | null> =>
    ipcRenderer.invoke('recording:nativeStop'),
  setPendingSource: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('recording:setPendingSource', id),
  reveal: (path: string): Promise<boolean> => ipcRenderer.invoke('shell:reveal', path),

  saveProject: (state: ProjectState, existingPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', state, existingPath),
  openProject: (
    path?: string
  ): Promise<{
    state: ProjectState
    path: string
    media: Uint8Array
    camera: Uint8Array | null
  } | null> => ipcRenderer.invoke('project:open', path),

  exportBegin: (
    options: ExportOptions,
    projectName: string,
    audio?: ExportAudio | null
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke('export:begin', options, projectName, audio),
  exportFrame: (buffer: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('export:frame', buffer),
  exportEnd: (): Promise<string | null> => ipcRenderer.invoke('export:end'),
  exportCancel: (): Promise<boolean> => ipcRenderer.invoke('export:cancel'),

  openFileDialog: (filters: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', filters),

  openReleases: (): Promise<boolean> => ipcRenderer.invoke('update:openReleases'),
  onUpdateAvailable: (cb: (info: { version: string; url: string }) => void): (() => void) => {
    const listener = (_e: unknown, info: { version: string; url: string }): void => cb(info)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  }
}

export type RokugaApi = typeof api

contextBridge.exposeInMainWorld('rokuga', api)
