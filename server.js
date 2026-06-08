/**
 * server.js
 * ---------
 * Lightweight dev server that serves static files AND provides a
 * CORS proxy endpoint for the shipyard API (which lacks CORS headers).
 *
 * Usage:  node server.js
 * Serves: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_URL = 'https://task1-nsaic.vercel.app/api/ships';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // CORS proxy endpoint
    if (req.url === '/api/ships') {
        return proxyApiRequest(req, res);
    }

    // Static file serving
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

function proxyApiRequest(req, res) {
    console.log(`[Proxy] Fetching ${API_URL}`);

    https.get(API_URL, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            });
            res.end(body);
            console.log(`[Proxy] Returned ${body.length} bytes`);
        });
    }).on('error', (err) => {
        console.error('[Proxy] Error:', err.message);
        res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ error: err.message }));
    });
}

server.listen(PORT, () => {
    console.log(`\n  🚀 Hostile Data Dashboard`);
    console.log(`  ────────────────────────`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Proxy:   http://localhost:${PORT}/api/ships → ${API_URL}`);
    console.log(`  Press Ctrl+C to stop\n`);
});
