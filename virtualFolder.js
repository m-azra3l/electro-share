const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Function to add virtual folder on Windows
function addWindowsVirtualFolder(folderName, executablePath) {
    const clsid = `{${require('uuid').v4()}}`;
    const keyPath = `HKCU\\Software\\Classes\\CLSID\\${clsid}`;
    const command = `reg add "${keyPath}" /ve /t REG_SZ /d "${folderName}" /f`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error setting registry value: ${error.message}`);
            if (error.message.includes('Access is denied')) {
                console.error('Please run the application as an administrator to modify the registry.');
            }
            return;
        }
        console.log('Registry key added successfully:', stdout);

        const commandKeyPath = `HKCU\\Software\\Classes\\CLSID\\${clsid}\\DefaultIcon`;
        const commandIcon = `reg add "${commandKeyPath}" /ve /t REG_SZ /d "${executablePath}" /f`;

        exec(commandIcon, (iconError, iconStdout, iconStderr) => {
            if (iconError) {
                console.error('Error setting executable path:', iconError);
            } else {
                console.log(`Executable path set to '${executablePath}'.`);
            }
        });

        // Add to 'This PC'
        const thisPcKeyPath = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}`;
        const thisPcCommand = `reg add "${thisPcKeyPath}" /f`;

        exec(thisPcCommand, (thisPcError, thisPcStdout, thisPcStderr) => {
            if (thisPcError) {
                console.error('Error adding virtual folder to This PC:', thisPcError);
            } else {
                console.log(`Virtual folder '${folderName}' added to This PC.`);
            }
        });
    });
}

// Function to add symlink on macOS
function addMacOSSymlink(folderName, targetPath) {
    const homeDir = os.homedir();
    const symlinkPath = path.join(homeDir, folderName);

    if (fs.existsSync(symlinkPath)) {
        console.log(`Symlink '${folderName}' already exists.`);
    } else {
        try {
            fs.symlinkSync(targetPath, symlinkPath);
            console.log(`Symlink '${folderName}' created.`);
        } catch (error) {
            console.error('Error creating symlink:', error);
        }
    }
}

// Function to handle OS-specific folder integration
function integrateVirtualFolder() {
    const platform = os.platform();
    const folderName = 'ElectroShare';

    if (platform === 'win32') {
        const executablePath = path.join(__dirname, 'C:\\ElectroShare\\ElectroShare.exe');
        addWindowsVirtualFolder(folderName, executablePath);
    } else if (platform === 'darwin') {
        const targetPath = path.join(__dirname, 'ElectroShare.app/Contents/MacOS/ElectroShare');
        addMacOSSymlink(folderName, targetPath);
    } else {
        console.log('Unsupported OS for virtual folder integration.');
    }
}

module.exports = integrateVirtualFolder;