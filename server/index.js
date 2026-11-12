import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { RaceSimulation } from '../src/shared/kartPhysics.js';
import { RACE_CONFIG, TRACKS } from '../src/shared/constants.js';
import { getBaseTrackId } from '../src/shared/trackData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const PORT = Number(process.env.PORT) || 3001;
const PUBLIC_LOBBY_WAIT_MS = 10_000;

// Unambiguous 4-letter uppercase alphabet (no I or O)
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const app = express();
app.use(express.json());

/**
 * @type {Map<string, {
 *   code: string,
 *   isPublic: boolean,
 *   autoStartAtMs: number | null,
 *   sim: RaceSimulation,
 *   clients: Map<string, WebSocket>,
 *   lastBroadcastEventId: number,
 *   lastActivityMs: number
 * }>}
 */
const rooms = new Map();
let nextClientSeq = 1;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    tracks: TRACKS.map((t) => t.id),
    uptimeSec: Math.round(process.uptime()),
  });
});

if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(DIST_INDEX);
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .send('PocketKart 3D V2 multiplayer server running. Run `npm run dev` or `npm run build`.');
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function generateRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Impossible de générer un code salon unique.');
}

function sendJson(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(room) {
  const baseState = room.sim.getState({
    localId: null,
    sinceEventId: room.lastBroadcastEventId,
  });
  room.lastBroadcastEventId = room.sim.getLatestEventId();

  for (const [clientId, clientWs] of room.clients.entries()) {
    if (clientWs.readyState !== WebSocket.OPEN) continue;
    sendJson(clientWs, {
      type: 'state',
      state: {
        ...baseState,
        localId: clientId,
      },
    });
  }
}

function removeClientFromRoom(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;

  room.clients.delete(client.id);
  room.sim.removePlayer(client.id);
  room.lastActivityMs = Date.now();

  if (room.clients.size === 0) {
    rooms.delete(room.code);
  } else {
    if (room.isPublic && room.sim.phase === 'lobby') {
      room.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - room.sim.players.size));
    }
    broadcastRoomState(room);
  }
}

function findOpenPublicRoom(preferredTrackId = null) {
  let fallback = null;
  for (const room of rooms.values()) {
    if (
      room.isPublic &&
      room.sim.phase === 'lobby' &&
      room.sim.players.size < RACE_CONFIG.MAX_PLAYERS
    ) {
      if (preferredTrackId && room.sim.trackId === preferredTrackId) {
        return room;
      }
      if (!fallback) fallback = room;
    }
  }
  return fallback;
}

