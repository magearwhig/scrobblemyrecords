import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

class MainApp {
  private mainWindow: BrowserWindow | null = null;
  private serverProcess: ChildProcess | null = null;
  private readonly isDev = process.env.NODE_ENV === 'development';

  constructor() {
    this.setupAppEvents();
    this.setupIpcHandlers();
  }

  private setupAppEvents(): void {
    app.whenReady().then(() => {
      this.startBackendServer();
      this.createWindow();
      this.setupMenu();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true
      },
      titleBarStyle: 'default',
      show: false
    });

    // Load the app
    if (this.isDev) {
      this.mainWindow.loadURL('http://localhost:8080');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              this.mainWindow?.webContents.send('navigate-to', '/settings');
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About',
            click: () => {
              this.mainWindow?.webContents.send('show-about');
            }
          }
        ]
      }
    ];

    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('get-server-url', () => {
      return 'http://localhost:3001';
    });

    ipcMain.handle('show-message-box', async (event, options) => {
      const { dialog } = require('electron');
      if (this.mainWindow) {
        return await dialog.showMessageBox(this.mainWindow, options);
      }
      return { response: 0 };
    });
  }

  private startBackendServer(): void {
    if (this.isDev) {
      console.log('Development mode: Backend server should be running separately');
      return;
    }

    try {
      // In production, start the backend server
      const serverPath = path.join(__dirname, '../server.js');
      this.serverProcess = spawn('node', [serverPath], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
      });

      this.serverProcess.stdout?.on('data', (data) => {
        console.log('Backend:', data.toString());
      });

      this.serverProcess.stderr?.on('data', (data) => {
        console.error('Backend Error:', data.toString());
      });

      this.serverProcess.on('close', (code) => {
        console.log(`Backend server exited with code ${code}`);
      });
    } catch (error) {
      console.error('Failed to start backend server:', error);
    }
  }

  private cleanup(): void {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }
}

// Create the application
new MainApp();