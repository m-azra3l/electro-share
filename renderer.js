const { ipcRenderer } = require('electron');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
// const crypto = require('crypto');
const crypto = require('crypto-js');
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
function encryptFile(buffer, key) {
    // Convert the buffer to a WordArray
    const wordArray = crypto.lib.WordArray.create(buffer);
    // Encrypt the WordArray using AES
    const encrypted = crypto.AES.encrypt(wordArray, key);
    // Convert encrypted WordArray back to buffer
    const encryptedBuffer = Buffer.from(encrypted.ciphertext.toString(crypto.enc.Hex), 'hex');
    return encryptedBuffer;
}
// function encryptFile(filePath) {
//     const algorithm = 'aes-256-cbc';
//     const key = crypto.randomBytes(32); // 32 bytes key for AES-256
//     const iv = crypto.randomBytes(16); // Initialization vector

//     const cipher = crypto.createCipheriv(algorithm, key, iv);
//     const input = fs.createReadStream(filePath);
//     const encryptedFilePath = `${filePath}.enc`;
//     const output = fs.createWriteStream(encryptedFilePath);

//     input.pipe(cipher).pipe(output);

//     return new Promise((resolve, reject) => {
//         output.on('finish', () => resolve({ encryptedFilePath, key, iv }));
//         output.on('error', reject);
//     });
// }

// Function to decrypt file data
function decryptFile(encryptedBuffer, key) {
    const encryptedHex = encryptedBuffer.toString('hex');
    const wordArray = crypto.enc.Hex.parse(encryptedHex);
    const decrypted = crypto.AES.decrypt({ ciphertext: wordArray }, key);
    const decryptedBuffer = Buffer.from(decrypted.toString(crypto.enc.Utf8), 'utf-8');
    return decryptedBuffer;
}
// function decryptFile(encryptedFilePath, key, iv, destinationPath) {
//     const algorithm = 'aes-256-cbc';
//     const decipher = crypto.createDecipheriv(algorithm, key, iv);
//     const input = fs.createReadStream(encryptedFilePath);
//     const output = fs.createWriteStream(destinationPath);

//     input.pipe(decipher).pipe(output);

//     return new Promise((resolve, reject) => {
//         output.on('finish', resolve);
//         output.on('error', reject);
//     });
// }

// Define the folder to monitor
const folderName = 'ElectroShare';
// Create the managed directory
const userHomeDir = os.homedir();
const syncFolder = path.join(userHomeDir, folderName);

const token = process.env.FILEIO_KEY;
const baseUrl = 'https://file.io/';
const encryptKey = process.env.ENCRYPTION_KEY;

// Initialize chokidar watcher
const watcher = chokidar.watch(syncFolder, {
    ignored: /(^|[\/\\])\..|(\.enc$)/, // ignore dotfiles and .enc files
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

// Check if file exists in the database before upload
function checkFileExistsInDB(fileName, callback) {
    const query = 'SELECT * FROM FileInfos WHERE Name = ?';
    db.get(query, [fileName], (err, row) => {
        if (err) {
            console.error('Error checking file in database:', err.message);
            showNotification('Error checking file in database. Please try again.', 'error');
            callback(err, false);
        } else {
            callback(null, !!row); // returns true if row exists, false otherwise
        }
    });
}

function addDaysToDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

// Upload file to File.io
// Modify uploadFile to encrypt the file first
async function uploadFile(filePath) {
    const fileName = path.basename(filePath);

    checkFileExistsInDB(fileName, async (err, exists) => {
        if (err) return; // Error already logged in checkFileExistsInDB

        if (exists) {
            console.log(`File ${fileName} already exists in the database. Skipping upload.`);
            showNotification('File already exists in the database. Skipping upload.', 'error');
            return;
        }

        try {
            // Read the binary data of the file
            const fileData = fs.readFileSync(filePath);
            console.log('File Data Length:', fileData.length);  // Debugging output

            // Encrypt the binary data
            const encryptedBuffer = encryptFile(fileData, encryptKey);
            console.log('Encrypted Buffer Length:', encryptedBuffer.length);  // Debugging output

            // Write the encrypted data to a temporary file
            const tempEncryptedFilePath = `${filePath}.enc`;
            fs.writeFileSync(tempEncryptedFilePath, encryptedBuffer);

            // Check if the encrypted file exists before proceeding
            if (!fs.existsSync(tempEncryptedFilePath)) {
                console.error('Encrypted file does not exist.');
                showNotification('Encrypted file does not exist. Please try again.', 'error');
                return;
            }

            const formData = new FormData();
            formData.append('file', fs.createReadStream(tempEncryptedFilePath));

            formData.append('maxDownloads', 1);
            formData.append('expires', addDaysToDate(13));
            formData.append('autoDelete', 'true');

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
                    name: fileName,
                    created: response.data.created,
                    key: response.data.key,
                    maxDownloads: response.data.maxDownloads,
                    autoDelete: response.data.autoDelete,
                    expires: response.data.expires
                };
                recordFileInfo(fileInfo);

                // Clean up the temporary encrypted file
                fs.unlinkSync(tempEncryptedFilePath);  // Remove the temporary encrypted file

                // Remove the original unencrypted file
                fs.unlinkSync(filePath);  // Delete the original file
            } else {
                console.error('File upload failed:', response.data);
                showNotification('File upload failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error uploading file:', error);
            showNotification('Error uploading file. Please try again.', 'error');
        }
    });
}


// Delete file on File.io using the key
function deleteFile(fileKey) {
    axios.delete(`${baseUrl}${fileKey}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
        .then(response => {
            if (response.status === 200) {
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
                console.error('File deletion failed.');
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
        console.log('Response:', response.data);
        const files = response.data.nodes;
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

    if (files.length === 0) {
        // If the array is empty, display a message
        const emptyMessageRow = document.createElement('tr');
        const emptyMessageCell = document.createElement('td');
        emptyMessageCell.colSpan = 5; // Span across all columns
        emptyMessageCell.textContent = 'No files available.';
        emptyMessageCell.style.textAlign = 'center';
        emptyMessageRow.appendChild(emptyMessageCell);
        fileListContainer.appendChild(emptyMessageRow);
        return;
    }

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
            downloadFile(file.key, destinationPath);
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
function downloadFile(fileKey, destinationPath) {
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
            decryptFile(encryptedFilePath, encryptKey);
            //await decryptFile(encryptedFilePath, key, iv, destinationPath);
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