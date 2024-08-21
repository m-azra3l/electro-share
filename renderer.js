const { ipcRenderer } = require('electron');

document.getElementById('sync-button').addEventListener('click', () => {
    ipcRenderer.send('sync-files');
});

ipcRenderer.on('sync-complete', (event, message) => {
    alert(message);
});