wss.on('connection', (ws) => {
  const client = {
    id: `p_${nextClientSeq++}`,
    ws,
    roomCode: null,
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    } catch {
      sendJson(ws, { type: 'error', message: 'Message JSON invalide.' });
      return;
    }

    if (!msg || typeof msg.type !== 'string') return;
    const reqId = msg.reqId ?? null;

    try {
      if (msg.type === 'create_room') {
        removeClientFromRoom(client);

        const code = generateRoomCode();
        const sim = new RaceSimulation({
          mode: 'online',
          roomCode: code,
          trackId: msg.trackId || 'coco',
          gameFormat: msg.gameFormat || 'race',
          cc: msg.cc || '100cc',
          mirror: Boolean(msg.mirror),
          isPublic: false,
        });
        sim.botCount = 4;
        sim.addPlayer({
          id: client.id,
          name: msg.playerName || msg.name || 'Pilote',
          racerId: msg.racerId || 'red',
          kartId: msg.kartId || 'classic',
          boostColorId: msg.boostColorId || 'flame',
        });

        if (typeof msg.botCount === 'number') {
          sim.setBotCount(msg.botCount);
        }

        const room = {
          code,
          isPublic: false,
          autoStartAtMs: null,
          sim,
          clients: new Map([[client.id, ws]]),
          lastBroadcastEventId: sim.getLatestEventId(),
          lastActivityMs: Date.now(),
        };
        rooms.set(code, room);
        client.roomCode = code;

        const initialState = sim.getState({ localId: client.id, sinceEventId: 0 });
        room.lastBroadcastEventId = sim.getLatestEventId();

        sendJson(ws, {
          type: 'room_joined',
          roomCode: code,
          isPublic: false,
          playerId: client.id,
          hostId: sim.hostId,
          reqId,
          state: initialState,
        });
        return;
      }

      if (msg.type === 'join_public') {
        removeClientFromRoom(client);

        let room = findOpenPublicRoom(msg.trackId || null);

        if (!room) {
          const code = generateRoomCode();
          const sim = new RaceSimulation({
            mode: 'online',
            roomCode: code,
            trackId: msg.trackId || 'coco',
            gameFormat: msg.gameFormat || 'race',
            cc: msg.cc || '100cc',
            mirror: Boolean(msg.mirror),
            isPublic: true,
          });
          sim.botCount = 5;
          sim.addPlayer({
            id: client.id,
            name: msg.playerName || msg.name || 'Pilote',
            racerId: msg.racerId || 'red',
            kartId: msg.kartId || 'classic',
            boostColorId: msg.boostColorId || 'flame',
          });
          sim.setBotCount(RACE_CONFIG.MAX_PLAYERS - sim.players.size);

          const autoStartAtMs = Date.now() + PUBLIC_LOBBY_WAIT_MS;
          sim.publicCountdown = Math.ceil(PUBLIC_LOBBY_WAIT_MS / 1000);

          room = {
            code,
            isPublic: true,
            autoStartAtMs,
            sim,
            clients: new Map([[client.id, ws]]),
            lastBroadcastEventId: sim.getLatestEventId(),
            lastActivityMs: Date.now(),
          };
          rooms.set(code, room);
          client.roomCode = code;

          const initialState = sim.getState({ localId: client.id, sinceEventId: 0 });
          room.lastBroadcastEventId = sim.getLatestEventId();

          sendJson(ws, {
            type: 'room_joined',
            roomCode: code,
            isPublic: true,
            playerId: client.id,
            hostId: sim.hostId,
            reqId,
            state: initialState,
          });
          return;
        }

        // Join existing open public room
        room.sim.addPlayer({
          id: client.id,
          name: msg.playerName || msg.name || 'Pilote',
          racerId: msg.racerId || 'aqua',
          kartId: msg.kartId || 'classic',
          boostColorId: msg.boostColorId || 'flame',
        });
        room.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - room.sim.players.size));
        room.clients.set(client.id, ws);
        room.lastActivityMs = Date.now();
        client.roomCode = room.code;

        // If 6 humans filled the public room, launch countdown immediately!
        if (room.sim.players.size >= RACE_CONFIG.MAX_PLAYERS) {
          room.autoStartAtMs = null;
          room.sim.publicCountdown = null;
          room.sim.startCountdown();
        }

        const stateForJoiner = room.sim.getState({
          localId: client.id,
          sinceEventId: room.lastBroadcastEventId,
        });

        sendJson(ws, {
          type: 'room_joined',
          roomCode: room.code,
          isPublic: true,
          playerId: client.id,
          hostId: room.sim.hostId,
          reqId,
          state: stateForJoiner,
        });

        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'join_room') {
        const rawCode = String(msg.roomCode || msg.code || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');

        const room = rooms.get(rawCode);
        if (!room) {
          sendJson(ws, {
            type: 'error',
            message: `Salon "${rawCode || '????'}" introuvable.`,
            reqId,
          });
          return;
        }

        if (room.sim.phase !== 'lobby') {
          sendJson(ws, {
            type: 'error',
            message: 'Une course est déjà en cours dans ce salon.',
            reqId,
          });
          return;
        }

        if (room.sim.players.size >= RACE_CONFIG.MAX_PLAYERS) {
          sendJson(ws, {
            type: 'error',
            message: 'Ce salon est complet (6 joueurs maximum).',
            reqId,
          });
          return;
        }

        removeClientFromRoom(client);

        room.sim.addPlayer({
          id: client.id,
          name: msg.playerName || msg.name || 'Pilote',
          racerId: msg.racerId || 'aqua',
          kartId: msg.kartId || 'classic',
          boostColorId: msg.boostColorId || 'flame',
        });
        if (room.isPublic) {
          room.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - room.sim.players.size));
        }
        room.clients.set(client.id, ws);
        room.lastActivityMs = Date.now();
        client.roomCode = room.code;

        if (room.isPublic && room.sim.players.size >= RACE_CONFIG.MAX_PLAYERS) {
          room.autoStartAtMs = null;
          room.sim.publicCountdown = null;
          room.sim.startCountdown();
        }

        const stateForJoiner = room.sim.getState({
          localId: client.id,
          sinceEventId: room.lastBroadcastEventId,
        });

        sendJson(ws, {
          type: 'room_joined',
          roomCode: room.code,
          isPublic: room.isPublic,
          playerId: client.id,
          hostId: room.sim.hostId,
          reqId,
          state: stateForJoiner,
        });

        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'leave') {
        removeClientFromRoom(client);
        sendJson(ws, { type: 'left', reqId });
        return;
      }

      const room = client.roomCode ? rooms.get(client.roomCode) : null;
      if (!room) {
        sendJson(ws, {
          type: 'error',
          message: "Tu n'es connecté à aucun salon.",
          reqId,
        });
        return;
      }
      room.lastActivityMs = Date.now();

      if (msg.type === 'select_track' || msg.type === 'set_track') {
        if (!room.isPublic && room.sim.hostId !== client.id) {
          sendJson(ws, {
            type: 'error',
            message: "Seul l'hôte peut changer de circuit.",
            reqId,
          });
          return;
        }
        if (room.sim.phase === 'lobby') {
          room.sim.setTrack(msg.trackId || msg.track || 'coco');
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'set_room_options') {
        if (!room.isPublic && room.sim.hostId !== client.id) {
          sendJson(ws, {
            type: 'error',
            message: "Seul l'hôte peut modifier les options du salon.",
            reqId,
          });
          return;
        }
        if (room.sim.phase === 'lobby') {
          room.sim.setRoomOptions({
            trackId: msg.trackId,
            gameFormat: msg.gameFormat,
            cc: msg.cc,
            mirror: msg.mirror,
          });
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'update_loadout') {
        if (room.sim.phase === 'lobby') {
          room.sim.updatePlayerLoadout(client.id, {
            racerId: msg.racerId,
            kartId: msg.kartId,
            boostColorId: msg.boostColorId,
          });
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'set_bots') {
        if (room.sim.hostId !== client.id) {
          sendJson(ws, {
            type: 'error',
            message: "Seul l'hôte peut régler le nombre de bots.",
            reqId,
          });
          return;
        }
        if (room.sim.phase === 'lobby') {
          const desired = msg.botCount ?? msg.bots ?? msg.count ?? 0;
          room.sim.setBotCount(desired);
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'start_race') {
        if (room.sim.hostId !== client.id) {
          sendJson(ws, {
            type: 'error',
            message: "Seul l'hôte peut lancer la course.",
            reqId,
          });
          return;
        }
        if (room.sim.phase === 'lobby' || room.sim.phase === 'finished') {
          room.autoStartAtMs = null;
          room.sim.publicCountdown = null;
          room.sim.startCountdown();
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'rematch') {
        if (room.sim.phase === 'finished') {
          if (msg.trackId) {
            room.sim.setTrack(msg.trackId);
          } else if (room.isPublic) {
            // Cycle tracks on public rematches for fresh variety!
            const idx = TRACKS.findIndex((t) => t.id === getBaseTrackId(room.sim.trackId));
            const nextTrack = TRACKS[((idx >= 0 ? idx : 0) + 1) % TRACKS.length];
            room.sim.setTrack(nextTrack.id);
          }
          if (room.isPublic) {
            room.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - room.sim.players.size));
          }
          room.autoStartAtMs = null;
          room.sim.publicCountdown = null;
          room.sim.startCountdown();
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'emote') {
        const triggered = room.sim.triggerEmote(client.id, msg.emoteId || msg.id || 'fire');
        if (triggered) {
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'respawn') {
        const respawned = room.sim.respawnKart(client.id);
        if (respawned) {
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'input') {
        const inputPayload = msg.input && typeof msg.input === 'object' ? msg.input : msg;
        room.sim.setPlayerInput(client.id, inputPayload);
        return;
      }
    } catch (err) {
      sendJson(ws, {
        type: 'error',
        message: err?.message || 'Erreur serveur.',
        reqId,
      });
    }
  });

  ws.on('close', () => {
    removeClientFromRoom(client);
  });

  ws.on('error', () => {
    removeClientFromRoom(client);
  });
});

// 60Hz simulation loop + 20Hz snapshot broadcast + public matchmaking auto-start timer
const TICK_MS = 1000 / 60;
let tickCounter = 0;
let lastTickTime = performance.now();

const simInterval = setInterval(() => {
  const now = performance.now();
  const dt = Math.min(Math.max((now - lastTickTime) / 1000, 0.005), 0.05);
  lastTickTime = now;
  tickCounter++;

  const shouldBroadcast = tickCounter % 3 === 0; // 20Hz
  const nowWall = Date.now();

  for (const [code, room] of rooms.entries()) {
    if (room.clients.size === 0 || nowWall - room.lastActivityMs > 30 * 60 * 1000) {
      rooms.delete(code);
      continue;
    }

    if (room.isPublic && room.sim.phase === 'lobby' && room.autoStartAtMs !== null) {
      const remSec = Math.max(0, Math.ceil((room.autoStartAtMs - nowWall) / 1000));
      if (nowWall >= room.autoStartAtMs) {
        room.autoStartAtMs = null;
        room.sim.publicCountdown = null;
        room.sim.setBotCount(Math.max(0, RACE_CONFIG.MAX_PLAYERS - room.sim.players.size));
        room.sim.startCountdown();
        broadcastRoomState(room);
        continue;
      }
      if (remSec !== room.sim.publicCountdown) {
        room.sim.publicCountdown = remSec;
        broadcastRoomState(room);
      }
    }

    if (room.sim.phase === 'countdown' || room.sim.phase === 'racing') {
      const prevPhase = room.sim.phase;
      room.sim.step(dt);
      const phaseChanged = room.sim.phase !== prevPhase;

      if (shouldBroadcast || phaseChanged) {
        broadcastRoomState(room);
      }
    } else {
      // Still tick active emote timers in lobby / finished so speech bubbles expire cleanly
      const hadEmotes = room.sim.karts.some((k) => Boolean(k.emote));
      if (hadEmotes) {
        room.sim.step(dt);
        const stillHasEmotes = room.sim.karts.some((k) => Boolean(k.emote));
        if (!stillHasEmotes) {
          broadcastRoomState(room);
        }
      }
    }
  }
}, TICK_MS);

simInterval.unref?.();

server.listen(PORT, () => {
  console.log(`[PocketKart 3D] Server listening on http://localhost:${PORT} (WS /ws)`);
});
