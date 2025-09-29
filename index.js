import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ type: "*/*" }));

// === ENV VARS ===
const API_KEY = process.env.NEYNAR_API_KEY;
const SIGNER_UUID = process.env.SIGNER_UUID;
const BOT_FID = Number(process.env.BOT_FID);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;

// (opcional) Verificar firma HMAC del webhook de Neynar
function verifyHmac(req) {
  if (!WEBHOOK_SECRET) return true;
  const signature = req.headers["x-neynar-signature"];
  if (!signature) return false;
  const hmac = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
}

// Responder a un cast (reply) vía Neynar
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
      parent: parentHash,          // responder en hilo
      parent_author_fid: parentAuthorFid,
      idem,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Publish error:", data);
    throw new Error(JSON.stringify(data));
  }
  return data;
}

// Endpoint para recibir webhooks de Neynar
app.post("/webhook", async (req, res) => {
  try {
    if (!verifyHmac(req)) return res.status(401).send("invalid signature");

    const event = req.body;
    const cast = event?.data?.cast || event?.cast || event?.data;
    if (!cast) return res.status(200).send("no cast found");

    const { text = "", hash: parentHash, author } = cast;
    const parentAuthorFid = author?.fid;

    // ¿mencionaron al bot?
    const mentions = cast?.mentions || [];
    const mentionedMe = BOT_FID && mentions.includes(BOT_FID);
    if (!mentionedMe) return res.status(200).send("ignored (no mention)");

    // Comandos simples
    const lower = text.toLowerCase();
    let reply = null;

    if (lower.includes("!ping")) reply = "pong 🏓";
    else if (lower.includes("!help")) reply = "Commands: !ping, !info";
    else if (lower.includes("!info")) reply = "I’m a simple Farcaster bot. Try !ping or !help.";

    if (reply) {
      await replyCast({ text: reply, parentHash, parentAuthorFid });
      return res.status(200).send("ok");
    }

    return res.status(200).send("no command");
  } catch (e) {
    console.error(e);
    return res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("bot listening on", PORT));
