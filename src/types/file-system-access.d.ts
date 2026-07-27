// TypeScript's bundled lib.dom.d.ts ships most of the File System Access API
// (FileSystemDirectoryHandle, getFileHandle, createWritable, etc.) but is
// still missing these few members. Declared here rather than pulling in a
// third-party @types package for three methods.
export {}

declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  }
}
