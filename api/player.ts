import type { VercelRequest, VercelResponse } from '@vercel/node';

const PLAYER_API = 'https://player-info-ob53.vercel.app/player-info';
const BANNER_API = 'https://banner-api-lac.vercel.app/profile';
const OUTFIT_API = 'https://output-api-ob53.vercel.app/outfit-image';

async function safeFetch(url: string, timeoutMs = 6000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, image/png, */*'
      }
    });
    clearTimeout(timer);
    if (resp.ok) return resp;
  } catch (err) {
    clearTimeout(timer);
  }
  return null;
}

async function fetchPlayerInfo(uid: string): Promise<any | null> {
  // Max 2 quick attempts within Vercel's 10s limit
  for (let attempt = 0; attempt < 2; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000);
    const resp = await safeFetch(`${PLAYER_API}?uid=${encodeURIComponent(uid)}&_t=${timestamp}`, 4500);
    if (resp) {
      try {
        const data = await resp.json();
        if (data && Object.keys(data).length > 0) return data;
      } catch {
        // Ignore parse error and retry once
      }
    }
  }
  return null;
}

async function fetchImageBase64(url: string, timeoutMs = 6500): Promise<string | null> {
  const resp = await safeFetch(url, timeoutMs);
  if (!resp) return null;
  try {
    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength > 100) {
      return Buffer.from(arrayBuffer).toString('base64');
    }
  } catch {
    return null;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const uid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';
  if (!uid) {
    return res.status(400).json({ error: 'Missing UID' });
  }

  // Fetch all 3 simultaneously so total time stays under 7 seconds!
  const [playerData, bannerB64, outfitB64] = await Promise.all([
    fetchPlayerInfo(uid),
    fetchImageBase64(`${BANNER_API}?uid=${encodeURIComponent(uid)}`, 6500),
    fetchImageBase64(`${OUTFIT_API}?uid=${encodeURIComponent(uid)}&key=XEROX`, 6500)
  ]);

  if (!playerData) {
    return res.status(404).json({
      error: `UID ${uid} not found, or the Free Fire info server is currently down.`
    });
  }

  return res.status(200).json({
    info: playerData,
    banner_base64: bannerB64,
    outfit_base64: outfitB64
  });
}
