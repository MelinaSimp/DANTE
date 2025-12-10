// In-memory cache for ElevenLabs audio (in production, use Redis or database)
const audioCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour

/**
 * Store audio in cache
 */
export function storeAudioInCache(cacheKey: string, audioBuffer: Buffer) {
  audioCache.set(cacheKey, {
    buffer: audioBuffer,
    timestamp: Date.now(),
  });

  // Clean up old cache entries
  if (audioCache.size > 100) {
    const oldestKey = Array.from(audioCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    audioCache.delete(oldestKey);
  }
}

/**
 * Get audio from cache
 */
export function getAudioFromCache(cacheKey: string): Buffer | null {
  const cached = audioCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.buffer;
  }
  return null;
}






