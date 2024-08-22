const WinReg = require('winreg');

function addVirtualFolder(folderName, executablePath) {
    const clsid = `{${require('uuid').v4()}}`; // Generate a unique GUID
    const regKey = new WinReg({
        hive: WinReg.HKLM, // Use HKLM for system-wide registry changes
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

// Example usage:
const folderName = 'Electro Share';
const executablePath = 'C:\\ElectroShare\\ElectroShare.exe';
addVirtualFolder(folderName, executablePath);