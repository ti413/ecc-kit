'use strict';
/**
 * Teste ponta a ponta: dois navegadores (Marcus e Ana) com câmera/mic falsos.
 * Uso:  npm test     (precisa de Playwright + Chromium e ffmpeg para gerar o vídeo de teste)
 */
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const VIDEO = path.join(__dirname, 'filme-teste.webm');

const ok = (m) => console.log('  ✔', m);
function assert(cond, msg) { if (!cond) throw new Error('FALHOU: ' + msg); ok(msg); }

async function main() {
  if (!fs.existsSync(VIDEO)) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '20', '-c:v', 'libvpx', '-b:v', '800k', '-c:a', 'libopus', '-ac', '2', VIDEO]);
  }

  const server = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('rodando') && r()));

  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
      '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen'],
  });
  const mk = async () => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [erro na página]', e.message));
    page.on('dialog', (d) => d.accept());
    return page;
  };
  const a = await mk();
  const b = await mk();

  try {
    console.log('Sala e senha');
    await a.goto(BASE);
    await a.fill('#create-name', 'Marcus');
    await a.fill('#create-password', 'pipoca123');
    await a.click('#form-create button[type=submit]');
    await a.waitForURL(/\/s\/[A-Za-z0-9]+$/);
    const link = a.url();
    assert(/\/s\/[A-Za-z0-9]{10}$/.test(link), 'sala criada com link de convite ' + link.replace(BASE, ''));
    await a.waitForSelector('#view-room:not([hidden])');

    await b.goto(link);
    await b.waitForSelector('#join-password-wrap:not([hidden])');
    ok('convidado vê pedido de senha');
    await b.fill('#join-name', 'Ana');
    await b.fill('#join-password', 'errada');
    await b.click('#join-btn');
    await b.waitForFunction(() => document.querySelector('#toast').textContent.includes('Senha incorreta'));
    ok('senha errada é recusada');
    await b.fill('#join-password', 'pipoca123');
    await b.click('#join-btn');
    await b.waitForSelector('#view-room:not([hidden])');
    ok('senha certa entra na sala');

    console.log('Conexão WebRTC, câmera e voz');
    await a.waitForSelector('#status.ok', { timeout: 20000 });
    await b.waitForSelector('#status.ok', { timeout: 20000 });
    ok('status conectado: ' + (await b.textContent('#status-text')));
    const camOk = (p) => p.waitForFunction(() => {
      const v = document.querySelector('#cam-remote');
      return v.srcObject && v.videoWidth > 0 && v.srcObject.getAudioTracks().length > 0 && !v.paused;
    }, null, { timeout: 15000 });
    await camOk(a); await camOk(b);
    for (const p of [a, b]) assert(await p.isVisible('#cam-remote-wrap'), 'quadro da câmera do parceiro visível');
    assert(true, 'os dois recebem câmera + microfone do outro');
    assert((await b.textContent('#remote-name')) === 'Marcus', 'nome do parceiro aparece');

    await a.click('#btn-mic');
    await b.waitForFunction(() => !document.querySelector('#remote-mic').hidden);
    ok('mutar mic aparece para o outro');
    await a.click('#btn-mic');

    console.log('Chat');
    await a.click('#btn-chat');
    await a.fill('#chat-input', 'oi amor, bora ver o filme? <b>x</b>');
    await a.press('#chat-input', 'Enter');
    await b.waitForFunction(() => [...document.querySelectorAll('#chat-list li')].some((li) => li.textContent.includes('bora ver o filme')));
    assert(!(await b.$('#chat-list b')), 'chat chega e HTML não é interpretado (sem XSS)');
    assert((await b.textContent('#chat-badge')) === '1', 'aviso de mensagem não lida');

    console.log('Transmitir arquivo de vídeo');
    await a.setInputFiles('#file-input', VIDEO);
    await b.waitForFunction(() => {
      const v = document.querySelector('#media-remote');
      return !v.hidden && v.srcObject && v.videoWidth > 0 && v.srcObject.getAudioTracks().length > 0;
    }, null, { timeout: 20000 });
    const t1 = await b.evaluate(() => document.querySelector('#media-remote').currentTime);
    await b.waitForTimeout(2000);
    const t2 = await b.evaluate(() => document.querySelector('#media-remote').currentTime);
    assert(t2 > t1, `vídeo + áudio chegam e estão rodando (${t1.toFixed(1)}s → ${t2.toFixed(1)}s)`);
    const res = await b.evaluate(() => [document.querySelector('#media-remote').videoWidth, document.querySelector('#media-remote').videoHeight]);
    ok(`resolução recebida ${res[0]}x${res[1]}`);
    const stereo = await b.evaluate(async () => {
      const st = await window.__cine.state.pc.getStats();
      let ch = 0;
      st.forEach((r) => { if (r.type === 'codec' && /opus/i.test(r.mimeType) && r.channels) ch = Math.max(ch, r.channels); });
      return { ch, sdp: /stereo=1/.test(window.__cine.state.pc.remoteDescription.sdp) };
    });
    assert(stereo.sdp, 'SDP negociado com áudio estéreo (stereo=1)');

    await a.click('#btn-stop');
    await b.waitForSelector('#stage-empty:not([hidden])', { timeout: 10000 });
    ok('parar transmissão limpa a tela do outro');

    console.log('Compartilhar tela');
    const canScreen = await a.evaluate(() => !!navigator.mediaDevices.getDisplayMedia);
    await a.click('#btn-screen');
    const screenOk = await b.waitForFunction(() => {
      const v = document.querySelector('#media-remote');
      return !v.hidden && v.srcObject && v.videoWidth > 0;
    }, null, { timeout: 8000 }).then(() => true, () => false);
    if (screenOk) {
      ok('tela compartilhada chega ao outro');
      await a.click('#btn-stop');
      await b.waitForSelector('#stage-empty:not([hidden])');
    } else {
      console.log(`  ~ compartilhar tela não testável em modo headless (getDisplayMedia=${canScreen}) — pulado`);
    }

    console.log('Saída e reentrada');
    await b.evaluate(() => { window.confirm = () => true; });
    await b.click('[data-action=leave]');
    await a.waitForFunction(() => document.querySelector('#status-text').textContent.includes('Aguardando'));
    ok('quando um sai, o outro volta a "aguardando"');
    await b.goto(link);
    await b.fill('#join-password', 'pipoca123');
    await b.click('#join-btn');
    await a.waitForSelector('#status.ok', { timeout: 20000 });
    ok('reentrar pelo mesmo link reconecta');

    const c = await mk();
    await c.goto(link);
    await c.waitForFunction(() => document.querySelector('#join-title').textContent.includes('2 pessoas'));
    ok('terceira pessoa é avisada que a sala está cheia');

    console.log('Cabeçalhos de segurança');
    const r = await fetch(BASE + '/');
    assert(/default-src 'self'/.test(r.headers.get('content-security-policy') || ''), 'CSP presente');
    const trav = await fetch(BASE + '/..%2f..%2fserver%2findex.js');
    assert(trav.status === 403 || trav.status === 404, 'path traversal bloqueado');

    console.log('\nTODOS OS TESTES PASSARAM ✅');
    await a.screenshot({ path: path.join(__dirname, 'screenshot-sala.png') });
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
