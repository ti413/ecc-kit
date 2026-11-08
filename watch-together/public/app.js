'use strict';
/* Cine a Dois — cliente WebRTC (vanilla JS). */
(() => {
  const $ = (s) => document.querySelector(s);
  const el = {
    home: $('#view-home'), join: $('#view-join'), room: $('#view-room'),
    formCreate: $('#form-create'), createName: $('#create-name'), createPassword: $('#create-password'),
    accessWrap: $('#access-wrap'), createAccess: $('#create-access'),
    formJoin: $('#form-join'), joinName: $('#join-name'), joinPassword: $('#join-password'),
    joinPasswordWrap: $('#join-password-wrap'), joinTitle: $('#join-title'), joinBtn: $('#join-btn'),
    stage: $('#stage'), mediaRemote: $('#media-remote'), mediaLocal: $('#media-local'),
    stageEmpty: $('#stage-empty'), stageMsg: $('#stage-msg'), sharingScreen: $('#sharing-screen'),
    unmuteBtn: $('#unmute-btn'),
    camRemote: $('#cam-remote'), camLocal: $('#cam-local'),
    camRemoteWrap: $('#cam-remote-wrap'), camLocalWrap: $('#cam-local-wrap'),
    remoteName: $('#remote-name'), remoteInitial: $('#remote-initial'), localInitial: $('#local-initial'),
    remoteMic: $('#remote-mic'), localMic: $('#local-mic'),
    status: $('#status'), statusText: $('#status-text'),
    btnMic: $('#btn-mic'), btnCam: $('#btn-cam'), btnScreen: $('#btn-screen'), btnFile: $('#btn-file'),
    btnStop: $('#btn-stop'), fileInput: $('#file-input'),
    volMedia: $('#vol-media'), volVoice: $('#vol-voice'),
    chat: $('#chat'), chatList: $('#chat-list'), formChat: $('#form-chat'), chatInput: $('#chat-input'),
    chatBadge: $('#chat-badge'), toast: $('#toast'),
  };

  const canShareScreen = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const canCaptureVideo = 'captureStream' in HTMLMediaElement.prototype || 'mozCaptureStream' in HTMLMediaElement.prototype;

  // ------------------------------------------------------------ estado
  const S = {
    ws: null, wsReady: null, reconnectTimer: null, intentionalClose: false,
    roomId: null, me: null, name: '', password: '', joined: false,
    iceServers: [],
    peer: null, // {id, name}
    pc: null, polite: false, makingOffer: false, ignoreOffer: false,
    camStream: new MediaStream(), micOn: false, camOn: false,
    media: null, // {kind:'screen'|'file', out:MediaStream, src:MediaStream, senders:Map<kind,RTCRtpSender>, url?}
    remote: { camId: null, mediaId: null, mediaKind: null, camOn: false, micOn: false },
    remoteStreams: new Map(), // id -> MediaStream
    unread: 0, wakeLock: null, statsTimer: null,
  };

  // ------------------------------------------------------------ util
  let toastTimer;
  function toast(msg, ms = 3500) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), ms);
  }
  function setStatus(text, kind = '') {
    el.statusText.textContent = text;
    el.status.className = 'status ' + kind;
  }
  function show(view) {
    for (const v of [el.home, el.join, el.room]) v.hidden = v !== view;
  }
  const initial = (n) => (n || '?').trim().charAt(0).toUpperCase() || '?';
  const loadName = () => { try { return localStorage.getItem('cine:name') || ''; } catch { return ''; } };
  const saveName = (n) => { try { localStorage.setItem('cine:name', n); } catch {} };
  const inviteUrl = () => `${location.origin}/s/${S.roomId}`;

  // ------------------------------------------------------------ websocket
  const handlers = new Map(); // tipo -> fn
  const waiters = []; // {types, resolve}

  function connectWs() {
    if (S.ws && (S.ws.readyState === WebSocket.OPEN || S.ws.readyState === WebSocket.CONNECTING)) return S.wsReady;
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const ws = new WebSocket(url);
    S.ws = ws;
    S.wsReady = new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('ws')), { once: true });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].types.includes(msg.t)) { waiters[i].resolve(msg); waiters.splice(i, 1); }
      }
      const h = handlers.get(msg.t);
      if (h) h(msg);
    });
    ws.addEventListener('close', () => {
      if (S.intentionalClose) return;
      if (S.joined) {
        setStatus('Conexão com o servidor caiu. Reconectando…', 'bad');
        clearTimeout(S.reconnectTimer);
        S.reconnectTimer = setTimeout(rejoin, 2000);
      }
    });
    return S.wsReady;
  }
  function wsSend(msg) {
    if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(msg));
  }
  function request(msg, types, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const w = { types, resolve };
      waiters.push(w);
      wsSend(msg);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); reject(new Error('timeout')); }
      }, timeout);
    });
  }

  async function rejoin() {
    try {
      await connectWs();
      const res = await request({ t: 'join', room: S.roomId, name: S.name, password: S.password }, ['joined', 'error']);
      if (res.t === 'error') { setStatus(res.msg, 'bad'); return; }
    } catch {
      clearTimeout(S.reconnectTimer);
      S.reconnectTimer = setTimeout(rejoin, 4000);
    }
  }

  // ------------------------------------------------------------ fluxo de telas
  async function route() {
    el.createName.value = el.joinName.value = loadName();
    const m = location.pathname.match(/^\/s\/([A-Za-z0-9]{6,20})\/?$/);
    if (!m) { show(el.home); return; }
    S.roomId = m[1];
    show(el.join);
    el.joinBtn.disabled = true;
    try {
      await connectWs();
      const info = await request({ t: 'info', room: S.roomId }, ['info']);
      if (!info.exists) {
        el.joinTitle.textContent = 'Essa sala não existe mais (salas vazias expiram após 30 min). Crie uma nova.';
        return;
      }
      if (info.full) el.joinTitle.textContent = 'A sala já está com 2 pessoas.';
      el.joinPasswordWrap.hidden = !info.needsPassword;
      el.joinPassword.required = info.needsPassword;
      el.joinBtn.disabled = false;
      (el.joinName.value ? (info.needsPassword ? el.joinPassword : el.joinBtn) : el.joinName).focus();
    } catch {
      el.joinTitle.textContent = 'Não foi possível falar com o servidor. Recarregue a página.';
    }
  }

  el.formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.formCreate.querySelector('button');
    btn.disabled = true;
    try {
      await connectWs();
      const name = el.createName.value.trim();
      const password = el.createPassword.value;
      const res = await request({ t: 'create', password, accessCode: el.createAccess.value }, ['created', 'error']);
      if (res.t === 'error') {
        if (res.code === 'access') { el.accessWrap.hidden = false; el.createAccess.focus(); }
        toast(res.msg);
        return;
      }
      S.roomId = res.room;
      history.replaceState(null, '', `/s/${res.room}`);
      await enterRoom(name, password, true);
    } catch {
      toast('Não foi possível conectar ao servidor.');
    } finally {
      btn.disabled = false;
    }
  });

  el.formJoin.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.joinBtn.disabled = true;
    try {
      await enterRoom(el.joinName.value.trim(), el.joinPassword.value, false);
    } finally {
      el.joinBtn.disabled = false;
    }
  });

  async function enterRoom(name, password, isCreator) {
    await connectWs();
    const res = await request({ t: 'join', room: S.roomId, name, password }, ['joined', 'error']).catch(() => null);
    if (!res) return toast('Servidor não respondeu.');
    if (res.t === 'error') {
      toast(res.msg);
      if (res.code === 'password') { el.joinPassword.select(); }
      return;
    }
    S.name = name;
    S.password = password;
    saveName(name);
    show(el.room);
    el.localInitial.textContent = initial(name);
    await startLocalMedia();
    updateButtons();
    requestWakeLock();
    if (isCreator) {
      addSys('Sala criada! Toque em “Convite” para mandar o link.' + (password ? ' Envie a senha separadamente.' : ''));
      setTimeout(invite, 300);
    }
  }

  // ------------------------------------------------------------ mensagens do servidor
  handlers.set('joined', (msg) => {
    S.joined = true;
    S.me = msg.you;
    S.iceServers = msg.iceServers || [];
    teardownPeer();
    if (msg.peers.length) {
      const p = msg.peers[0];
      startPeer(p, true);
    } else {
      setStatus('Aguardando a outra pessoa entrar…');
    }
  });
  handlers.set('peer-joined', (msg) => {
    teardownPeer();
    startPeer({ id: msg.id, name: msg.name }, false);
    addSys(`${msg.name} entrou na sala.`);
  });
  handlers.set('peer-left', (msg) => {
    if (S.peer && S.peer.id === msg.id) {
      addSys(`${S.peer.name} saiu da sala.`);
      teardownPeer();
      setStatus('Aguardando a outra pessoa entrar…');
    }
  });
  handlers.set('signal', (msg) => onSignal(msg.data));
  handlers.set('state', (msg) => onRemoteState(msg.data));
  handlers.set('chat', (msg) => addChat(msg));
  handlers.set('error', (msg) => { if (S.joined) toast(msg.msg); });

  // ------------------------------------------------------------ mídia local (mic + câmera)
  async function startLocalMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Este navegador não permite câmera/microfone (é preciso HTTPS).');
      return;
    }
    await enableTrack('audio');
    await enableTrack('video');
  }

  const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const VIDEO_CONSTRAINTS = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' };

  async function enableTrack(kind) {
    let track = S.camStream.getTracks().find((t) => t.kind === kind && t.readyState === 'live');
    if (!track) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: AUDIO_CONSTRAINTS } : { video: VIDEO_CONSTRAINTS });
        track = s.getTracks()[0];
        if (kind === 'audio') track.contentHint = 'speech';
        S.camStream.addTrack(track);
        el.camLocal.srcObject = S.camStream;
        if (S.pc) {
          const sender = S.pc.addTrack(track, S.camStream);
          if (kind === 'video') tuneSender(sender, { maxBitrate: 600_000 });
        }
      } catch (err) {
        toast(kind === 'audio' ? 'Microfone bloqueado ou indisponível.' : 'Câmera bloqueada ou indisponível.');
        return false;
      }
    }
    track.enabled = true;
    if (kind === 'audio') S.micOn = true; else S.camOn = true;
    updateButtons();
    sendState();
    return true;
  }
  function disableTrack(kind) {
    for (const t of S.camStream.getTracks()) if (t.kind === kind) t.enabled = false;
    if (kind === 'audio') S.micOn = false; else S.camOn = false;
    updateButtons();
    sendState();
  }

  // ------------------------------------------------------------ transmissão (tela / arquivo)
  async function shareScreen() {
    if (!canShareScreen) {
      toast('Este aparelho não permite compartilhar a tela pelo navegador. Use “Vídeo” para transmitir um arquivo.', 6000);
      return;
    }
    let src;
    try {
      src = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
    } catch {
      return; // usuário cancelou
    }
    stopMedia(true);
    const out = new MediaStream();
    S.media = { kind: 'screen', src, out, senders: new Map() };
    for (const t of src.getTracks()) {
      t.contentHint = t.kind === 'video' ? 'motion' : 'music';
      t.addEventListener('ended', () => { if (S.media && S.media.src === src) stopMedia(); });
      attachMediaTrack(t);
    }
    if (!src.getAudioTracks().length) {
      toast('Sem áudio! Ao compartilhar, escolha uma ABA do Chrome e marque “Compartilhar áudio da aba”.', 8000);
    }
    renderStage();
    updateButtons();
    sendState();
  }

  async function streamFile(file) {
    if (!canCaptureVideo) {
      toast('Este navegador não consegue transmitir arquivos. Use o Chrome.');
      return;
    }
    stopMedia(true);
    const v = el.mediaLocal;
    const url = URL.createObjectURL(file);
    const out = new MediaStream();
    S.media = { kind: 'file', src: null, out, senders: new Map(), url, name: file.name };
    v.muted = false;
    v.src = url;
    renderStage();
    updateButtons();

    const capture = () => (v.captureStream ? v.captureStream() : v.mozCaptureStream());
    const sync = () => {
      if (!S.media || S.media.url !== url) return;
      const cap = S.media.src || (S.media.src = capture());
      if (!cap.__hooked) {
        cap.__hooked = true;
        cap.addEventListener('addtrack', sync);
      }
      for (const t of cap.getTracks()) {
        if (t.readyState !== 'live') continue;
        t.contentHint = t.kind === 'video' ? 'motion' : 'music';
        attachMediaTrack(t);
      }
      sendState();
    };
    v.addEventListener('loadedmetadata', sync, { once: true });
    v.addEventListener('playing', sync);
    v.addEventListener('error', () => toast('Não foi possível abrir este arquivo. Prefira MP4 (H.264/AAC) ou WebM.', 6000), { once: true });
    S.media.cleanup = () => v.removeEventListener('playing', sync);
    try { await v.play(); } catch { toast('Toque no play do vídeo para começar.'); }
    toast(`Transmitindo “${file.name}”. Use os controles do vídeo para pausar e avançar.`, 5000);
  }

  /** Anexa (ou troca) uma faixa da transmissão no peer. */
  function attachMediaTrack(track) {
    const m = S.media;
    if (!m) return;
    const prev = m.out.getTracks().find((t) => t.kind === track.kind);
    if (prev === track) return;
    if (prev) m.out.removeTrack(prev);
    m.out.addTrack(track);
    if (!S.pc) return;
    const sender = m.senders.get(track.kind);
    if (sender) {
      sender.replaceTrack(track).catch(() => {});
    } else {
      const s = S.pc.addTrack(track, m.out);
      m.senders.set(track.kind, s);
      if (track.kind === 'video') tuneSender(s, { maxBitrate: 6_000_000, maxFramerate: 30 });
      else tuneSender(s, { maxBitrate: 192_000 });
    }
  }

  function stopMedia(silent = false) {
    const m = S.media;
    if (!m) return;
    S.media = null;
    if (m.cleanup) m.cleanup();
    if (S.pc) for (const s of m.senders.values()) { try { S.pc.removeTrack(s); } catch {} }
    if (m.kind === 'screen') for (const t of m.src.getTracks()) t.stop();
    if (m.kind === 'file') {
      el.mediaLocal.pause();
      el.mediaLocal.removeAttribute('src');
      el.mediaLocal.load();
      URL.revokeObjectURL(m.url);
      if (m.src) for (const t of m.src.getTracks()) t.stop();
    }
    el.fileInput.value = '';
    if (!silent) { renderStage(); updateButtons(); sendState(); }
  }

  function tuneSender(sender, { maxBitrate, maxFramerate }) {
    const apply = async () => {
      try {
        const p = sender.getParameters();
        if (!p.encodings || !p.encodings.length) return false;
        p.encodings[0].maxBitrate = maxBitrate;
        if (maxFramerate) p.encodings[0].maxFramerate = maxFramerate;
        if (sender.track && sender.track.kind === 'video') p.degradationPreference = 'balanced';
        await sender.setParameters(p);
        return true;
      } catch { return false; }
    };
    sender.__tune = apply;
    apply();
  }
  function retune() {
    if (!S.pc) return;
    for (const s of S.pc.getSenders()) if (s.__tune) s.__tune();
  }

  // ------------------------------------------------------------ WebRTC (perfect negotiation)
  function startPeer(peer, polite) {
    S.peer = peer;
    S.polite = polite;
    S.makingOffer = false;
    S.ignoreOffer = false;
    el.remoteName.textContent = peer.name;
    el.remoteInitial.textContent = initial(peer.name);
    el.camRemoteWrap.classList.remove('empty');
    el.camRemoteWrap.classList.add('video-off');
    setStatus(`Conectando com ${peer.name}…`);

    const pc = new RTCPeerConnection({ iceServers: S.iceServers, bundlePolicy: 'max-bundle' });
    S.pc = pc;

    for (const t of S.camStream.getTracks()) {
      const s = pc.addTrack(t, S.camStream);
      if (t.kind === 'video') tuneSender(s, { maxBitrate: 600_000 });
    }
    if (S.media) {
      const tracks = S.media.out.getTracks();
      S.media.senders = new Map();
      for (const t of tracks) { S.media.out.removeTrack(t); attachMediaTrack(t); }
    }

    pc.onnegotiationneeded = async () => {
      try {
        S.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription({ type: offer.type, sdp: mungeSdp(offer.sdp) });
        signal({ description: pc.localDescription });
      } catch (err) {
        console.warn('negociação', err);
      } finally {
        S.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) signal({ candidate }); };
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      S.remoteStreams.set(stream.id, stream);
      stream.onremovetrack = () => renderRemote();
      track.onunmute = () => renderRemote();
      renderRemote();
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { retune(); updateRoute(); sendState(); }
      else if (st === 'failed') { setStatus('Conexão falhou. Tentando de novo…', 'bad'); pc.restartIce(); }
      else if (st === 'disconnected') setStatus('Conexão instável…', 'bad');
    };
    sendState();
    clearInterval(S.statsTimer);
    S.statsTimer = setInterval(updateRoute, 10_000);
  }

  function teardownPeer() {
    clearInterval(S.statsTimer);
    if (S.pc) {
      S.pc.ontrack = S.pc.onicecandidate = S.pc.onnegotiationneeded = S.pc.onconnectionstatechange = null;
      S.pc.close();
    }
    S.pc = null;
    S.peer = null;
    if (S.media) S.media.senders = new Map();
    S.remoteStreams.clear();
    S.remote = { camId: null, mediaId: null, mediaKind: null, camOn: false, micOn: false };
    el.camRemote.srcObject = null;
    el.mediaRemote.srcObject = null;
    el.camRemoteWrap.classList.add('empty');
    el.unmuteBtn.hidden = true;
    renderStage();
  }

  function signal(data) {
    if (!S.peer) return;
    wsSend({ t: 'signal', to: S.peer.id, data: JSON.parse(JSON.stringify(data)) });
  }

  async function onSignal({ description, candidate } = {}) {
    const pc = S.pc;
    if (!pc) return;
    try {
      if (description) {
        const collision = description.type === 'offer' && (S.makingOffer || pc.signalingState !== 'stable');
        S.ignoreOffer = !S.polite && collision;
        if (S.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription({ type: answer.type, sdp: mungeSdp(answer.sdp) });
          signal({ description: pc.localDescription });
        }
      } else if (candidate) {
        try { await pc.addIceCandidate(candidate); } catch (e) { if (!S.ignoreOffer) throw e; }
      }
    } catch (err) {
      console.warn('sinalização', err);
    }
  }

  /** Áudio do filme em estéreo e com bitrate alto (Opus). */
  function mungeSdp(sdp) {
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if (!m) return sdp;
    const pt = m[1];
    return sdp.replace(new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`), (line, params) => {
      let p = params;
      if (!/stereo=/.test(p)) p += ';stereo=1';
      if (!/sprop-stereo=/.test(p)) p += ';sprop-stereo=1';
      if (!/maxaveragebitrate=/.test(p)) p += ';maxaveragebitrate=192000';
      return `a=fmtp:${pt} ${p}`;
    });
  }

  async function updateRoute() {
    if (!S.pc || S.pc.connectionState !== 'connected') return;
    try {
      const stats = await S.pc.getStats();
      let pair;
      stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
      if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      const local = pair && stats.get(pair.localCandidateId);
      const relay = local && local.candidateType === 'relay';
      const rtt = pair && pair.currentRoundTripTime ? ` · ${Math.round(pair.currentRoundTripTime * 1000)} ms` : '';
      setStatus(`Conectado com ${S.peer.name}${relay ? ' (via servidor)' : ' (direto)'}${rtt}`, 'ok');
    } catch {
      setStatus(`Conectado com ${S.peer.name}`, 'ok');
    }
  }

  // ------------------------------------------------------------ estado remoto e renderização
  function sendState() {
    if (!S.peer) return;
    wsSend({
      t: 'state', to: S.peer.id,
      data: {
        camId: S.camStream.id,
        mediaId: S.media ? S.media.out.id : null,
        mediaKind: S.media ? S.media.kind : null,
        mediaName: S.media && S.media.name ? S.media.name : null,
        camOn: S.camOn, micOn: S.micOn,
      },
    });
  }

  function onRemoteState(d) {
    if (!d || typeof d !== 'object') return;
    const prevMedia = S.remote.mediaId;
    S.remote = {
      camId: String(d.camId || ''), mediaId: d.mediaId ? String(d.mediaId) : null,
      mediaKind: d.mediaKind === 'screen' || d.mediaKind === 'file' ? d.mediaKind : null,
      mediaName: d.mediaName ? String(d.mediaName).slice(0, 120) : null,
      camOn: !!d.camOn, micOn: !!d.micOn,
    };
    if (S.remote.mediaId && S.remote.mediaId !== prevMedia && S.peer) {
      addSys(`${S.peer.name} começou a transmitir ${S.remote.mediaKind === 'screen' ? 'a tela' : S.remote.mediaName ? `“${S.remote.mediaName}”` : 'um vídeo'}.`);
    }
    renderRemote();
  }

  function liveStream(id) {
    const s = id && S.remoteStreams.get(id);
    return s && s.getTracks().some((t) => t.readyState === 'live') ? s : null;
  }

  function renderRemote() {
    const cam = liveStream(S.remote.camId);
    if (el.camRemote.srcObject !== cam) {
      el.camRemote.srcObject = cam;
      if (cam) playWithSound(el.camRemote);
    }
    el.camRemote.volume = Number(el.volVoice.value);
    el.camRemoteWrap.classList.toggle('video-off', !cam || !S.remote.camOn);
    el.remoteMic.hidden = !S.peer || S.remote.micOn;

    const media = S.remote.mediaId ? liveStream(S.remote.mediaId) : null;
    if (el.mediaRemote.srcObject !== media) {
      el.mediaRemote.srcObject = media;
      if (media) playWithSound(el.mediaRemote);
    }
    el.mediaRemote.volume = Number(el.volMedia.value);
    renderStage();
  }

  function playWithSound(video) {
    video.muted = false;
    video.play().catch(() => { el.unmuteBtn.hidden = false; });
  }
  el.unmuteBtn.addEventListener('click', () => {
    el.unmuteBtn.hidden = true;
    for (const v of [el.camRemote, el.mediaRemote]) if (v.srcObject) { v.muted = false; v.play().catch(() => {}); }
  });

  function renderStage() {
    const mine = S.media;
    const remoteMedia = !!el.mediaRemote.srcObject;
    el.mediaLocal.hidden = !(mine && mine.kind === 'file');
    el.sharingScreen.hidden = !(mine && mine.kind === 'screen');
    el.mediaRemote.hidden = !!mine || !remoteMedia;
    el.stageEmpty.hidden = !!mine || remoteMedia;
    if (!mine && !remoteMedia) {
      el.stageMsg.textContent = S.remote.mediaId ? 'Recebendo transmissão…' : 'Nenhum filme sendo transmitido.';
    }
  }

  function updateButtons() {
    el.btnMic.classList.toggle('on', S.micOn);
    el.btnMic.classList.toggle('off', !S.micOn);
    el.btnCam.classList.toggle('on', S.camOn);
    el.btnCam.classList.toggle('off', !S.camOn);
    el.btnMic.querySelector('span').textContent = S.micOn ? 'Mic' : 'Mic off';
    el.btnCam.querySelector('span').textContent = S.camOn ? 'Câmera' : 'Câm. off';
    el.camLocalWrap.classList.toggle('video-off', !S.camOn);
    el.localMic.hidden = S.micOn;
    el.btnScreen.classList.toggle('disabled', !canShareScreen);
    el.btnScreen.classList.toggle('active', !!(S.media && S.media.kind === 'screen'));
    el.btnFile.classList.toggle('active', !!(S.media && S.media.kind === 'file'));
    el.btnStop.hidden = !S.media;
  }

  // ------------------------------------------------------------ chat
  function addChat({ from, name, text, ts }) {
    const li = document.createElement('li');
    if (from === S.me) li.className = 'me';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${from === S.me ? 'Você' : name} · ${new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    li.append(who, document.createTextNode(text));
    el.chatList.append(li);
    el.chatList.scrollTop = el.chatList.scrollHeight;
    if (from !== S.me && el.chat.hidden) {
      S.unread++;
      el.chatBadge.textContent = String(S.unread);
      el.chatBadge.hidden = false;
      toast(`💬 ${name}: ${text.slice(0, 80)}`);
    }
  }
  function addSys(text) {
    const li = document.createElement('li');
    li.className = 'sys';
    li.textContent = text;
    el.chatList.append(li);
    el.chatList.scrollTop = el.chatList.scrollHeight;
  }
  el.formChat.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text) return;
    wsSend({ t: 'chat', text });
    el.chatInput.value = '';
  });
  function toggleChat() {
    el.chat.hidden = !el.chat.hidden;
    if (!el.chat.hidden) {
      S.unread = 0;
      el.chatBadge.hidden = true;
      el.chatList.scrollTop = el.chatList.scrollHeight;
    }
  }

  // ------------------------------------------------------------ convite, tela cheia, sair
  async function invite() {
    const url = inviteUrl();
    const text = 'Vem assistir comigo no Cine a Dois 🍿';
    if (navigator.share) {
      try { await navigator.share({ title: 'Cine a Dois', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link do convite copiado! ' + (S.password ? 'Lembre de mandar a senha.' : ''));
    } catch {
      prompt('Copie o link do convite:', url);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.room.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      toast('Tela cheia não disponível neste navegador.');
    }
  }

  function leave() {
    if (!confirm('Sair da sala?')) return;
    S.intentionalClose = true;
    S.joined = false;
    wsSend({ t: 'leave' });
    stopMedia(true);
    teardownPeer();
    for (const t of S.camStream.getTracks()) t.stop();
    if (S.ws) S.ws.close();
    location.href = '/';
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) S.wakeLock = await navigator.wakeLock.request('screen');
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.joined) {
      requestWakeLock();
      if (!S.ws || S.ws.readyState > WebSocket.OPEN) rejoin();
    }
  });

  // ------------------------------------------------------------ eventos da barra
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'mic': S.micOn ? disableTrack('audio') : enableTrack('audio'); break;
      case 'cam': S.camOn ? disableTrack('video') : enableTrack('video'); break;
      case 'screen': shareScreen(); break;
      case 'stop-media': stopMedia(); break;
      case 'chat': toggleChat(); break;
      case 'invite': invite(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'leave': leave(); break;
    }
  });
  el.fileInput.addEventListener('change', () => {
    const f = el.fileInput.files && el.fileInput.files[0];
    if (f) streamFile(f);
  });
  el.volMedia.addEventListener('input', () => (el.mediaRemote.volume = Number(el.volMedia.value)));
  el.volVoice.addEventListener('input', () => (el.camRemote.volume = Number(el.volVoice.value)));

  // toque no filme (fora dos controles) alterna o modo imersivo
  el.stage.addEventListener('click', (e) => {
    if (e.target.closest('.cams, button, #media-local')) return;
    el.room.classList.toggle('immersive');
  });

  window.addEventListener('beforeunload', () => {
    S.intentionalClose = true;
    wsSend({ t: 'leave' });
  });

  // ganchos para testes automatizados
  window.__cine = { state: S, streamFile };

  route();
})();
