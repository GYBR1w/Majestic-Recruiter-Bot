const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord Bot Status: OK');
});

server.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT} to keep bot awake.`);
});