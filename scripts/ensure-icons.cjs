let fs = require('fs');
let path = require('path');

// This script runs after electron-builder packaging.
// It ensures the product icon is available at runtime for BrowserWindow.setIcon().
const releaseDir = path.resolve(__dirname, '../release/win-unpacked/resources');
const sources = [
    path.resolve(__dirname, '../resources/icon.png'),
    path.resolve(__dirname, '../build/icon.ico'),
];

if (!fs.existsSync(releaseDir)) {
    console.log('release/win-unpacked/resources not found, skipping');
    process.exit(0);
}

for (const src of sources) {
    const dest = path.join(releaseDir, path.basename(src));
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('copied:', path.basename(src));

        // Also copy to the NSIS/portable build dirs if they exist
        const nsisDir = path.resolve(__dirname, '../release/win-unpacked');
        const nsisDest = path.join(nsisDir, path.basename(src));
        fs.copyFileSync(src, nsisDest);
        console.log('copied to app root:', path.basename(src));
    } else {
        console.log('source not found:', src);
    }
}
