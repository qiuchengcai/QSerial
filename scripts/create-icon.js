const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const width = 128;
const height = 128;

// PNG 文件头
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
    const typeBuffer = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc32(crcData));
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// IHDR chunk
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr.writeUInt8(8, 8);
ihdr.writeUInt8(2, 9); // RGB
ihdr.writeUInt8(0, 10);
ihdr.writeUInt8(0, 11);
ihdr.writeUInt8(0, 12);

// 创建图像数据
const rawData = Buffer.alloc(height * (1 + width * 3));

for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0;
    for (let x = 0; x < width; x++) {
        const pixelStart = rowStart + 1 + x * 3;
        // 终端风格蓝色渐变
        rawData[pixelStart] = 30;
        rawData[pixelStart + 1] = 80;
        rawData[pixelStart + 2] = 150;
    }
}

const compressed = zlib.deflateSync(rawData);
const idat = createChunk('IDAT', compressed);
const iend = createChunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    idat,
    iend
]);

const iconPath = path.join(__dirname, '..', 'resources', 'icon.png');
fs.writeFileSync(iconPath, png);
console.log('Created:', iconPath);
