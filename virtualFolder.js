const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

function ensureDirectoryExists(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
        console.log(`Directory created: ${directoryPath}`);
    } else {
        console.log(`Directory already exists: ${directoryPath}`);
    }
}

function copyIcon(iconSrcPath, iconDestPath) {
    // Ensure the destination directory exists
    const destDir = path.dirname(iconDestPath);
    ensureDirectoryExists(destDir);

    // Copy the icon file
    try {
        fs.copyFileSync(iconSrcPath, iconDestPath);
        console.log(`Icon copied to managed directory: ${iconDestPath}`);
    } catch (copyError) {
        console.error('Error copying icon:', copyError);
    }
}

function addWindowsVirtualFolder(folderName, managedDirPath, iconPath) {
    const clsid = `{aa33752f-8df2-4eea-ac47-25ae57bd5637}`;
    const keyPath = `HKCU\\Software\\Classes\\CLSID\\${clsid}`;

    // Ensure the managed directory path exists
    if (!fs.existsSync(managedDirPath)) {
        fs.mkdirSync(managedDirPath, { recursive: true });
        console.log(`Managed directory created at: ${managedDirPath}`);
    } else {
        console.log(`Managed directory already exists at: ${managedDirPath}`);
    }

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

        // Copy the icon to the managed folder
        const iconSrcPath = path.join(__dirname, 'app-icon.ico');
        const iconDestPath = path.join(iconPath, 'app-icon.ico');

        copyIcon(iconSrcPath, iconDestPath);

        // Set the default icon for the folder (Optional)
        const commandDefaultIcon = `reg add "${keyPath}\\DefaultIcon" /ve /t REG_SZ /d "${iconDestPath}" /f`;
        exec(commandDefaultIcon, (iconError, iconStdout, iconStderr) => {
            if (iconError) {
                console.error('Error setting folder icon:', iconError);
            } else {
                console.log('Folder icon set successfully.');
            }
        });

        // Set the folder's default path to the managedDirPath
        const commandInstance = `reg add "${keyPath}\\Instance\\InitPropertyBag" /v "Target" /t REG_EXPAND_SZ /d "${managedDirPath}" /f`;
        exec(commandInstance, (instanceError, instanceStdout, instanceStderr) => {
            if (instanceError) {
                console.error('Error setting managed directory path:', instanceError);
            } else {
                console.log('Managed directory path set successfully:', managedDirPath);
            }
        });

        // Add the folder to "This PC"
        const thisPcKeyPath = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MyComputer\\NameSpace\\${clsid}`;
        const thisPcCommand = `reg add "${thisPcKeyPath}" /f`;

        exec(thisPcCommand, (thisPcError, thisPcStdout, thisPcStderr) => {
            if (thisPcError) {
                console.error('Error adding virtual folder to This PC:', thisPcError);
            } 
            else {
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

// Create and manage the directory, and integrate it as a virtual folder
function integrateVirtualFolder(isAuthenticated) {
    if (!isAuthenticated) {
        console.log('User is not authenticated. Virtual folder access denied.');
        return;
    }
    const platform = os.platform();
    const folderName = 'ElectroShare';

    // Create the managed directory
    const userHomeDir = os.homedir();
    const managedDirPath = path.join(userHomeDir, folderName);
    const iconPath = path.join(userHomeDir, 'ElectroShareIcon');

    if (!fs.existsSync(managedDirPath)) {
        fs.mkdirSync(managedDirPath);
        console.log(`Managed directory created at: ${managedDirPath}`);
    } else {
        console.log('Managed directory already exists.');
    }

    if (platform === 'win32') {
        addWindowsVirtualFolder(folderName, managedDirPath, iconPath);
    } else if (platform === 'darwin') {
        addMacOSSymlink(folderName, managedDirPath);
    } else {
        console.log('Unsupported OS for virtual folder integration.');
    }

    return managedDirPath;
}

module.exports = integrateVirtualFolder;