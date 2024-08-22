const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const WinReg = require('winreg');
const fs = require('fs');

// Function to add virtual folder on Windows
function addWindowsVirtualFolder(folderName, executablePath) {
    const clsid = `{${require('uuid').v4()}}`;
    const regKey = new WinReg({
        hive: WinReg.HKLM,
        key: `\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}`
    });

    regKey.set('', WinReg.REG_SZ, folderName, (err) => {
        if (err) {
            console.error('Error setting registry value:', err);
            return;
        }

        console.log(`Virtual folder '${folderName}' added to This PC.`);

        const commandKey = new WinReg({
            hive: WinReg.HKLM,
            key: `\\SOFTWARE\\Classes\\CLSID\\${clsid}\\DefaultIcon`
        });

        commandKey.set('', WinReg.REG_SZ, executablePath, (err) => {
            if (err) {
                console.error('Error setting executable path:', err);
            } else {
                console.log(`Executable path set to '${executablePath}'.`);
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