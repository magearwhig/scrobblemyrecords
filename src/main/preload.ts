import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
const electronAPI = {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  
  // Dialog interactions
  showMessageBox: (options: Electron.MessageBoxOptions) => 
    ipcRenderer.invoke('show-message-box', options),
  
  // Navigation
  onNavigateTo: (callback: (route: string) => void) => {
    ipcRenderer.on('navigate-to', (event, route) => callback(route));
  },
  
  // Remove navigation listener
  removeNavigationListener: () => {
    ipcRenderer.removeAllListeners('navigate-to');
  },
  
  // About dialog
  onShowAbout: (callback: () => void) => {
    ipcRenderer.on('show-about', callback);
  },
  
  // Remove about listener
  removeAboutListener: () => {
    ipcRenderer.removeAllListeners('show-about');
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type definition for TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}