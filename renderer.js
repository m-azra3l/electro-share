const { ipcRenderer } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const crypto = require('crypto');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('app.db');
require('dotenv').config();

// Function to show notifications
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.innerText = message;
    notification.style.backgroundColor = type === 'error' ? '#f44336' : '#4caf50';
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

document.getElementById('sync-button').addEventListener('click', () => {
    ipcRenderer.send('sync-files');
    listFiles();
});

document.getElementById('show-folder-button').addEventListener('click', () => {
    ipcRenderer.send('show-managed-folder');
});

ipcRenderer.on('sync-complete', (event, message) => {
    alert(message);
});

const mockUsers = [
    { username: 'user1', password: 'password123' },
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

        // Send authentication status to the main process
        ipcRenderer.send('auth-status', true);
        showNotification('Login successful!', 'success');
    }
    else {
        // Invalid credentials
        document.getElementById('login-error').style.display = 'block';
        ipcRenderer.send('auth-status', false);
        showNotification('Invalid credentials. Please try again.', 'error');
    }
});

function recordFileInfo(fileInfo) {
    const insertStmt = `
        INSERT INTO FileInfos (Name, CreatedAt, Key, MaxDownloads, AutoDelete, ExpiresAt)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(insertStmt, [
        fileInfo.name,
        fileInfo.created,
        fileInfo.key,
        fileInfo.maxDownloads,
        fileInfo.autoDelete ? 1 : 0,
        fileInfo.expires
    ], function (err) {
        if (err) {
            return console.error('Error recording file info:', err.message);
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
    });
}

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
const folderName = 'ElectroShare';
// Create the managed directory
const userHomeDir = os.homedir();
const syncFolder = path.join(userHomeDir, folderName);

const token = process.env.FILEIO_KEY;
const baseUrl = 'https://www.file.io/';

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

function addDaysToDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

// Upload file to File.io
// Modify uploadFile to encrypt the file first
async function uploadFile(filePath) {
    try {
        const { encryptedFilePath, key, iv } = await encryptFile(filePath);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(encryptedFilePath));

        // Add additional parameters
        const maxDownloads = 1;
        const expires = addDaysToDate(13);
        const autoDelete = true;

        formData.append('maxDownloads', maxDownloads);
        formData.append('expires', expires);
        formData.append('autoDelete', autoDelete);

        const response = await axios.post(baseUrl, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: `Bearer ${token}`
            }
        });

        if (response.data.success) {
            console.log(`File uploaded: ${response.data.name}, Key: ${response.data.key}`);
            showNotification('File uploaded successfully!', 'success');

            // Record the file info in the database
            const fileInfo = {
                name: path.basename(filePath), // Original file name
                created: response.data.created, // Use the 'created' value from the response
                key: response.data.key,
                maxDownloads: response.data.maxDownloads || maxDownloads, // Use the response or default value
                autoDelete: response.data.autoDelete,
                expires: response.data.expires
            };
            recordFileInfo(fileInfo);

            // Clean up the temporary encrypted file
            fs.unlinkSync(encryptedFilePath);
        } else {
            console.error('File upload failed:', response.data);
            showNotification('File upload failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Error uploading file. Please try again.', 'error');
    }
}

// Delete file on File.io using the key
function deleteFile(fileKey) {
    axios.delete(`${baseUrl}${fileKey}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
        .then(response => {
            if (response.data.success) {
                console.log(`File deleted: ${fileKey}`);
                showNotification('File deleted successfully!', 'success');

                // Delete the corresponding entry in the database
                db.run('DELETE FROM FileInfos WHERE "Key" = ?', [fileKey], function (err) {
                    if (err) {
                        console.error('Error deleting record from database:', err.message);
                        showNotification('Error deleting record from database. Please try again.', 'error');
                    } else if (this.changes > 0) {
                        console.log(`Database entry deleted for fileKey: ${fileKey}`);
                    } else {
                        console.log(`No matching database entry found for fileKey: ${fileKey}`);
                    }
                });
                listFiles(); 
            } else {
                console.error('File deletion failed:', response.data);
                showNotification('File deletion failed. Please try again.', 'error');
            }
        })
        .catch(error => {
            console.error('Error deleting file:', error);
            showNotification('Error deleting file. Please try again.', 'error');
        });
}

