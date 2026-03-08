function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function createApiClient({ timeoutMs = 4000 }) {
  return {
    async getJson(url) {
      const response = await fetchWithTimeout(url, {}, timeoutMs);
      if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
      return response.json();
    },
    async postJson(url, body) {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      if (!response.ok) throw new Error(`POST ${url} failed: ${response.status}`);
      return response.json();
    },
  };
}
