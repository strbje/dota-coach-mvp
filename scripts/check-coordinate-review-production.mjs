import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

// Integration regression: notFound() inside a loading boundary can stream HTTP 200.
// Run after next build. No provider credentials or external network are needed.
const fixture = JSON.parse(await readFile('docs/research/stratz-coordinates/visual-review-data.json', 'utf8'));
const port = 32150;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start',
  '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe']
});
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Production server start timed out')), 30_000);
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`Production server exited: ${code}`)));
    server.stdout.on('data', (data) => { if (data.toString().includes('Ready')) resolve(); });
    server.stderr.on('data', (data) => process.stderr.write(data));
  });
  clearTimeout(timer);
  for (const [route, rsc] of [['/', false], ['/debug/coordinates', false],
    ['/debug/coordinates?enabled=true&debug=1', false], ['/debug/coordinates', true]]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      headers: rsc ? { RSC: '1' } : {}, signal: AbortSignal.timeout(20_000)
    });
    const body = await response.text();
    if (rsc) {
      // Flight uses HTTP 200 transport but must carry the not-found boundary, not data.
      assert.equal(response.status, 200);
      assert.match(body, /NEXT_HTTP_ERROR_FALLBACK;404/);
      assert(!body.includes('captureSha256'));
    } else {
      assert.equal(response.status, route === '/' ? 200 : 404, route);
    }
    assert(!body.includes(fixture.source.captureSha256), 'Research fixture leaked');
    console.log(`${rsc ? 'RSC boundary 404' : `HTTP ${response.status}`} ${route}`);
  }
} finally {
  clearTimeout(timer);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
}