// List files on File.io
function listFiles() {
    axios.get(baseUrl, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    .then(response => {
        const files = response.data.files;
        console.log('Files:', files);
        renderFileList(files);
    })
    .catch(error => {
        console.error('Error listing files:', error);
        showNotification('Error listing files. Please try again.', 'error');
    });
}

function renderFileList(files) {
    const fileListContainer = document.querySelector('#file-list tbody');
    fileListContainer.innerHTML = ''; // Clear any existing rows

    files.forEach(file => {
        const row = document.createElement('tr');

        // Name
        const nameCell = document.createElement('td');
        nameCell.textContent = file.name;
        row.appendChild(nameCell);

        // Size
        const sizeCell = document.createElement('td');
        sizeCell.textContent = formatFileSize(file.size);
        row.appendChild(sizeCell);

        // Downloads
        const downloadsCell = document.createElement('td');
        downloadsCell.textContent = file.downloads;
        row.appendChild(downloadsCell);

        // Expires
        const expiresCell = document.createElement('td');
        expiresCell.textContent = new Date(file.expires).toLocaleString();
        row.appendChild(expiresCell);

        // Actions
        const actionsCell = document.createElement('td');

        // Download button
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.onclick = () => {
            const destinationPath = getDestinationPathForUser(file.name);
            downloadFile(file.key, destinationPath, file.key, iv); // Assuming key and iv are available
        };
        actionsCell.appendChild(downloadButton);

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => deleteFile(file.key);
        actionsCell.appendChild(deleteButton);

        row.appendChild(actionsCell);
        fileListContainer.appendChild(row);
    });
}

// Function to handle the download process
function downloadFile(fileKey, destinationPath, key, iv) {
    const encryptedFilePath = `${destinationPath}.enc`;

    axios.get(`${baseUrl}${fileKey}`, {
        headers: {
            Authorization: `Bearer ${token}`
        },
        responseType: 'stream'
    })
    .then(response => {
        const writer = fs.createWriteStream(encryptedFilePath);
        response.data.pipe(writer);

        writer.on('finish', async () => {
            console.log(`File downloaded: ${encryptedFilePath}`);
            await decryptFile(encryptedFilePath, key, iv, destinationPath);
            fs.unlinkSync(encryptedFilePath); // Remove the temporary encrypted file
            console.log(`File decrypted: ${destinationPath}`);
            showNotification('File downloaded and decrypted successfully!', 'success');
            // Delete the corresponding entry in the database
            db.run('DELETE FROM FileInfos WHERE "Key" = ?', [fileKey], function (err) {
                if (err) {
                    console.error('Error deleting record from database:', err.message);
                    showNotification('Error deleting record from database. Please try again.', 'error');
                } else if (this.changes > 0) {
                    console.log(`Database entry deleted for fileKey: ${fileKey}`);
                } else {
                    console.log(`No matching database entry found for fileKey: ${fileKey}`);
                }
            });
            listFiles(); 
        });

        writer.on('error', (error) => {
            console.error('Error downloading file:', error);
            showNotification('Error downloading file. Please try again.', 'error');
        });
    })
    .catch(error => {
        console.error('Error downloading file:', error);
        showNotification('Error downloading file. Please try again.', 'error');
    });
}

// Utility function to get the destination path for the user
function getDestinationPathForUser(fileName) {
    // Replace this with actual logic to determine the user's specific folder
    const userFolder = path.join(__dirname, 'user-specific-folder');
    if (!fs.existsSync(userFolder)) {
        fs.mkdirSync(userFolder, { recursive: true });
    }
    return path.join(userFolder, fileName);
}

// Utility function to format file size
function formatFileSize(size) {
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Close the database when done
process.on('exit', () => {
    db.close();
});