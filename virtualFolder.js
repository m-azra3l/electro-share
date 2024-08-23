const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

function addWindowsVirtualFolder(folderName, managedDirPath) {
    const clsid = `{aa33752f-8df2-4eea-ac47-25ae57bd5637}`;
    const keyPath = `HKCU\\Software\\Classes\\CLSID\\${clsid}`;
    
    // Add registry entry for the virtual folder name
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

        // Set the path to the managed directory
        const commandShellFolder = `reg add "${keyPath}\\ShellFolder" /v "Attributes" /t REG_DWORD /d 0x20 /f`;
        exec(commandShellFolder, (shellFolderError, shellFolderStdout, shellFolderStderr) => {
            if (shellFolderError) {
                console.error('Error setting ShellFolder attributes:', shellFolderError);
            } else {
                console.log('ShellFolder attributes set successfully.');
            }
        });

        // Add the folder to "This PC"
        const thisPcKeyPath = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}`;
        const thisPcCommand = `reg add "${thisPcKeyPath}" /f`;

        exec(thisPcCommand, (thisPcError, thisPcStdout, thisPcStderr) => {
            if (thisPcError) {
                console.error('Error adding virtual folder to This PC:', thisPcError);
            } else {
                console.log(`Virtual folder '${folderName}' added to This PC.`);
            }
        });

        // Set the default icon for the folder (Optional)
        const commandDefaultIcon = `reg add "${keyPath}\\DefaultIcon" /ve /t REG_SZ /d "${path.join(managedDirPath, 'icon.ico')}" /f`;
        exec(commandDefaultIcon, (iconError, iconStdout, iconStderr) => {
            if (iconError) {
                console.error('Error setting folder icon:', iconError);
            } else {
                console.log('Folder icon set successfully.');
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

// Create and manage the directory, and integrate it as a virtual folder
function integrateVirtualFolder() {
    const platform = os.platform();
    const folderName = 'ElectroShare';

    // Create the managed directory
    const userHomeDir = os.homedir();
    const managedDirPath = path.join(userHomeDir, folderName);

    if (!fs.existsSync(managedDirPath)) {
        fs.mkdirSync(managedDirPath);
        console.log(`Managed directory created at: ${managedDirPath}`);
    } else {
        console.log('Managed directory already exists.');
    }

    if (platform === 'win32') {
        addWindowsVirtualFolder(folderName, managedDirPath);
    } else if (platform === 'darwin') {
        addMacOSSymlink(folderName, managedDirPath);
    } else {
        console.log('Unsupported OS for virtual folder integration.');
    }

    return managedDirPath;
}

module.exports = integrateVirtualFolder;