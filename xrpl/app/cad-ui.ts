export function renderCadPortalHtml(): string {
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Posto CAD · Affitti XRPL</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6f5;
      --surface: #fff;
      --text: #132725;
      --muted: #516661;
      --line: #d9e4e0;
      --primary: #076455;
      --error: #8a332c;
      font-family: system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
    header { background: var(--surface); border-bottom: 1px solid var(--line); }
    .topbar, main { max-width: 850px; margin-inline: auto; padding-inline: clamp(16px, 5vw, 32px); }
    .topbar { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 8px; }
    a { color: var(--primary); font-weight: 650; text-underline-offset: 3px; }
    main { display: grid; gap: 20px; padding-block: clamp(24px, 7vw, 56px); }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(2rem, 6vw, 3rem); line-height: 1.15; letter-spacing: -.04em; }
    h2 { font-size: clamp(1.25rem, 4vw, 1.65rem); line-height: 1.3; }
    .card { padding: clamp(18px, 5vw, 30px); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
    .card p { margin-top: 6px; color: var(--muted); }
    .actions:not([hidden]) { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    button, summary { font: inherit; }
    button {
      min-height: 44px; padding: 8px 15px; border: 1px solid transparent; border-radius: 9px;
      background: var(--primary); color: white; font-weight: 650; cursor: pointer;
    }
    button:hover:not(:disabled) { background: #054d41; }
    button:disabled { opacity: .65; cursor: wait; }
    .secondary { background: var(--surface); border-color: var(--line); color: var(--primary); }
    .secondary:hover:not(:disabled) { background: #eaf3f0; }
    :is(a, button, summary):focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
    .account { position: relative; }
    summary { min-height: 44px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; cursor: pointer; }
    summary span + span { margin-left: 5px; }
    .address { color: var(--muted); font-size: .85rem; }
    .switcher {
      position: absolute; z-index: 1; right: 0; top: calc(100% + 6px); width: max-content; max-width: 80vw;
      padding: 6px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface);
      box-shadow: 0 8px 22px #13272514;
    }
    .switcher button { width: 100%; text-align: left; border-color: transparent; }
    .card p.error { color: var(--error); margin-top: 12px; }
    #project-title { font-size: 1.15rem; }
    svg { display: block; width: 100%; height: auto; margin-top: 16px; background: #09111e; border-radius: 10px; }
  </style>
</head>
<body>
  <header>
    <div class="topbar">
      <a href="/">Marketplace</a>
      <details class="account" id="account" hidden>
        <summary><span id="actor"></span><span id="address" class="address"></span></summary>
        <div class="switcher">
          <button type="button" class="secondary" data-login="alice">Passa ad Alice</button>
          <button type="button" class="secondary" data-login="bob">Passa a Bob</button>
        </div>
      </details>
    </div>
  </header>

  <main>
    <h1 id="seat">Posto CAD</h1>
    <section class="card" aria-labelledby="headline">
      <div role="status">
        <h2 id="headline" tabindex="-1">Verifica dell’accesso</h2>
        <p id="reason" hidden></p>
      </div>
      <div id="login-actions" class="actions" hidden>
        <button type="button" data-login="alice">Accedi come Alice</button>
        <button type="button" class="secondary" data-login="bob">Accedi come Bob</button>
      </div>
      <div id="project-action" class="actions" hidden>
        <button type="button" id="open-project">Apri progetto demo</button>
      </div>
      <p class="error" id="action-error" role="alert" hidden></p>
    </section>

    <section class="card" id="project" aria-labelledby="project-title" hidden>
      <h2 id="project-title" tabindex="-1"></h2>
      <svg viewBox="0 0 640 300" role="img" aria-label="Disegno tecnico dell’assieme riduttore epicicloidale">
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#18344c" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="640" height="300" fill="url(#grid)" />
        <circle cx="220" cy="150" r="85" fill="none" stroke="#65d6c0" stroke-width="3"/>
        <circle cx="220" cy="150" r="52" fill="none" stroke="#65d6c0" stroke-width="2" stroke-dasharray="6 4"/>
        <circle cx="220" cy="150" r="22" fill="#65d6c0" fill-opacity=".25" stroke="#baeede" stroke-width="2"/>
        <rect x="340" y="90" width="210" height="120" fill="none" stroke="#fbbf73" stroke-width="2.5"/>
        <line x1="220" y1="150" x2="550" y2="150" stroke="#a7b8ca" stroke-width="1" stroke-dasharray="8 4"/>
        <text x="352" y="120" fill="#fde3ae" font-size="14" font-family="monospace">RIDUTTORE · REV 4</text>
        <text x="352" y="142" fill="#a7b8ca" font-size="12" font-family="monospace">Ø EST: 170 mm · TOLL H7</text>
        <text x="352" y="192" fill="#65d6c0" font-size="12" font-family="monospace">SESSIONE AUTORIZZATA XRPL</text>
      </svg>
    </section>
  </main>

  <script>
    const el = (id) => document.getElementById(id);
    const loginButtons = document.querySelectorAll('[data-login]');
    const names = { alice: 'Alice', bob: 'Bob', authority: 'Ente' };
    const dateFormatter = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
    let deadlineAt = null;
    let expiryTimer = null;
    let openedBy = null;
    let busy = false;
    let polling = false;
    let operation = 0;

    function text(id, value) {
      const node = el(id);
      if (node.textContent !== value) node.textContent = value;
    }

    function message(headline, reason = '') {
      text('headline', headline);
      text('reason', reason);
      el('reason').hidden = !reason;
    }

    function showError(reason = '') {
      text('action-error', reason);
      el('action-error').hidden = !reason;
    }

    function closeProject() {
      const project = el('project');
      const hadFocus = project.contains(document.activeElement);
      openedBy = null;
      project.hidden = true;
      if (hadFocus) el('headline').focus({ preventScroll: true });
    }

    async function request(url, body) {
      const response = await fetch(url, body === undefined ? { cache: 'no-store' } : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      return { response, data };
    }

    async function send(url, body) {
      const { response, data } = await request(url, body);
      if (!response.ok) throw new Error(data.message || 'Accesso al wallet non riuscito.');
      return data;
    }

    function scheduleExpiry(access, startedAt) {
      clearTimeout(expiryTimer);
      deadlineAt = null;
      if (!access.canAccess) return false;
      const remainingAtRequest = Date.parse(access.nextTransitionAtUtc) - Date.parse(access.serverNowUtc);
      if (!Number.isFinite(remainingAtRequest)) return false;
      deadlineAt = startedAt + remainingAtRequest;
      const remaining = deadlineAt - performance.now();
      if (remaining <= 0) return false;
      expiryTimer = setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647));
      return true;
    }

    function checkDeadline() {
      if (deadlineAt === null) return;
      const remaining = deadlineAt - performance.now();
      if (remaining > 0) {
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647));
        return;
      }
      deadlineAt = null;
      closeProject();
      el('project-action').hidden = true;
      message('Verifica dell’accesso');
      refreshAccess();
    }

    function applyAccess(access, startedAt) {
      const hasAccess = scheduleExpiry(access, startedAt);
      const hasWallet = Boolean(access.sessionAddress);
      if (!hasAccess || (openedBy && openedBy !== access.sessionAddress)) closeProject();
      if (access.resourceName) text('seat', access.resourceName);
      const address = access.sessionAddress;
      text('actor', names[access.role] || 'Wallet');
      text('address', address ? address.slice(0, 6) + '…' + address.slice(-4) : '');
      el('account').hidden = !hasWallet;
      el('login-actions').hidden = hasWallet;
      for (const button of loginButtons) button.hidden = button.dataset.login === access.role;
      el('project-action').hidden = !hasAccess || Boolean(openedBy);

      if (access.code === 'SESSION_REQUIRED') {
        message('Collega il wallet');
      } else if (access.canAccess && !hasAccess) {
        message('Verifica dell’accesso');
      } else if (access.code === 'ALICE_SUSPENDED') {
        message('Licenza in affitto', access.reason);
      } else if (access.code === 'BOB_ACTIVE') {
        message('Pass attivo', 'Accesso disponibile fino al ' + dateFormatter.format(Date.parse(access.activeUntilUtc)) + '.');
      } else {
        message(access.headline, access.reason === access.headline ? '' : access.reason);
      }
      return hasAccess;
    }

    async function fetchAccess() {
      const startedAt = performance.now();
      const { data } = await request('/api/risorse/cad/accesso');
      if (typeof data?.canAccess !== 'boolean') throw new Error('Risposta del server non disponibile.');
      return { data, startedAt };
    }

    async function refreshAccess() {
      if (polling || busy) return;
      checkDeadlineBeforeRequest();
      polling = true;
      const current = operation;
      try {
        const { data, startedAt } = await fetchAccess();
        if (current === operation) applyAccess(data, startedAt);
      } catch {
        if (current !== operation) return;
        el('project-action').hidden = true;
        if (deadlineAt === null) closeProject();
        message('Connessione non disponibile', 'Riproveremo automaticamente.');
      } finally {
        polling = false;
      }
    }

    function checkDeadlineBeforeRequest() {
      if (deadlineAt !== null && performance.now() >= deadlineAt) {
        deadlineAt = null;
        closeProject();
        el('project-action').hidden = true;
      }
    }

    function setBusy(value) {
      busy = value;
      el('open-project').disabled = value;
      for (const button of loginButtons) button.disabled = value;
    }

    async function login(role) {
      if (busy) return;
      operation++;
      setBusy(true);
      closeProject();
      el('account').open = false;
      el('project-action').hidden = true;
      showError();
      message('Collegamento del wallet');
      try {
        const { challenge } = await send('/api/wallet/challenge', {});
        const { id, proof } = await send('/api/local-signer/login', { challenge, role });
        await send('/api/wallet/session', { id, proof });
        const { data, startedAt } = await fetchAccess();
        applyAccess(data, startedAt);
        el('headline').focus({ preventScroll: true });
      } catch (error) {
        el('login-actions').hidden = !el('account').hidden;
        message('Collegamento non riuscito');
        showError(error.message);
      } finally {
        setBusy(false);
      }
    }

    async function openProject() {
      if (busy) return;
      operation++;
      setBusy(true);
      showError();
      try {
        const startedAt = performance.now();
        const { response, data } = await request('/api/cad/cad/progetto');
        if (!response.ok) throw new Error(data.message || 'Accesso al progetto non disponibile.');
        if (!applyAccess(data.access, startedAt)) return;
        openedBy = data.project.openedByAddress;
        text('project-title', data.project.title);
        el('project').hidden = false;
        el('project-action').hidden = true;
        el('project-title').focus();
      } catch (error) {
        closeProject();
        el('project-action').hidden = true;
        showError(error.message);
      } finally {
        setBusy(false);
      }
    }

    for (const button of loginButtons) button.addEventListener('click', () => login(button.dataset.login));
    el('open-project').addEventListener('click', openProject);
    refreshAccess();
    setInterval(refreshAccess, 2000);
    window.addEventListener('online', refreshAccess);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshAccess();
    });
  </script>
</body>
</html>`
}
