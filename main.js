const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto-js');

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'renderer.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('sync-files', async (event, args) => {
    const folderPath = path.join(__dirname, 'sync');
    const files = fs.readdirSync(folderPath);

    for (let file of files) {
        const filePath = path.join(folderPath, file);
        const fileData = fs.readFileSync(filePath);
        const encrypted = crypto.AES.encrypt(fileData.toString(), 'your-secret-key').toString();
        await axios.post('https://your-server-api.com/upload', { file: encrypted, fileName: file });
    }

    event.reply('sync-complete', 'Files synced successfully');
});
