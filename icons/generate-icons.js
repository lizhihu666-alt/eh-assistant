const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (y >= top + radius && y <= bottom - radius && x >= left && x <= right) return true;
  const cx = x < left + radius ? left + radius : right - radius;
  const cy = y < top + radius ? top + radius : bottom - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function colorAt(x, y) {
  let color = [0, 0, 0, 0];
  if (insideRoundedRect(x, y, 0, 0, 128, 128, 24)) color = [16, 24, 40, 255];

  const inRect = (left, top, width, height) => x >= left && x < left + width && y >= top && y < top + height;
  const white = [255, 255, 255, 255];
  const blue = [79, 140, 255, 255];
  if (inRect(24, 30, 12, 68) || inRect(24, 30, 38, 12) || inRect(24, 58, 34, 12) || inRect(24, 86, 38, 12)) color = white;
  if (inRect(68, 30, 12, 68) || inRect(100, 30, 12, 68) || inRect(68, 58, 44, 12)) color = blue;

  const dotDistance = (x - 106) ** 2 + (y - 22) ** 2;
  if (dotDistance <= 10 ** 2) color = [16, 24, 40, 255];
  if (dotDistance <= 6 ** 2) color = [32, 201, 151, 255];
  return color;
}

function render(size) {
  const scale = 4;
  const data = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const sample = colorAt(
            ((px + (sx + 0.5) / scale) / size) * 128,
            ((py + (sy + 0.5) / scale) / size) * 128
          );
          sample.forEach((value, index) => { sums[index] += value; });
        }
      }
      const offset = (py * size + px) * 4;
      sums.forEach((value, index) => { data[offset + index] = Math.round(value / (scale * scale)); });
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    data.copy(scanlines, rowOffset + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

[16, 32, 48, 128].forEach(size => {
  fs.writeFileSync(path.join(__dirname, `icon-${size}.png`), render(size));
});
