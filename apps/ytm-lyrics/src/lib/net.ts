import type { BridgethingClient } from '@bridgething/client';

import type { Http } from './lrclib';

const decoder = new TextDecoder();

// the kiosk has no route to the internet; every request rides the companion's tunnel
export function tunneledHttp(client: BridgethingClient): Http {
  return async url => {
    const res = await client.net.fetch(
      {
        request: {
          url,
          method: 'GET',
          headers: [{ name: 'User-Agent', value: 'ytm-lyrics/0.1 (bridgething webapp)' }],
          timeoutMs: 8000,
          redirect: 'follow',
        },
      },
      { timeoutMs: 10_000 },
    );
    if (!res.ok) return { status: 0, text: '' };
    // bytes arrive as Uint8Array over msgpack and as number[] over json; both feed a Uint8Array
    const body = new Uint8Array(res.response.response.body as unknown as number[]);
    return { status: res.response.response.status, text: decoder.decode(body) };
  };
}

// raw bytes through the tunnel, for the audio preview
export async function tunneledBytes(client: BridgethingClient, url: string): Promise<Uint8Array | null> {
  const res = await client.net.fetch(
    { request: { url, method: 'GET', headers: [], timeoutMs: 15_000, redirect: 'follow' } },
    { timeoutMs: 20_000 },
  );
  if (!res.ok || res.response.response.status !== 200) return null;
  return new Uint8Array(res.response.response.body as unknown as number[]);
}
