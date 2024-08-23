const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const integrateVirtualFolder = require('./virtualFolder');
const { shell } = require('electron');

let isAuthenticated = false; // Initial authentication state

let mainWindow;

// Integrate the virtual folder when the app is ready
const managedDirPath = integrateVirtualFolder(isAuthenticated);

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

  // You can use the openPath argument as needed within your app
  if (openPath) {
    win.webContents.send('open-path', openPath);
  }
}

// Listen for authentication status from the renderer process
ipcMain.on('auth-status', (event, status) => {
  isAuthenticated = status;
  console.log(`Authentication status: ${isAuthenticated}`);

  // Integrate the virtual folder based on authentication status
  integrateVirtualFolder(isAuthenticated);
});

app.whenReady().then(() => {

  // Monitor and open the folder on click
  app.on('activate', () => {
    shell.openPath(managedDirPath); // Open the managed directory when the app is activated
  });

  // Check for command-line arguments
  const args = process.argv.slice(1);
  let openPath = null;
  if (args.length > 0) {
    openPath = args[0];
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle the open-file event when the virtual folder is clicked
// app.on('open-file', (event, filePath) => {
//   event.preventDefault();
//   if (mainWindow) {
//     // Focus the existing window
//     mainWindow.focus();
//   } else {
//     // Create a new window if needed
//     createWindow();
//   }
// });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});