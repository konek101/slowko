const https = require('https');
const fs = require('fs');
const path = require('path');

// simplewebserver.js
// Simple HTTPS server serving index.html at "/"


// Hardcoded port
const PORT = 20016;

// Paths to Let's Encrypt certs
const CERT_BASE = '/mounts/letsencrypt/live/serwer.gtadubbing.pl';
const options = {
    key: fs.readFileSync(path.join(CERT_BASE, 'privkey.pem')),
    cert: fs.readFileSync(path.join(CERT_BASE, 'fullchain.pem'))
};

// Preload index.html (reload if missing or changed on error)
let indexCache = null;
const indexPath = path.join(__dirname, 'index.html');
function loadIndex() {
    try {
        indexCache = fs.readFileSync(indexPath);
    } catch (e) {
        indexCache = Buffer.from('<h1>index.html not found</h1>');
    }
}
loadIndex();


// Serve any other static files safely from this directory
const PUBLIC_DIR = __dirname;

// Wrap https.createServer to extend existing inline handler below
const _origCreateServer = https.createServer;
https.createServer = function (opts, originalListener) {
    function extendedListener(req, res) {
        // Let original handler deal with "/" and "/index.html"
        if (req.url === '/' || req.url === '/index.html') {
            return originalListener(req, res);
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Method Not Allowed');
        }

        try {
            const rawPath = decodeURIComponent(req.url.split('?')[0]);
            // Disallow query traversal
            if (rawPath.includes('\0')) throw new Error('Bad path');
            let safePath = path.normalize(rawPath).replace(/^([/\\])+/, ''); // drop leading slashes
            if (safePath.includes('..')) throw new Error('Traversal');
            if (safePath === '') safePath = 'index.html';
            const filePath = path.join(PUBLIC_DIR, safePath);

            // Ensure file is inside PUBLIC_DIR
            if (!filePath.startsWith(PUBLIC_DIR)) throw new Error('Traversal');

            fs.stat(filePath, (err, stat) => {
                if (err || !stat.isFile()) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    return res.end('Not Found');
                }

                const ext = path.extname(filePath).toLowerCase();
                const mime =
                    ({
                        '.html': 'text/html; charset=utf-8',
                        '.htm': 'text/html; charset=utf-8',
                        '.js': 'application/javascript; charset=utf-8',
                        '.mjs': 'application/javascript; charset=utf-8',
                        '.css': 'text/css; charset=utf-8',
                        '.json': 'application/json; charset=utf-8',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.ico': 'image/x-icon',
                        '.txt': 'text/plain; charset=utf-8',
                        '.wav': 'audio/wav',
                        '.mp3': 'audio/mpeg',
                        '.mp4': 'video/mp4',
                        '.webm': 'video/webm',
                        '.woff': 'font/woff',
                        '.woff2': 'font/woff2',
                        '.ttf': 'font/ttf',
                        '.otf': 'font/otf',
                        '.map': 'application/json; charset=utf-8'
                    }[ext]) || 'application/octet-stream';

                res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
                if (req.method === 'HEAD') return res.end();
                const stream = fs.createReadStream(filePath);
                stream.on('error', () => {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Internal Server Error');
                });
                stream.pipe(res);
            });
        } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Bad Request');
        }
    }
    return _origCreateServer.call(https, opts, extendedListener);
};
const server = https.createServer(options, (req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(indexCache);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
});

server.listen(PORT, () => {
    console.log(`HTTPS server listening on port ${PORT}`);
});