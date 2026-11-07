'use strict';

/**
 * Cine a Dois — servidor de sinalização WebRTC + arquivos estáticos.
 *
 * O servidor NÃO recebe vídeo nem áudio: ele só apresenta os dois navegadores
 * (troca de SDP/ICE), repassa o chat e entrega credenciais temporárias do TURN.
 * A mídia vai direto de um aparelho para o outro (ou via coturn, se a rede exigir).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

// ---------------------------------------------------------------- config
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const TURN_SECRET = process.env.TURN_SECRET || '';
const TURN_HOST = process.env.TURN_HOST || '';
const TURN_PORT = Number(process.env.TURN_PORT || 3478);
const TURN_TLS_PORT = Number(process.env.TURN_TLS_PORT || 0); // 0 = sem TURNS
const TURN_TTL = Number(process.env.TURN_TTL || 12 * 3600);
const ACCESS_CODE = process.env.ACCESS_CODE || ''; // se definido, exige código para CRIAR salas
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const MAX_PEERS = 2;
const MAX_ROOMS = 200;
const ROOM_IDLE_MS = 30 * 60 * 1000; // sala vazia some após 30 min
const ROOM_MAX_AGE_MS = 48 * 3600 * 1000;
const MAX_CHAT_LEN = 1000;
const MAX_NAME_LEN = 30;

// ---------------------------------------------------------------- helpers
const log = (...a) => console.log(new Date().toISOString(), ...a);
const mask = (s) => (s ? String(s).slice(0, 3) + '…' : '-');

function randomId(len = 10) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return { salt, hash };
}

function checkPassword(pw, stored) {
  const hash = crypto.scryptSync(String(pw || ''), stored.salt, 32);
  return crypto.timingSafeEqual(hash, stored.hash);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function turnCredentials(peerId) {
  const servers = [{ urls: ['stun:stun.l.google.com:19302'] }];
  if (!TURN_SECRET || !TURN_HOST) return servers;
  const username = `${Math.floor(Date.now() / 1000) + TURN_TTL}:${peerId}`;
  const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  const urls = [
    `stun:${TURN_HOST}:${TURN_PORT}`,
    `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
    `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
  ];
  if (TURN_TLS_PORT) urls.push(`turns:${TURN_HOST}:${TURN_TLS_PORT}?transport=tcp`);
  servers.unshift({ urls, username, credential });
  return servers;
}

// Limite simples por IP (janela deslizante em memória).
const buckets = new Map();
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) if (!arr.some((t) => now - t < 3600_000)) buckets.delete(k);
}, 600_000).unref();

// ---------------------------------------------------------------- rooms
/** @type {Map<string, {id:string, pw:null|{salt:Buffer,hash:Buffer}, peers:Map<string, any>, createdAt:number, emptySince:number}>} */
const rooms = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const idle = room.peers.size === 0 && now - room.emptySince > ROOM_IDLE_MS;
    const old = now - room.createdAt > ROOM_MAX_AGE_MS;
    if (idle || old) {
      for (const ws of room.peers.values()) ws.close(4000, 'sala expirada');
      rooms.delete(id);
      log('sala removida', mask(id));
    }
  }
}, 60_000).unref();

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/manifest+json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "connect-src 'self' ws: wss:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '),
  'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), screen-wake-lock=(self)',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, SECURITY_HEADERS).end();
    return;
  }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }).end('ok');
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel.startsWith('/s/')) rel = '/index.html'; // /s/<sala> abre o app
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, SECURITY_HEADERS).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS }).end('não encontrado');
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      ...SECURITY_HEADERS,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  }
  return req.socket.remoteAddress || '?';
}

function leaveRoom(ws) {
  const room = ws.roomId && rooms.get(ws.roomId);
  if (!room) return;
  room.peers.delete(ws.peerId);
  if (room.peers.size === 0) room.emptySince = Date.now();
  for (const other of room.peers.values()) send(other, { t: 'peer-left', id: ws.peerId });
  log('saiu', mask(room.id), 'pessoas:', room.peers.size);
  ws.roomId = null;
}

