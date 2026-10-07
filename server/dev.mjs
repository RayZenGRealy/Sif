import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const gatewayPath = fileURLToPath(new URL('./index.mjs', import.meta.url));
const vitePath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const children = [
  spawn(process.execPath, [gatewayPath], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [vitePath], { stdio: 'inherit', env: process.env }),
];

let closing = false;
function closeAll(signal = 'SIGTERM') {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', code => {
    if (!closing && code && code !== 0) {
      closeAll();
      process.exitCode = code;
    }
  });
}

process.on('SIGINT', () => closeAll('SIGINT'));
process.on('SIGTERM', () => closeAll('SIGTERM'));
