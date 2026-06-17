import { app, dialog, type IpcMain, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join, basename } from 'path'
import AdmZip from 'adm-zip'
import type { ProjectState } from '../shared/types'

const MEDIA_ENTRY = 'media.webm'
const CAMERA_ENTRY = 'camera.webm'
const PROJECT_ENTRY = 'project.json'

function projectsDir(): string {
  return join(app.getPath('userData'), 'projects')
}

/**
 * A `.rokuga` file is a zip container holding the raw recording (`media.webm`)
 * alongside the editable `project.json`. This keeps a project fully
 * self-contained and portable.
 */
export function registerProjectHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(
    'project:save',
    async (_e, state: ProjectState, existingPath?: string): Promise<string | null> => {
      const win = getWindow()
      let target = existingPath
      if (!target) {
        if (!win) return null
        const res = await dialog.showSaveDialog(win, {
          title: 'Save Rokuga project',
          defaultPath: `${state.name || 'Untitled'}.rokuga`,
          filters: [{ name: 'Rokuga Project', extensions: ['rokuga'] }]
        })
        if (res.canceled || !res.filePath) return null
        target = res.filePath
      }

      const mediaBytes = await fs.readFile(state.recording.mediaPath)

      // Include the webcam/mic track if present.
      let cameraBytes: Buffer | null = null
      if (state.recording.cameraPath) {
        try {
          cameraBytes = await fs.readFile(state.recording.cameraPath)
        } catch {
          cameraBytes = null
        }
      }

      // Store the project with relative media references so the file is portable.
      const portable: ProjectState = {
        ...state,
        recording: {
          ...state.recording,
          mediaPath: MEDIA_ENTRY,
          cameraPath: cameraBytes ? CAMERA_ENTRY : undefined
        }
      }

      const zip = new AdmZip()
      zip.addFile(PROJECT_ENTRY, Buffer.from(JSON.stringify(portable, null, 2), 'utf-8'))
      zip.addFile(MEDIA_ENTRY, mediaBytes)
      if (cameraBytes) zip.addFile(CAMERA_ENTRY, cameraBytes)
      await fs.writeFile(target, zip.toBuffer())
      return target
    }
  )

  ipcMain.handle(
    'project:open',
    async (
      _e,
      existingPath?: string
    ): Promise<{
      state: ProjectState
      path: string
      media: Buffer
      camera: Buffer | null
    } | null> => {
      const win = getWindow()
      let target = existingPath
      if (!target) {
        if (!win) return null
        const res = await dialog.showOpenDialog(win, {
          title: 'Open Rokuga project',
          properties: ['openFile'],
          filters: [{ name: 'Rokuga Project', extensions: ['rokuga'] }]
        })
        if (res.canceled || res.filePaths.length === 0) return null
        target = res.filePaths[0]
      }

      const zip = new AdmZip(target)
      const projectEntry = zip.getEntry(PROJECT_ENTRY)
      const mediaEntry = zip.getEntry(MEDIA_ENTRY)
      if (!projectEntry || !mediaEntry) {
        throw new Error('Invalid .rokuga file: missing project or media data.')
      }

      const state = JSON.parse(zip.readAsText(projectEntry)) as ProjectState

      // Extract the media to the working dir so the renderer can stream it.
      await fs.mkdir(projectsDir(), { recursive: true })
      const extractedPath = join(
        projectsDir(),
        `${basename(target).replace(/\.rokuga$/i, '')}-${state.recording.createdAt}.webm`
      )
      const mediaData = mediaEntry.getData()
      await fs.writeFile(extractedPath, mediaData)
      state.recording.mediaPath = extractedPath

      // Extract the webcam/mic track too, if the project has one.
      let cameraData: Buffer | null = null
      const cameraEntry = zip.getEntry(CAMERA_ENTRY)
      if (cameraEntry) {
        const camPath = extractedPath.replace(/\.webm$/i, '-camera.webm')
        cameraData = cameraEntry.getData()
        await fs.writeFile(camPath, cameraData)
        state.recording.cameraPath = camPath
      } else {
        state.recording.cameraPath = undefined
      }

      return { state, path: target, media: mediaData, camera: cameraData }
    }
  )
}
