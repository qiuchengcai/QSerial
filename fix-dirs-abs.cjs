const fs = require("fs");
const base = "D:/QPrj/QSerial/packages/main/src";

// Fix FTP manager
let ftp = fs.readFileSync(base + "/ftp/manager.ts", "utf8");
const oldFtp = 'if (!rootDir || !fs.existsSync(rootDir)) {\r\n    throw new Error(`???????: ${rootDir}`);\r\n  }';
const newFtp = 'if (!rootDir || !fs.existsSync(rootDir)) {\r\n        console.warn(`[FTP] Shared dir not found: ${rootDir}, skipping`);\r\n        serverError = `Shared dir not found: ${rootDir}`;\r\n        return;\r\n      }';
if (ftp.includes(oldFtp)) {
  ftp = ftp.replace(oldFtp, newFtp);
  fs.writeFileSync(base + "/ftp/manager.ts", ftp);
  console.log("FTP: fixed");
} else {
  console.log("FTP: pattern not found");
}

// Fix NFS manager
let nfs = fs.readFileSync(base + "/nfs/manager.ts", "utf8");
const oldNfs = '    throw new Error(`???????: ${exportDir}`);';
const newNfs = '    console.warn(`[NFS] Shared dir not found: ${exportDir}, skipping`);\r\n      return;';
const count = (nfs.match(/throw new Error\(`???????: \$\{exportDir\}`\);/g) || []).length;
if (count > 0) {
  nfs = nfs.replaceAll(oldNfs, newNfs);
  fs.writeFileSync(base + "/nfs/manager.ts", nfs);
  console.log("NFS: fixed " + count + " occurrences");
} else {
  console.log("NFS: pattern not found");
}
