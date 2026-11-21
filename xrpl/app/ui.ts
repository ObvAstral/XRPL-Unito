export { renderMarketplaceHtml } from './marketplace-ui.js'
export { renderCadPortalHtml } from './cad-ui.js'

export function renderBillboardPlayerHtml(resourceId: string): string {
  const safeId = resourceId.replace(/[^a-zA-Z0-9_-]/g, '')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Screen ${safeId}</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #ffffff; overflow: hidden; }
    img { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body>
  <img id="billboard-img" alt="" hidden>
  <script>
    const resourceId = ${JSON.stringify(safeId)};
    const img = document.getElementById('billboard-img');
    let expiryTimer;
    let expiresAt = null;
    let checking = false;

    function clearScreen() {
      clearTimeout(expiryTimer);
      img.hidden = true;
      img.removeAttribute('src');
      expiresAt = null;
    }

    function hideAtExpiry() {
      clearTimeout(expiryTimer);
      if (expiresAt === null) return;
      const remaining = expiresAt - performance.now();
      if (remaining <= 0) clearScreen();
      else expiryTimer = setTimeout(hideAtExpiry, Math.min(remaining, 2147483647));
    }

    async function pollBillboard() {
      hideAtExpiry();
      if (checking) return;
      checking = true;
      const startedAt = performance.now();
      try {
        const res = await fetch('/api/cartelloni/' + encodeURIComponent(resourceId) + '/corrente', { cache: 'no-store' });
        if (!res.ok) return clearScreen();
        const data = await res.json();
        if (!data.active || !data.imageUrl) return clearScreen();
        const remaining = Date.parse(data.expiresAtUtc) - Date.parse(data.serverNowUtc);
        const deadline = startedAt + remaining;
        if (!Number.isFinite(deadline) || deadline <= performance.now()) return clearScreen();

        expiresAt = deadline;
        if (img.getAttribute('src') !== data.imageUrl) img.src = data.imageUrl;
        img.hidden = false;
        hideAtExpiry();
      } catch {
        hideAtExpiry();
      } finally {
        checking = false;
      }
    }

    img.addEventListener('error', clearScreen);
    pollBillboard();
    setInterval(pollBillboard, 2000);
    window.addEventListener('online', pollBillboard);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pollBillboard();
    });
  </script>
</body>
</html>`
}
