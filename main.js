const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const integrateVirtualFolder = require('./virtualFolder');
const os = require('os');

let isAuthenticated = false; // Initial authentication state

// Integrate the virtual folder when the app is ready
let managedDirPath;

const folderName = 'ElectroShare';
// Create the managed directory
const userHomeDir = os.homedir();
const managedFolderPath = path.join(userHomeDir, folderName);

function createWindow(openPath) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile('index.html');

  // Handle the openPath if provided
  if (openPath) {
    win.webContents.send('open-path', openPath);
    console.log(`Opening path: ${openPath}`);
  } else if (managedDirPath && fs.existsSync(managedDirPath)) {
    win.webContents.send('open-path', managedDirPath);
    console.log(`Opening managed directory: ${managedDirPath}`);
  }
}

// Listen for authentication status from the renderer process
ipcMain.on('auth-status', (event, status) => {
  isAuthenticated = status;
  console.log(`Authentication status: ${isAuthenticated}`);

  // Re-integrate the virtual folder based on authentication status
  managedDirPath = integrateVirtualFolder(isAuthenticated);
});

ipcMain.on('show-managed-folder', (event) => {
  shell.openPath(managedFolderPath);
});

app.whenReady().then(() => {
  managedDirPath = integrateVirtualFolder(isAuthenticated);

  // Monitor and open the folder on click
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Open the managed directory if the virtual folder is clicked
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (filePath === managedDirPath) {
      createWindow(filePath);
    } else {
      shell.openPath(filePath);
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});