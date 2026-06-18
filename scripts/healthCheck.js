/**
 * healthCheck.js
 * Internal health check — pings localhost (not an external curl call)
 * and restarts the app via the start script if it's unresponsive.
 * Run via cron every 5 minutes.
 */
const http = require('http');
const { exec } = require('child_process');

const options = { host: 'localhost', port: 3000, path: '/', timeout: 5000 };

const req = http.get(options, (res) => {
  if (res.statusCode === 200 || res.statusCode === 301) {
    console.log(`[healthCheck] OK (${res.statusCode}) at ${new Date().toISOString()}`);
    process.exit(0);
  } else {
    console.log(`[healthCheck] Unexpected status ${res.statusCode}, restarting...`);
    restart();
  }
});

req.on('error', (err) => {
  console.log(`[healthCheck] FAILED (${err.message}) at ${new Date().toISOString()}, restarting...`);
  restart();
});

req.on('timeout', () => {
  req.destroy();
  console.log(`[healthCheck] TIMEOUT at ${new Date().toISOString()}, restarting...`);
  restart();
});

function restart() {
  exec(`${process.env.HOME}/start_twerkie.sh`, (error, stdout, stderr) => {
    if (error) console.error(`[healthCheck] Restart error: ${error.message}`);
    else console.log(`[healthCheck] Restart triggered: ${stdout}`);
    process.exit(1);
  });
}
