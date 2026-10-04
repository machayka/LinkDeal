import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import nacl from "tweetnacl";
import postgres from "postgres";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.CHAT_PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl);
const maxFileBytes = 10 * 1024 * 1024;
const maxBodyLength = 10_000;
const challengeTtlMs = 5 * 60 * 1000;
const schema = await readFile(fileURLToPath(new URL("../board/db/schema.sql", import.meta.url)), "utf8");
await sql.unsafe(schema);
await sql`DELETE FROM chat_rooms WHERE room_key = 'global'`;
await sql`DELETE FROM chat_rooms WHERE room_key ~ '^offer:[0-9]+$'`;

const pending = new Map();
const sessions = new Map();
const rooms = new Map();
const server = new WebSocketServer({ port });

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function validAddress(address) {
  try {
    return bs58.decode(address).length === 32;
  } catch {
    return false;
  }
}

function challengeMessage(challenge) {
  return `LinkDeal Chat logowanie\nPokój: ${challenge.roomKey}\nNonce: ${challenge.nonce}\nCzas: ${challenge.timestamp}`;
}

function validSignature(challenge, address, signature) {
  if (!validAddress(address) || typeof signature !== "string") return false;
  if (Date.now() - challenge.timestamp > challengeTtlMs) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(challengeMessage(challenge)),
      Uint8Array.from(Buffer.from(signature, "base64")),
      bs58.decode(address),
    );
  } catch {
    return false;
  }
}

async function roomFor(roomKey, address) {
  if (!/^(offer|contract):[A-Za-z0-9._:-]{1,200}$/.test(roomKey)) return null;
  const offerParts = roomKey.match(/^offer:(\d+):([^:]+):([^:]+)$/);
  if (roomKey.startsWith("offer:") && (!offerParts || !validAddress(address) || ![offerParts[2], offerParts[3]].includes(address))) return null;
  const offerId = offerParts ? Number(offerParts[1]) : null;
  if (offerId !== null && !Number.isInteger(offerId)) return null;
  const [room] = await sql`
    INSERT INTO chat_rooms (room_key, offer_id)
    VALUES (${roomKey}, ${offerId})
    ON CONFLICT (room_key) DO UPDATE SET room_key = EXCLUDED.room_key
    RETURNING id, room_key, offer_id
  `;
  return room;
}

async function history(roomId) {
  const rows = await sql`
    SELECT m.id, m.sender_wallet AS sender, m.body AS text, m.created_at AS "sentAt",
           a.filename, a.mime_type AS "mimeType", a.size_bytes AS "sizeBytes", a.content
    FROM chat_messages m
    LEFT JOIN chat_attachments a ON a.message_id = m.id
    WHERE m.room_id = ${roomId}
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT 100
  `;
  return rows.map((row) => ({
    id: String(row.id),
    sender: row.sender,
    text: row.text,
    sentAt: new Date(row.sentAt).getTime(),
    file: row.filename
      ? { name: row.filename, type: row.mimeType, size: row.sizeBytes, data: Buffer.from(row.content).toString("base64") }
      : undefined,
  }));
}

async function roomsFor(address) {
  const rows = await sql`
    SELECT r.room_key AS "roomKey", r.offer_id AS "offerId",
           COALESCE(o.title, 'Umowa') AS title,
           COALESCE(MAX(m.created_at), r.created_at) AS "lastActivity",
           COALESCE(
             ARRAY_AGG(DISTINCT cm.wallet) FILTER (WHERE cm.wallet <> ${address}),
             ARRAY[]::text[]
           ) AS participants
    FROM chat_rooms r
    LEFT JOIN offers o ON o.id = r.offer_id
    JOIN chat_members mine ON mine.room_id = r.id AND mine.wallet = ${address}
    LEFT JOIN chat_members cm ON cm.room_id = r.id
    LEFT JOIN chat_messages m ON m.room_id = r.id
    WHERE r.room_key <> 'global' AND r.room_key !~ '^offer:[0-9]+$'
    GROUP BY r.id, o.title
    ORDER BY "lastActivity" DESC
  `;
  return rows.map((room) => {
    const parts = String(room.roomKey).split(":");
    const keyParticipants = parts[0] === "offer" && parts.length === 4 ? parts.slice(2) : [];
    const participants = [...new Set([...(room.participants ?? []), ...keyParticipants])]
      .filter((participant) => participant !== address);
    return { ...room, participants };
  });
}

async function sendRooms(socket, address) {
  send(socket, { type: "rooms", rooms: await roomsFor(address) });
}

