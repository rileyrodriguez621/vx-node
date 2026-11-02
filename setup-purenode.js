// Pure-Node setup: downloads the pinned xray-core zip and extracts it with a
// built-in ZIP reader (zlib inflate) — no external `unzip` binary required.
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const url = 'https://github.com/XTLS/Xray-core/releases/download/v25.10.15/Xray-linux-64.zip';
const zip = path.join(__dirname, 'xray.zip');
const bin = path.join(__dirname, 'web-worker');
function get(u, file) {
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(file);
    https.get(u, { headers: { 'User-Agent': 'setup' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        f.close(); try { fs.unlinkSync(file); } catch (e) {}
        return get(res.headers.location, file).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      res.pipe(f); f.on('finish', () => f.close(resolve));
    }).on('error', reject);
  });
}
function extractZip(buf, destDir) {
  // Locate End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central dir');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    // Parse local header to find data start
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('unsupported method ' + method);
    if (!name.endsWith('/')) {
      const out = path.join(destDir, name);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
}
(async () => {
  if (!fs.existsSync(bin) || !fs.existsSync(path.join(__dirname, 'geoip.dat'))) {
    await get(url, zip);
    const buf = fs.readFileSync(zip);
    extractZip(buf, __dirname);
    fs.renameSync(path.join(__dirname, 'xray'), bin);
    fs.chmodSync(bin, 0o755);
    try { fs.unlinkSync(zip); } catch (e) {}
    for (const f of ['LICENSE', 'README.md']) { try { fs.unlinkSync(path.join(__dirname, f)); } catch (e) {} }
  }
  for (const f of ['geoip.dat', 'geosite.dat']) {
    if (!fs.existsSync(path.join(__dirname, f))) throw new Error('missing ' + f);
  }
  console.log('setup ok');
})().catch((e) => { console.error(e); process.exit(1); });
