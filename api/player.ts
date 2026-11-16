import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------- API Endpoints ----------
const PLAYER_API = 'https://player-info-ob53.vercel.app/player-info';
const BANNER_API = 'https://banner-api-lac.vercel.app/profile';
const OUTFIT_API = 'https://output-api-ob53.vercel.app/outfit-image';

async function safeFetch(url: string, timeoutMs = 30000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok) return resp;
  } catch (err) {
    clearTimeout(timer);
    console.error(`Fetch error for ${url}:`, err);
  }
  return null;
}

async function fetchPlayerInfo(uid: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000);
    const resp = await safeFetch(`${PLAYER_API}?uid=${encodeURIComponent(uid)}&_t=${timestamp}`, 30000);
    if (resp) {
      try {
        return await resp.json();
      } catch {
        // Retry on invalid JSON
      }
    }
  }
  return null;
}

async function fetchBanner(uid: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await safeFetch(`${BANNER_API}?uid=${encodeURIComponent(uid)}`, 30000);
    if (resp) {
      const arrayBuffer = await resp.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        return Buffer.from(arrayBuffer);
      }
    }
  }
  return null;
}

async function fetchOutfit(uid: string): Promise<Buffer | null> {
  const resp = await safeFetch(`${OUTFIT_API}?uid=${encodeURIComponent(uid)}&key=XEROX`, 90000);
  if (resp) {
    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      return Buffer.from(arrayBuffer);
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';

  if (!uid) {
    return res.status(400).json({ error: 'Missing UID' });
  }

  // 1. Fetch Player Info
  const playerData = await fetchPlayerInfo(uid);
  if (!playerData) {
    return res.status(404).json({ error: `UID ${uid} not found or not registered` });
  }

  // 2. Fetch Banner & Outfit in Parallel
  const [bannerBuffer, outfitBuffer] = await Promise.all([
    fetchBanner(uid),
    fetchOutfit(uid),
  ]);

  const bannerB64 = bannerBuffer ? bannerBuffer.toString('base64') : null;
  const outfitB64 = outfitBuffer ? outfitBuffer.toString('base64') : null;

  return res.status(200).json({
    info: playerData,
    banner_base64: bannerB64,
    outfit_base64: outfitB64,
  });
}