server.on("connection", (socket) => {
  let session = null;
  const authTimeout = setTimeout(() => {
    if (!session) socket.close(1008, "Authentication required");
  }, challengeTtlMs);

  socket.on("message", async (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      if (payload.type === "hello") {
        const room = await roomFor(String(payload.roomKey ?? ""), String(payload.address ?? ""));
        if (!room) return send(socket, { type: "error", message: "Nieprawidłowy pokój." });
        if (typeof payload.address === "string" && typeof payload.token === "string") {
          const saved = sessions.get(payload.token);
          if (saved && saved.address === payload.address) {
            session = { ...saved, roomId: room.id, roomKey: room.room_key };
            clearTimeout(authTimeout);
            const clients = rooms.get(session.roomId) ?? new Set();
            clients.add(socket);
            rooms.set(session.roomId, clients);
            send(socket, { type: "ready", address: session.address, messages: await history(session.roomId) });
            await sendRooms(socket, session.address);
            return;
          }
        }
        const challenge = { roomKey: room.room_key, nonce: randomUUID(), timestamp: Date.now(), roomId: room.id };
        pending.set(challenge.nonce, challenge);
        send(socket, { type: "challenge", message: challengeMessage(challenge), nonce: challenge.nonce });
        return;
      }
      if (payload.type === "auth") {
        const challenge = pending.get(payload.nonce);
        pending.delete(payload.nonce);
        if (!challenge || !validSignature(challenge, payload.address, payload.signature))
          return send(socket, { type: "error", message: "Nieprawidłowy lub wygasły podpis walleta." });
        session = { address: payload.address, roomId: challenge.roomId, roomKey: challenge.roomKey };
        const token = randomBytes(32).toString("hex");
        sessions.set(token, session);
        clearTimeout(authTimeout);
        const clients = rooms.get(session.roomId) ?? new Set();
        clients.add(socket);
        rooms.set(session.roomId, clients);
        await sql`
          INSERT INTO chat_members (room_id, wallet) VALUES (${session.roomId}, ${session.address})
          ON CONFLICT DO NOTHING
        `;
        send(socket, { type: "ready", token, address: session.address, messages: await history(session.roomId) });
        await sendRooms(socket, session.address);
        return;
      }
      if (payload.type === "rooms" && session) {
        await sendRooms(socket, session.address);
        return;
      }
      if (payload.type !== "message" || !session) return;
      const body = typeof payload.text === "string" ? payload.text.trim() : "";
      const file = payload.file;
      if (!body && !file) return send(socket, { type: "error", message: "Wiadomość nie może być pusta." });
      if (body.length > maxBodyLength) return send(socket, { type: "error", message: "Wiadomość jest za długa." });
      if (file && (!file.name || !Number.isInteger(file.size) || file.size < 1 || file.size > maxFileBytes))
        return send(socket, { type: "error", message: "Plik musi mieć od 1 bajta do 10 MB." });
      const [createdMessage] = await sql.begin(async (transaction) => {
        const [created] = await transaction`
          INSERT INTO chat_messages (room_id, sender_wallet, body)
          VALUES (${session.roomId}, ${session.address}, ${body})
          RETURNING id, created_at
        `;
        if (file) {
          const content = Buffer.from(String(file.data), "base64");
          if (content.length !== file.size || content.length > maxFileBytes) throw new Error("Invalid attachment");
          await transaction`
            INSERT INTO chat_attachments (message_id, filename, mime_type, size_bytes, content)
            VALUES (${created.id}, ${String(file.name).slice(0, 255)}, ${String(file.type || "application/octet-stream").slice(0, 255)}, ${content.length}, ${content})
          `;
        }
        return [created];
      });
      const message = {
        id: String(createdMessage.id),
        sender: session.address,
        text: body,
        sentAt: new Date(createdMessage.created_at).getTime(),
        file: file ? { name: file.name, type: file.type, size: file.size, data: file.data } : undefined,
      };
      const clients = rooms.get(session.roomId) ?? new Set();
      for (const client of clients) send(client, { type: "message", message });
    } catch (error) {
      console.error("Chat request failed:", error);
      send(socket, { type: "error", message: "Nie udało się przetworzyć żądania." });
    }
  });
  socket.on("close", () => {
    clearTimeout(authTimeout);
    if (session) rooms.get(session.roomId)?.delete(socket);
  });
});

console.log(`LinkDeal chat listening on ws://0.0.0.0:${port}`);
