// Deployment readiness (PLAN.md milestone 6): the Render Blueprint, package.json, and the
// real `npm start` process listening on $PORT at 0.0.0.0 with a working /healthz.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { socketUrl } from '../public/js/net.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

describe('deployment', () => {
  it('render.yaml describes one free Node web service with the required commands', () => {
    const yaml = read('render.yaml');
    const field = (name) => yaml.match(new RegExp(`^\\s*-?\\s*${name}:\\s*([^\\s#]+)`, 'm'))?.[1];
    assert.equal(field('type'), 'web');
    assert.equal(field('runtime'), 'node');
    assert.equal(field('plan'), 'free');
    assert.equal(yaml.match(/^\s*buildCommand:\s*(.+?)\s*$/m)[1], 'npm install');
    assert.equal(yaml.match(/^\s*startCommand:\s*(.+?)\s*$/m)[1], 'npm start');
    assert.equal(field('healthCheckPath'), '/healthz');
    assert.equal((yaml.match(/^\s*- type:/gm) ?? []).length, 1, 'exactly one service');
  });

  it('package.json has the engines and scripts Render and contributors need', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.engines.node, '>=20');
    for (const script of ['start', 'dev', 'test']) assert.ok(pkg.scripts[script], `missing "${script}" script`);
    assert.equal(pkg.scripts.start, 'node server/index.js');
    assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['express', 'ws']);
  });

  it('client code never hardcodes a host, and uses wss:// on https', () => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|html|webmanifest)$/.test(name)) files.push(full);
      }
    };
    walk(path.join(ROOT, 'public'));
    for (const file of files) {
      const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!/localhost|127\.0\.0\.1|0\.0\.0\.0|:3000|onrender\.com/.test(code), `${path.relative(ROOT, file)} hardcodes a host`);
    }
    assert.equal(socketUrl({ protocol: 'https:', host: 'cheese-thief.onrender.com' }), 'wss://cheese-thief.onrender.com/ws');
    assert.equal(socketUrl({ protocol: 'http:', host: '192.168.1.20:3000' }), 'ws://192.168.1.20:3000/ws');
  });

  it('npm start listens on $PORT at 0.0.0.0, answers /healthz, and exits cleanly on SIGTERM', async () => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const line = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
        child.stdout.on('data', (d) => {
          if (/listening/.test(d)) {
            clearTimeout(timer);
            resolve(String(d));
          }
        });
        child.once('exit', (code) => reject(new Error(`server exited early (${code})`)));
      });
      assert.match(line, new RegExp(`0\\.0\\.0\\.0:${port}`));
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-cheese-thief'), '1');
    } finally {
      const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
      child.kill('SIGTERM');
      assert.equal(await exited, 0, 'clean exit on SIGTERM (Render redeploys send SIGTERM)');
    }
  });
});
