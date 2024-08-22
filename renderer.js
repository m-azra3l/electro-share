const { ipcRenderer } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');

document.getElementById('sync-button').addEventListener('click', () => {
    ipcRenderer.send('sync-files');
});

ipcRenderer.on('sync-complete', (event, message) => {
    alert(message);
});

const mockUsers = [
    { username: 'user1', password: 'password123' },
    { username: 'user2', password: 'password456' }
];

document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const user = mockUsers.find(u => u.username === username && u.password === password);

    if (user) {
        // Successful login
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('content-container').style.display = 'block';
        document.getElementById('user-name').innerText = username;
    } else {
        // Invalid credentials
        document.getElementById('login-error').style.display = 'block';
    }
});

// Function to encrypt file data
function encryptFile(filePath) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32); // 32 bytes key for AES-256
    const iv = crypto.randomBytes(16); // Initialization vector
  
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const input = fs.createReadStream(filePath);
    const encryptedFilePath = `${filePath}.enc`;
    const output = fs.createWriteStream(encryptedFilePath);
  
    input.pipe(cipher).pipe(output);
  
    return new Promise((resolve, reject) => {
      output.on('finish', () => resolve({ encryptedFilePath, key, iv }));
      output.on('error', reject);
    });
  }

// Function to decrypt file data
function decryptFile(encryptedFilePath, key, iv, destinationPath) {
    const algorithm = 'aes-256-cbc';
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    const input = fs.createReadStream(encryptedFilePath);
    const output = fs.createWriteStream(destinationPath);
  
    input.pipe(decipher).pipe(output);
  
    return new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
  }

// Define the folder to monitor
const syncFolder = path.join(__dirname, 'sync-folder');

// Initialize chokidar watcher
const watcher = chokidar.watch(syncFolder, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});

// Event listeners for file changes
watcher
    .on('add', filePath => syncFile(filePath, 'add'))
    .on('change', filePath => syncFile(filePath, 'change'))
    .on('unlink', filePath => syncFile(filePath, 'unlink'));

// Sync function to handle different file events
function syncFile(filePath, event) {
    const relativePath = path.relative(syncFolder, filePath);
    console.log(`File ${event}: ${relativePath}`);

    if (event === 'add' || event === 'change') {
        uploadFile(filePath);
    } else if (event === 'unlink') {
        deleteFile(relativePath);
    }
}

// Upload file to File.io
function uploadFile(filePath) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    axios.post('https://file.io', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
    .then(response => {
        if (response.data.success) {
            console.log(`File uploaded: ${response.data.name}, Key: ${response.data.key}`);
            // You can store the key and file information locally for later use (e.g., in a local database)
        } else {
            console.error('File upload failed:', response.data);
        }
    })
    .catch(error => {
        console.error('Error uploading file:', error);
    });
}

// Delete file on File.io using the key
function deleteFile(fileKey) {
    axios.delete(`https://file.io/${fileKey}`,{
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
    .then(response => {
        if (response.data.success) {
            console.log(`File deleted: ${fileKey}`);
        } else {
            console.error('File deletion failed:', response.data);
        }
    })
    .catch(error => {
        console.error('Error deleting file:', error);
    });
}

function listFiles() {
    axios.get('https://www.file.io/',{
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
    .then(response => {
        console.log('Files:', response.data.files);
        // You can render these files in your UI or log them to the console
    })
    .catch(error => {
        console.error('Error listing files:', error);
    });
}

function downloadFile(fileKey, destinationPath) {
    axios.get(`https://www.file.io/${fileKey}`,{
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    }, 
    { responseType: 'stream' })
    .then(response => {
        const writer = fs.createWriteStream(destinationPath);
        response.data.pipe(writer);

        writer.on('finish', () => {
            console.log(`File downloaded: ${destinationPath}`);
        });

        writer.on('error', (error) => {
            console.error('Error downloading file:', error);
        });
    })
    .catch(error => {
        console.error('Error downloading file:', error);
    });
}