wss.on('connection', (ws, req) => {
  ws.ip = clientIp(req);
  ws.peerId = randomId(12);
  ws.roomId = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    if (rateLimited('msg:' + ws.peerId, 400, 10_000)) return; // anti-flood
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'create': {
        if (rateLimited('create:' + ws.ip, 20, 3600_000)) return send(ws, { t: 'error', code: 'rate', msg: 'Muitas salas criadas. Tente mais tarde.' });
        if (ACCESS_CODE && !safeEqual(msg.accessCode || '', ACCESS_CODE)) {
          return send(ws, { t: 'error', code: 'access', msg: 'Código de acesso inválido.' });
        }
        if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', code: 'full', msg: 'Servidor cheio.' });
        const password = typeof msg.password === 'string' ? msg.password.slice(0, 100) : '';
        let id;
        do id = randomId(10);
        while (rooms.has(id));
        rooms.set(id, {
          id,
          pw: password ? hashPassword(password) : null,
          peers: new Map(),
          createdAt: Date.now(),
          emptySince: Date.now(),
        });
        log('sala criada', mask(id), password ? '(com senha)' : '(sem senha)');
        return send(ws, { t: 'created', room: id });
      }

      case 'info': {
        const room = rooms.get(String(msg.room || ''));
        if (!room) return send(ws, { t: 'info', exists: false });
        return send(ws, { t: 'info', exists: true, needsPassword: !!room.pw, full: room.peers.size >= MAX_PEERS });
      }

      case 'join': {
        if (ws.roomId) leaveRoom(ws);
        const room = rooms.get(String(msg.room || ''));
        if (!room) return send(ws, { t: 'error', code: 'noroom', msg: 'Sala não encontrada ou expirada.' });
        if (room.pw) {
          if (rateLimited('pw:' + ws.ip + ':' + room.id, 8, 600_000)) {
            return send(ws, { t: 'error', code: 'rate', msg: 'Muitas tentativas. Aguarde alguns minutos.' });
          }
          if (!checkPassword(msg.password, room.pw)) return send(ws, { t: 'error', code: 'password', msg: 'Senha incorreta.' });
        }
        if (room.peers.size >= MAX_PEERS) return send(ws, { t: 'error', code: 'full', msg: 'A sala já tem 2 pessoas.' });

        const name = String(msg.name || 'Convidado').replace(/[\u0000-\u001f]/g, '').trim().slice(0, MAX_NAME_LEN) || 'Convidado';
        ws.name = name;
        ws.roomId = room.id;
        const peers = [...room.peers.values()].map((p) => ({ id: p.peerId, name: p.name }));
        room.peers.set(ws.peerId, ws);
        send(ws, { t: 'joined', room: room.id, you: ws.peerId, peers, iceServers: turnCredentials(ws.peerId) });
        for (const other of room.peers.values()) if (other !== ws) send(other, { t: 'peer-joined', id: ws.peerId, name });
        log('entrou', mask(room.id), 'pessoas:', room.peers.size);
        return;
      }

      case 'signal':
      case 'state': {
        const room = ws.roomId && rooms.get(ws.roomId);
        if (!room) return;
        const target = room.peers.get(String(msg.to || ''));
        if (!target) return;
        return send(target, { t: msg.t, from: ws.peerId, data: msg.data });
      }

      case 'chat': {
        const room = ws.roomId && rooms.get(ws.roomId);
        if (!room) return;
        if (rateLimited('chat:' + ws.peerId, 20, 10_000)) return;
        const text = String(msg.text || '').slice(0, MAX_CHAT_LEN).trim();
        if (!text) return;
        const out = { t: 'chat', from: ws.peerId, name: ws.name, text, ts: Date.now() };
        for (const p of room.peers.values()) send(p, out);
        return;
      }

      case 'leave':
        return leaveRoom(ws);

      case 'ping':
        return send(ws, { t: 'pong' });
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => {});
});

// derruba conexões mortas (tablet que dormiu, rede caiu)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25_000).unref();

server.listen(PORT, () => {
  log(`Cine a Dois rodando na porta ${PORT}`);
  log(TURN_SECRET && TURN_HOST ? `TURN: ${TURN_HOST}:${TURN_PORT}` : 'AVISO: TURN não configurado (só STUN público).');
  if (ACCESS_CODE) log('Criação de salas protegida por código de acesso.');
});

function shutdown() {
  log('encerrando…');
  for (const ws of wss.clients) ws.close(1001, 'servidor reiniciando');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
