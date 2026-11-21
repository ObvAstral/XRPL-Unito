export function renderMarketplaceHtml(): string {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Affitti XRPL v2 · Marketplace</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #121c2f;
      --panel-2: #18253d;
      --border: #283a5c;
      --text: #e6edf7;
      --muted: #93a6c5;
      --accent: #38bdf8;
      --amber: #f59e0b;
      --green: #22c55e;
      --red: #ef4444;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
    }
    header {
      background: #0f172a;
      border-bottom: 1px solid var(--border);
      padding: 14px 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .brand { display: flex; flex-direction: column; gap: 2px; }
    .brand h1 { margin: 0; font-size: 18px; }
    .brand span { color: var(--muted); font-size: 12px; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    a.nav-link {
      color: var(--accent);
      text-decoration: none;
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      background: var(--panel);
    }
    a.nav-link:hover { border-color: var(--accent); }
    main { max-width: 1280px; margin: 0 auto; padding: 18px 20px 60px; display: grid; gap: 16px; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
    }
    .card h2 { margin: 0 0 10px; font-size: 16px; color: #fff; }
    .card h3 { margin: 12px 0 6px; font-size: 14px; color: var(--accent); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .stack { display: grid; gap: 8px; }
    .badge {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--panel-2);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .badge.ok { border-color: var(--green); color: #86efac; }
    .badge.warn { border-color: var(--amber); color: #fde68a; }
    .badge.err { border-color: var(--red); color: #fca5a5; }
    button {
      background: #1d4ed8;
      color: #fff;
      border: 1px solid #3b82f6;
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
    button.secondary { background: var(--panel-2); border-color: var(--border); color: var(--text); }
    button.secondary:hover { border-color: var(--accent); }
    button.amber { background: #b45309; border-color: #f59e0b; }
    button.danger { background: #991b1b; border-color: #ef4444; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
    input, select {
      background: #0b1324;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 7px;
      padding: 7px 9px;
      font-size: 13px;
    }
    .mono { font-family: var(--mono); font-size: 12px; word-break: break-all; }
    .muted { color: var(--muted); font-size: 13px; }
    .notice {
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--panel-2);
      border-left: 3px solid var(--accent);
      font-size: 13px;
    }
    .notice.err { border-left-color: var(--red); color: #fecaca; }
    .notice.ok { border-left-color: var(--green); color: #bbf7d0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    details summary { cursor: pointer; color: var(--accent); font-size: 12px; }
    pre {
      background: #070d19;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      font-size: 11px;
      overflow-x: auto;
      font-family: var(--mono);
      margin: 6px 0 0;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>Affitti temporanei su XRPL Testnet (v2)</h1>
      <span id="server-clock">Caricamento stato server...</span>
    </div>
    <nav>
      <a class="nav-link" href="/">Marketplace</a>
      <a class="nav-link" href="/cad">Portale CAD</a>
      <a class="nav-link" href="/schermo/torino-01" target="_blank" rel="noopener">Schermo torino-01</a>
    </nav>
    <div class="row">
      <span id="session-badge" class="badge">Ospite</span>
      <button class="secondary" onclick="logoutWallet()">Disconnetti</button>
    </div>
  </header>

  <main>
    <div id="feedback" class="notice" style="display:none"></div>

    <section class="card">
      <h2>1 · Collega wallet (firma monouso verificata) &amp; Scenari simulati</h2>
      <div class="row" style="margin-bottom:10px">
        <span class="muted">Login firmato per ruolo:</span>
        <button onclick="loginAs('alice')">Collega wallet Alice</button>
        <button onclick="loginAs('bob')">Collega wallet Bob</button>
        <button class="secondary" onclick="loginAs('cad')">Collega Fornitore CAD</button>
        <button class="secondary" onclick="loginAs('comune')">Collega Comune Torino</button>
      </div>
      <div class="row" id="sim-bar">
        <span class="muted">Risposte simulate:</span>
        <div id="preset-buttons" class="row"></div>
        <button class="secondary" onclick="advanceTime(35)">+35s</button>
        <button class="secondary" onclick="advanceTime(90)">+90s</button>
        <button class="secondary" onclick="refreshAll()">Aggiorna</button>
      </div>
    </section>

    <section class="card">
      <h2>2 · Risorse del catalogo, Titoli principali e Verifica accesso</h2>
      <div id="resources-grid" class="grid-2"></div>
    </section>

    <section class="grid-2">
      <div class="card">
        <h2>3 · Pannello Alice · Pubblica annuncio / nuova revisione</h2>
        <form id="listing-form" class="stack" onsubmit="submitListing(event)">
          <div class="grid-2">
            <label>Risorsa
              <select id="prop-resource" onchange="syncDefaults()">
                <option value="cad">cad · Posto CAD</option>
                <option value="torino-01">torino-01 · Cartellone Torino</option>
              </select>
            </label>
            <label>ID Annuncio (riusa lo stesso ID dopo un rifiuto per nuova revisione)
              <input id="prop-listing-id" value="annuncio-demo-01" required />
            </label>
          </div>
          <div class="grid-2">
            <label>Revisione
              <input id="prop-revision" type="number" min="1" value="1" required />
            </label>
            <label>Prezzo lordo (drops · 10000000 = 10 XRP)
              <input id="prop-price" value="10000000" oninput="updateSplitPreview()" required />
            </label>
          </div>
          <div class="grid-2">
            <label>Inizio periodo (UTC ISO al secondo)
              <input id="prop-starts" required />
            </label>
            <label>Fine periodo (UTC ISO al secondo)
              <input id="prop-ends" required />
            </label>
          </div>
          <div class="notice" id="split-preview">Riparto 10%: fee 1000000 drops (1 XRP) · netto 9000000 drops (9 XRP)</div>
          <div class="row">
            <button type="submit">Firma come Alice e Pubblica</button>
            <button type="button" class="secondary" onclick="fillDemoTimes()">Finestra +60s .. +180s</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>4 · Pannello Bob · Annunci disponibili e Cartellone</h2>
        <div id="listings-box" class="stack"></div>
        <h3>Pubblicazione su Cartellone torino-01</h3>
        <div class="stack">
          <input id="billboard-file" type="file" accept="image/png,image/jpeg" />
          <div class="row">
            <button onclick="uploadBillboardFile()">Pubblica sul cartellone</button>
            <button class="secondary" onclick="uploadDemoBillboardPng()">Pubblica immagine demo 16:9</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>5 · Ordini, Oracolo Ente, Escrow, Vault 2-su-3 e Ricevute XRPL</h2>
      <div id="orders-box" class="stack"></div>
    </section>
  </main>

  <script>
    let currentSession = null;
    let currentResources = [];
    let currentSim = null;

    function showNotice(msg, kind = 'ok') {
      const el = document.getElementById('feedback');
      el.style.display = 'block';
      el.className = 'notice ' + (kind === 'err' ? 'err' : 'ok');
      el.textContent = msg;
    }

    async function api(url, opts = {}) {
      const res = await fetch(url, opts);
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const msg = (data && data.message) ? data.message : ('HTTP ' + res.status);
        throw new Error(msg);
      }
      return data;
    }

    async function loginAs(role) {
      try {
        const ch = await api('/api/wallet/challenge', { method: 'POST', headers: {'content-type': 'application/json'}, body: '{}' });
        const signed = await api('/api/local-signer/login', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ challenge: ch.challenge, role }),
        });
        await api('/api/wallet/session', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ id: signed.id, proof: signed.proof }),
        });
        showNotice('Wallet autenticato per ruolo: ' + role);
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function logoutWallet() {
      await api('/api/wallet/session', { method: 'DELETE' });
      showNotice('Sessione chiusa.');
      await refreshAll();
    }

    async function applyPreset(preset) {
      try {
        await api('/api/simulazione/preset', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ preset }),
        });
        showNotice('Scenario simulato caricato: ' + preset);
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function advanceTime(seconds) {
      try {
        const res = await api('/api/simulazione/tempo', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ seconds }),
        });
        showNotice('Orologio simulato avanzato di +' + seconds + 's: ' + res.nowTorino);
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    function isoSec(ms) {
      return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\\.\\d{3}Z$/, 'Z');
    }

    function fillDemoTimes() {
      const base = currentSim ? Date.parse(currentSim.nowUtc) : Date.now();
      document.getElementById('prop-starts').value = isoSec(base + 60_000);
      document.getElementById('prop-ends').value = isoSec(base + 180_000);
    }

    function updateSplitPreview() {
      const raw = document.getElementById('prop-price').value.trim();
      try {
        const gross = BigInt(raw);
        const fee = (gross * 1000n) / 10000n;
        const net = gross - fee;
        document.getElementById('split-preview').textContent =
          'Riparto 10%: fee ' + fee + ' drops (' + (Number(fee)/1e6).toFixed(2) + ' XRP) · netto ' +
          net + ' drops (' + (Number(net)/1e6).toFixed(2) + ' XRP)';
      } catch {
        document.getElementById('split-preview').textContent = 'Inserire importo intero positivo in drops.';
      }
    }

    function syncDefaults() {
      const resId = document.getElementById('prop-resource').value;
      document.getElementById('prop-listing-id').value = resId === 'cad' ? 'annuncio-cad-01' : 'annuncio-torino-01';
    }

    async function submitListing(ev) {
      ev.preventDefault();
      try {
        const payload = {
          resourceId: document.getElementById('prop-resource').value,
          listingId: document.getElementById('prop-listing-id').value.trim(),
          revision: Number(document.getElementById('prop-revision').value),
          startsAt: document.getElementById('prop-starts').value.trim(),
          endsAt: document.getElementById('prop-ends').value.trim(),
          priceDrops: document.getElementById('prop-price').value.trim(),
        };
        const signed = await api('/api/local-signer/proposal', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(payload),
        });
        await api('/api/annunci', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(signed),
        });
        showNotice('Annuncio pubblicato e firmato da Alice.');
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function acceptListing(listingId, revision, startsAt) {
      try {
        const base = currentSim ? Date.parse(currentSim.nowUtc) : Date.now();
        const startMs = Date.parse(startsAt);
        const fundBy = isoSec(Math.min(startMs, base + 30_000));
        const acceptance = await api('/api/local-signer/order', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ listingId, revision, fundBy }),
        });
        await api('/api/annunci/' + encodeURIComponent(listingId) + '/ordini', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ acceptance }),
        });
        showNotice('Ordine firmato da Bob e riservato su calendario e vault.');
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function orderAction(url, body = {}) {
      try {
        await api(url, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(body),
        });
        showNotice('Operazione completata.');
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function rejectOrder(orderId) {
      const reason = prompt('Motivazione del rifiuto dell’ente:', 'Prezzo ritenuto eccessivo per la durata proposta');
      if (!reason) return;
      await orderAction('/api/ordini/' + encodeURIComponent(orderId) + '/decisione', { decision: 'reject', reason });
    }

    async function signPartialAndSubmit(orderId, role) {
      try {
        const sig = await api('/api/local-signer/vault-signature', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ orderId, role }),
        });
        await api('/api/ordini/' + encodeURIComponent(orderId) + '/liquidazione', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ action: 'sign', partialTxBlob: sig.tx_blob }),
        });
        showNotice('Firma parziale registrata per ' + role);
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function uploadBillboardFile() {
      const input = document.getElementById('billboard-file');
      if (!input.files || !input.files[0]) {
        showNotice('Selezionare un file PNG o JPEG.', 'err');
        return;
      }
      try {
        const bytes = await input.files[0].arrayBuffer();
        await api('/api/cartelloni/torino-01/immagine', {
          method: 'POST',
          headers: {'content-type': input.files[0].type || 'application/octet-stream'},
          body: bytes,
        });
        showNotice('Immagine pubblicata sul cartellone torino-01.');
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    async function uploadDemoBillboardPng() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f4c81';
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(48, 60, 544, 240);
        ctx.fillStyle = '#0b1220';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('TORINO-01 · CAMPAGNA BOB', 74, 175);
        ctx.font = '20px sans-serif';
        ctx.fillText('Pubblicazione autorizzata via pass NFT XRPL', 95, 220);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        const bytes = await blob.arrayBuffer();
        await api('/api/cartelloni/torino-01/immagine', {
          method: 'POST',
          headers: {'content-type': 'image/png'},
          body: bytes,
        });
        showNotice('Immagine demo 16:9 pubblicata su torino-01.');
        await refreshAll();
      } catch (err) {
        showNotice(err.message, 'err');
      }
    }

    function shortAddr(addr) {
      if (!addr) return '-';
      return addr.slice(0, 6) + '…' + addr.slice(-4);
    }

    async function refreshAll() {
      const [session, sim, resources, listings, orders] = await Promise.all([
        api('/api/wallet/session'),
        api('/api/simulazione/stato'),
        api('/api/risorse'),
        api('/api/annunci'),
        api('/api/ordini'),
      ]);
      currentSession = session;
      currentSim = sim;
      currentResources = resources;

      document.getElementById('server-clock').textContent =
        'Modalità: ' + sim.mode + ' · Ora server: ' + sim.nowTorino;

      const badge = document.getElementById('session-badge');
      if (session.authenticated) {
        badge.className = 'badge ok';
        const roleLabel = session.role === 'authority'
          ? (session.authorityScenario === 'cad' ? 'Fornitore CAD' : 'Comune Torino')
          : session.role.toUpperCase();
        badge.textContent = roleLabel + ' · ' + shortAddr(session.address);
      } else {
        badge.className = 'badge warn';
        badge.textContent = 'Ospite · Wallet non collegato';
      }

      const simBar = document.getElementById('sim-bar');
      if (sim.mode !== 'simulated') {
        simBar.style.display = 'none';
      } else {
        const presetBox = document.getElementById('preset-buttons');
        presetBox.innerHTML = sim.presets.map((p) =>
          '<button class="' + (p.id === sim.activePreset ? '' : 'secondary') +
          '" title="' + p.description + '" onclick="applyPreset(\\'' + p.id + '\\')">' + p.label + '</button>'
        ).join('');
      }

      if (!document.getElementById('prop-starts').value) fillDemoTimes();

      const accessList = await Promise.all(
        resources.map((r) => fetch('/api/risorse/' + encodeURIComponent(r.resourceId) + '/accesso').then((x) => x.json())),
      );

      document.getElementById('resources-grid').innerHTML = resources.map((r, i) => {
        const acc = accessList[i];
        const cls = acc.canAccess ? 'ok' : (acc.code === 'LEDGER_UNAVAILABLE' ? 'err' : 'warn');
        return '<div class="card" style="background:var(--panel-2)">' +
          '<div class="row" style="justify-content:space-between">' +
            '<strong>' + r.displayName + ' (' + r.resourceId + ')</strong>' +
            '<span class="badge ' + cls + '">' + acc.code + '</span>' +
          '</div>' +
          '<p style="margin:8px 0">' + acc.headline + '</p>' +
          '<div class="mono muted">Titolo NFT: ' + shortAddr(r.titleNftId) + ' · Vault 2/3: ' + shortAddr(r.vault) + '</div>' +
          '<div class="mono muted">Ente: ' + r.authorityName + ' (' + shortAddr(r.issuer) + ') · Fee: ' + (r.feeBps / 100) + '%</div>' +
        '</div>';
      }).join('');

      const listingsBox = document.getElementById('listings-box');
      if (listings.length === 0) {
        listingsBox.innerHTML = '<div class="muted">Nessun annuncio pubblicato. Pubblica dal pannello Alice oppure carica un preset simulato.</div>';
      } else {
        listingsBox.innerHTML = listings.map((l) => {
          const rev = l.latestRevision;
          return '<div class="card" style="background:var(--panel-2)">' +
            '<div class="row" style="justify-content:space-between">' +
              '<strong>' + l.listingId + ' (rev ' + rev.revision + ' · ' + rev.resourceId + ')</strong>' +
              '<span class="badge">' + rev.status + '</span>' +
            '</div>' +
            '<div class="muted">Prezzo: ' + (Number(rev.priceDrops)/1e6) + ' XRP (Fee ' + (Number(rev.feeDrops)/1e6) + ' XRP · Netto ' + (Number(rev.netDrops)/1e6) + ' XRP)</div>' +
            '<div class="mono muted">' + rev.startsAt + ' → ' + rev.endsAt + '</div>' +
            '<div class="row" style="margin-top:8px">' +
              '<button onclick="acceptListing(\\'' + l.listingId + '\\',' + rev.revision + ',\\'' + rev.startsAt + '\\')">Accetta come Bob</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      const ordersBox = document.getElementById('orders-box');
      if (orders.length === 0) {
        ordersBox.innerHTML = '<div class="muted">Nessun ordine registrato.</div>';
      } else {
        ordersBox.innerHTML = orders.map((o) => {
          const authRole = o.scenario === 'cad' ? 'cad' : 'comune';
          return '<div class="card" style="background:var(--panel-2)">' +
            '<div class="row" style="justify-content:space-between">' +
              '<strong>Ordine ' + o.orderId + ' · ' + o.resourceName + ' (rev ' + o.revision + ')</strong>' +
              '<span class="badge">' + o.statusLabel + '</span>' +
            '</div>' +
            '<div class="muted" style="margin:4px 0">Finestra: ' + o.startsAtTorino + ' → ' + o.endsAtTorino + ' · Termine deposito: ' + o.fundByTorino + '</div>' +
            '<div class="muted">Importi: ' + (Number(o.priceDrops)/1e6) + ' XRP lordo (' + (Number(o.feeDrops)/1e6) + ' XRP ente + ' + (Number(o.netDrops)/1e6) + ' XRP netto) · Escrow: ' + o.settlement.escrowLabel + ' · Liquidazione: ' + o.settlement.payoutLabel + '</div>' +
            (o.rejectionReason ? '<div class="notice err" style="margin-top:6px">Motivo rifiuto ente: ' + o.rejectionReason + '</div>' : '') +
            '<div class="row" style="margin-top:8px">' +
              '<button onclick="orderAction(\\'/api/ordini/' + o.orderId + '/decisione\\',{decision:\\'approve\\'})">Ente: Approva &amp; Emetti Pass</button>' +
              '<button class="danger" onclick="rejectOrder(\\'' + o.orderId + '\\')">Ente: Rifiuta</button>' +
              '<button onclick="orderAction(\\'/api/ordini/' + o.orderId + '/pass/accetta\\')">Bob: Ritira Pass (1 XRP fee)</button>' +
              '<button onclick="orderAction(\\'/api/ordini/' + o.orderId + '/deposito\\')">Bob: Deposita Netto (9 XRP)</button>' +
              '<button class="amber" onclick="orderAction(\\'/api/ordini/' + o.orderId + '/sblocco\\')">Operatore: Sblocca Escrow</button>' +
              '<button onclick="orderAction(\\'/api/ordini/' + o.orderId + '/liquidazione\\',{action:\\'prepare\\',mode:\\'ordinary\\'})">Prepara Vault 2-su-3</button>' +
              '<button onclick="signPartialAndSubmit(\\'' + o.orderId + '\\',\\'alice\\')">Firma Alice</button>' +
              '<button onclick="signPartialAndSubmit(\\'' + o.orderId + '\\',\\'bob\\')">Firma Bob</button>' +
              '<button class="secondary" onclick="signPartialAndSubmit(\\'' + o.orderId + '\\',\\'' + authRole + '\\')">Firma Ente</button>' +
              '<button class="secondary" onclick="orderAction(\\'/api/ordini/' + o.orderId + '/liquidazione\\',{action:\\'settle\\',mode:\\'arbitration_bob\\'})">Arbitrato → Bob</button>' +
              '<button class="danger" onclick="orderAction(\\'/api/ordini/' + o.orderId + '/recupero\\')">Recupero (Burn + Rimborso fee)</button>' +
              '<button class="secondary" onclick="orderAction(\\'/api/ordini/' + o.orderId + '/riconcilia\\')">Riconcilia</button>' +
            '</div>' +
            '<details style="margin-top:8px"><summary>Ricevute XRPL, Agreement Hash &amp; Stato Multifirma</summary>' +
              '<pre>' + JSON.stringify({
                agreementHash: o.agreementHash,
                vault: o.vault,
                calendarHeld: o.calendarHeld,
                vaultHeld: o.vaultHeld,
                receipts: o.receipts,
                settlement: {
                  escrowState: o.settlement.escrowState,
                  payoutPhase: o.settlement.payoutPhase,
                  collectedSigners: o.settlement.collectedSigners,
                }
              }, null, 2) + '</pre>' +
            '</details>' +
          '</div>';
        }).join('');
      }
    }

    refreshAll();
    setInterval(refreshAll, 2000);
  </script>
</body>
</html>`
}

export function renderCadPortalHtml(): string {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portale CAD · Affitto Diritti XRPL</title>
  <style>
    :root {
      --bg: #0f172a;
      --panel: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --ok: #22c55e;
      --warn: #f59e0b;
      --err: #ef4444;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
    header {
      padding: 14px 22px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #0b1220;
    }
    .pill {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--panel);
    }
    .pill.ok { border-color: var(--ok); color: #86efac; }
    .pill.warn { border-color: var(--warn); color: #fde68a; }
    .pill.err { border-color: var(--err); color: #fca5a5; }
    main { max-width: 960px; margin: 24px auto; padding: 0 20px; display: grid; gap: 18px; }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    button {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }
    button.secondary { background: #334155; font-size: 13px; padding: 7px 12px; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .mono { font-family: ui-monospace, monospace; font-size: 12px; color: var(--muted); }
    #project-viewport {
      display: none;
      background: #09111e;
      border: 1px solid var(--accent);
      border-radius: 12px;
      padding: 18px;
    }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <strong id="actor-name">Ospite</strong>
      <span id="actor-addr" class="mono">-</span>
      <span id="seat-name" class="pill">Posto CAD</span>
      <span id="seat-status" class="pill warn">Verifica...</span>
    </div>
    <div class="row">
      <button class="secondary" onclick="loginRole('alice')">Accedi come Alice</button>
      <button class="secondary" onclick="loginRole('bob')">Accedi come Bob</button>
      <a href="/" style="color:var(--accent);font-size:13px">Marketplace</a>
    </div>
  </header>

  <main>
    <section class="card">
      <h1 id="headline" style="margin-top:0;font-size:22px">Verifica diritto d’accesso in corso...</h1>
      <p id="reason" style="color:var(--muted);font-size:15px"></p>
      <div class="row">
        <button id="open-btn" onclick="openProject()">Apri progetto demo</button>
      </div>
      <p id="action-error" style="color:#fca5a5;display:none"></p>
    </section>

    <section id="project-viewport">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <strong id="proj-title">Progetto CAD</strong>
        <span id="proj-valid" class="mono"></span>
      </div>
      <svg viewBox="0 0 640 300" style="width:100%;height:auto;background:#050b16;border-radius:8px;border:1px solid #1e3a5f">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#102542" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="640" height="300" fill="url(#grid)" />
        <circle cx="220" cy="150" r="85" fill="none" stroke="#38bdf8" stroke-width="3"/>
        <circle cx="220" cy="150" r="52" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 4"/>
        <circle cx="220" cy="150" r="22" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="2"/>
        <rect x="340" y="90" width="210" height="120" fill="none" stroke="#f59e0b" stroke-width="2.5"/>
        <line x1="220" y1="150" x2="550" y2="150" stroke="#94a3b8" stroke-width="1" stroke-dasharray="8 4"/>
        <text x="352" y="120" fill="#fde68a" font-size="14" font-family="monospace">RIDUTTORE · REV 4</text>
        <text x="352" y="142" fill="#94a3b8" font-size="12" font-family="monospace">Ø EST: 170 mm · TOLL H7</text>
        <text x="352" y="192" fill="#38bdf8" font-size="12" font-family="monospace">SESSIONE AUTORIZZATA XRPL</text>
      </svg>
    </section>
  </main>

  <script>
    let expiryTimer = null;
    let projectOpen = false;
    let knownDeadlineMs = null;

    function shortAddr(addr) {
      return addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : 'non autenticato';
    }

    function closeProjectView(msg) {
      projectOpen = false;
      document.getElementById('project-viewport').style.display = 'none';
      if (msg) {
        document.getElementById('headline').textContent = msg;
        document.getElementById('reason').textContent = msg;
      }
      document.getElementById('open-btn').disabled = true;
    }

    function scheduleLocalExpiry(nextTransitionUtc) {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      knownDeadlineMs = nextTransitionUtc ? Date.parse(nextTransitionUtc) : null;
      if (!knownDeadlineMs || !Number.isFinite(knownDeadlineMs)) return;
      const delay = Math.max(0, knownDeadlineMs - Date.now());
      expiryTimer = setTimeout(() => {
        if (projectOpen) {
          closeProjectView('Periodo o licenza terminati. Verifica in corso...');
        }
        pollAccess();
      }, delay + 50);
    }

    async function loginRole(role) {
      const ch = await fetch('/api/wallet/challenge', { method: 'POST', headers: {'content-type': 'application/json'}, body: '{}' }).then((r) => r.json());
      const signed = await fetch('/api/local-signer/login', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({ challenge: ch.challenge, role }),
      }).then((r) => r.json());
      await fetch('/api/wallet/session', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({ id: signed.id, proof: signed.proof }),
      });
      projectOpen = false;
      document.getElementById('project-viewport').style.display = 'none';
      await pollAccess();
    }

    async function openProject() {
      const errEl = document.getElementById('action-error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/api/cad/cad/progetto');
        const data = await res.json();
        if (!res.ok) {
          closeProjectView();
          errEl.textContent = data.message || 'Accesso negato.';
          errEl.style.display = 'block';
          await pollAccess();
          return;
        }
        projectOpen = true;
        document.getElementById('project-viewport').style.display = 'block';
        document.getElementById('proj-title').textContent = data.project.title;
        document.getElementById('proj-valid').textContent = 'Valido fino al: ' + (data.project.validUntilTorino || '-');
        scheduleLocalExpiry(data.project.nextTransitionAtUtc);
      } catch {
        closeProjectView('Connessione persa con il backend.');
      }
    }

    async function pollAccess() {
      if (knownDeadlineMs && Date.now() >= knownDeadlineMs && projectOpen) {
        closeProjectView('Termine raggiunto.');
      }
      try {
        const res = await fetch('/api/risorse/cad/accesso');
        const data = await res.json();
        const roleMap = { alice: 'Alice', bob: 'Bob', authority: 'Ente', guest: 'Ospite' };
        document.getElementById('actor-name').textContent = roleMap[data.role] || 'Ospite';
        document.getElementById('actor-addr').textContent = shortAddr(data.sessionAddress);
        document.getElementById('seat-name').textContent = data.resourceName;

        const statusEl = document.getElementById('seat-status');
        statusEl.textContent = data.headline;
        statusEl.className = 'pill ' + (data.canAccess ? 'ok' : (data.code === 'LEDGER_UNAVAILABLE' ? 'err' : 'warn'));

        document.getElementById('headline').textContent = data.headline;
        document.getElementById('reason').textContent = data.reason;
        document.getElementById('open-btn').disabled = !data.canAccess;

        if (!data.canAccess && projectOpen) {
          closeProjectView();
        }
        scheduleLocalExpiry(data.nextTransitionAtUtc);
      } catch {
        if (knownDeadlineMs && Date.now() >= knownDeadlineMs) {
          closeProjectView('Periodo scaduto e rete non disponibile.');
        }
      }
    }

    pollAccess();
    setInterval(pollAccess, 2000);
    window.addEventListener('online', pollAccess);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pollAccess();
    });
  </script>
</body>
</html>`
}

export function renderBillboardPlayerHtml(resourceId: string): string {
  const safeId = resourceId.replace(/[^a-zA-Z0-9_-]/g, '')
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Schermo ${safeId}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      overflow: hidden;
    }
    #billboard-img {
      display: none;
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      object-fit: cover;
      object-position: center;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <img id="billboard-img" alt="" />
  <script>
    const RESOURCE_ID = ${JSON.stringify(safeId)};
    let expiryTimer = null;
    let knownExpiryMs = null;
    let currentSrc = '';

    function clearScreen() {
      const img = document.getElementById('billboard-img');
      img.style.display = 'none';
      img.removeAttribute('src');
      currentSrc = '';
      knownExpiryMs = null;
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
    }

    function scheduleExpiry(expiresAtUtc) {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      knownExpiryMs = expiresAtUtc ? Date.parse(expiresAtUtc) : null;
      if (!knownExpiryMs || !Number.isFinite(knownExpiryMs)) return;
      const delay = Math.max(0, knownExpiryMs - Date.now());
      expiryTimer = setTimeout(() => {
        clearScreen();
        pollBillboard();
      }, delay + 30);
    }

    async function pollBillboard() {
      if (knownExpiryMs && Date.now() >= knownExpiryMs) {
        clearScreen();
      }
      try {
        const res = await fetch('/api/cartelloni/' + encodeURIComponent(RESOURCE_ID) + '/corrente', {
          cache: 'no-store',
        });
        if (!res.ok) {
          clearScreen();
          return;
        }
        const data = await res.json();
        if (!data.active || !data.imageUrl) {
          clearScreen();
          return;
        }
        const img = document.getElementById('billboard-img');
        if (currentSrc !== data.imageUrl) {
          currentSrc = data.imageUrl;
          img.src = data.imageUrl;
        }
        img.style.display = 'block';
        scheduleExpiry(data.expiresAtUtc);
      } catch {
        if (!knownExpiryMs || Date.now() >= knownExpiryMs) {
          clearScreen();
        }
      }
    }

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
