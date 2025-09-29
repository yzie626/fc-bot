import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

const API_KEY = process.env.NEYNAR_API_KEY;
const SIGNER_UUID = process.env.SIGNER_UUID;
const BOT_FID = Number(process.env.BOT_FID);

let lastChecked = Math.floor(Date.now() / 1000); // timestamp para evitar duplicados

// Publicar un reply vía Neynar
async function replyCast({ text, parentHash, parentAuthorFid }) {
  const idem = crypto.randomBytes(8).toString("hex"); // idempotency key
  const res = await fetch("https://api.neynar.com/v2/farcaster/cast/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      signer_uuid: SIGNER_UUID,
      text,
      parent: parentHash,
      parent_author_fid: parentAuthorFid,
      idem,
    }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Publish error:", data);
  return data;
}

// Polling: trae menciones recientes al bot y responde a comandos
async function pollMentions() {
  try {
    const url = `https://api.neynar.com/v2/farcaster/feed/mentions?fid=${BOT_FID}`;
    const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
    const data = await res.json();
    const casts = data?.casts || [];

    for (const cast of casts) {
      const createdAt = Math.floor(new Date(cast.timestamp).getTime() / 1000);
      if (createdAt <= lastChecked) continue; // ya visto

      const txt = (cast.text || "").toLowerCase();
      let reply = null;

      if (txt.includes("!ping")) reply = "pong 🏓";
      else if (txt.includes("!help")) reply = "Commands: !ping, !info";
      else if (txt.includes("!info")) reply = "I’m a simple Farcaster bot. Try !ping or !help.";

      if (reply) {
        await replyCast({
          text: reply,
          parentHash: cast.hash,
          parentAuthorFid: cast.author?.fid,
        });
      }
    }
    lastChecked = Math.floor(Date.now() / 1000);
  } catch (err) {
    console.error("Polling error:", err);
  }
}

// Ejecuta polling cada 20 segundos
setInterval(pollMentions, 20000);

// Endpoint simple para verificar que corre
app.get("/", (_req, res) => res.send("Bot running (polling mode)"));
app.listen(PORT, () => console.log("bot listening on", PORT));
