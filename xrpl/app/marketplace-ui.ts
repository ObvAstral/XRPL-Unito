export function renderMarketplaceHtml(): string {
  return String.raw`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Affitti XRPL · Marketplace</title>
  <style>
    :root {
      color-scheme: light;
      --page: #f3f6f5;
      --surface: #fff;
      --ink: #132725;
      --muted: #516661;
      --line: #d9e4e0;
      --accent: #076455;
      --accent-hover: #064b40;
      --tint: #e4f2ed;
      --warning: #785218;
      --warning-bg: #fff3d9;
      --error: #a0262d;
      --error-bg: #fff1f1;
      --radius: 1rem;
      --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--page); color: var(--ink); font: 1rem/1.55 var(--sans); }
    h1, h2, h3, p, dl, dd { margin: 0; }
    h1, h2, h3 { line-height: 1.15; letter-spacing: -.025em; }
    h1 { font-size: clamp(2rem, 5vw, 3.15rem); }
    h2 { font-size: 1.35rem; }
    h3 { font-size: 1.16rem; }
    a { color: var(--accent); text-underline-offset: .18em; }
    :focus-visible { outline: 3px solid #188e78; outline-offset: 3px; }
    button, input, select, textarea { font: inherit; }
    button, .button {
      display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem;
      padding: .55rem 1rem; border: 1px solid transparent; border-radius: .65rem;
      background: var(--accent); color: #fff; line-height: 1.3; font-weight: 650;
      text-decoration: none; cursor: pointer;
    }
    button:hover, .button:hover { background: var(--accent-hover); }
    button:disabled { opacity: .52; cursor: default; }
    .secondary { color: var(--accent); background: var(--surface); border-color: var(--line); }
    .secondary:hover { background: var(--tint); }
    .danger { color: var(--error); }
    .danger:hover { background: var(--error-bg); }
    .quiet { background: transparent; padding-inline: .5rem; }
    input, select, textarea {
      width: 100%; min-height: 2.75rem; padding: .5rem .7rem; border: 1px solid #adbfb9;
      border-radius: .55rem; background: var(--surface); color: var(--ink);
    }
    label { display: grid; gap: .3rem; font-weight: 600; }
    label small { color: var(--muted); font-weight: 400; }
    small, .small { font-size: .875rem; }
    .muted { color: var(--muted); }
    .bar { border-bottom: 1px solid var(--line); background: var(--surface); }
    .bar-content, main { width: min(100% - 2rem, 60rem); margin-inline: auto; }
    .bar-content { display: flex; align-items: center; justify-content: space-between; gap: .5rem 1rem; min-height: 4.25rem; padding-block: .5rem; }
    .brand { color: var(--ink); font-weight: 750; text-decoration: none; letter-spacing: -.02em; white-space: nowrap; }
    .identity { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: .15rem .65rem; }
    .mode { font-size: .85rem; color: var(--muted); white-space: nowrap; }
    .mode::before { content: ""; display: inline-block; margin-right: .4rem; width: .45rem; height: .45rem; border-radius: 50%; background: #57867a; vertical-align: .12rem; }
    main { padding-block: clamp(1.5rem, 4vw, 3.25rem); display: grid; gap: 1.25rem; }
    .hero { display: grid; gap: 1.1rem; }
    .hero p { color: var(--muted); }
    .role-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    .role-tile {
      display: grid; gap: .2rem; text-align: left; justify-content: stretch; min-height: 5.5rem;
      padding: 1rem; border: 1px solid var(--line); border-radius: var(--radius);
      color: var(--ink); background: var(--surface);
    }
    .role-tile:hover { background: var(--tint); border-color: #9dbeb3; }
    .role-tile span { color: var(--muted); font-size: .9rem; font-weight: 400; }
    .resource-tabs { display: flex; gap: .3rem; padding: .28rem; border: 1px solid var(--line); border-radius: .8rem; background: var(--surface); width: fit-content; max-width: 100%; }
    .resource-tabs button { background: transparent; color: var(--muted); padding-inline: .95rem; }
    .resource-tabs button[aria-pressed="true"] { background: var(--tint); color: var(--accent-hover); }
    .resource-tabs button:not([aria-pressed="true"]):hover { background: var(--page); color: var(--ink); }
    .resource-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: .8rem 1rem; }
    .resource-head p { margin-top: .4rem; }
    .workspace, .stack { display: grid; gap: 1rem; min-width: 0; }
    .panel { padding: clamp(1rem, 3vw, 1.55rem); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); min-width: 0; }
    .panel-title { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: start; justify-content: space-between; }
    .status { display: inline-block; border-radius: .45rem; padding: .24rem .55rem; background: var(--tint); color: var(--accent-hover); font-size: .875rem; font-weight: 650; }
    .status.waiting { background: var(--warning-bg); color: var(--warning); }
    .status.closed { background: var(--page); color: var(--muted); }
    .status.error { background: var(--error-bg); color: var(--error); }
    .access-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: .3rem .75rem; }
    .access-line p, .empty { color: var(--muted); }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem 1rem; padding: .85rem 0; border-block: 1px solid var(--line); }
    .facts dt { color: var(--muted); font-size: .875rem; }
    .facts dd { font-weight: 650; overflow-wrap: anywhere; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; }
    .next { display: grid; gap: .65rem; }
    .notice { padding: .7rem 1rem; border-radius: .65rem; background: var(--tint); color: var(--accent-hover); }
    .notice.error { background: var(--error-bg); color: var(--error); }
    .inline-error { color: var(--error); overflow-wrap: anywhere; }
    details { min-width: 0; }
    details summary { cursor: pointer; font-size: .9rem; font-weight: 650; color: var(--accent); }
    details[open] > summary { margin-bottom: .7rem; }
    details.tools { padding-top: .8rem; border-top: 1px solid var(--line); }
    .receipts { display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr); gap: .4rem .8rem; font-size: .875rem; }
    .receipts dt { color: var(--muted); }
    .receipts dd { overflow-wrap: anywhere; font-family: ui-monospace, monospace; }
    .sim-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: end; }
    dialog { width: min(32rem, 100% - 2rem); padding: 1.4rem; border: 1px solid var(--line); border-radius: var(--radius); color: var(--ink); box-shadow: 0 16px 42px #18342d30; max-height: calc(100dvh - 2rem); }
    dialog::backdrop { background: #142c2766; }
    .date-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    @media (max-width: 34rem) {
      .bar-content { flex-wrap: wrap; }
      .facts, .date-fields { grid-template-columns: 1fr; }
      .sim-row { grid-template-columns: 1fr; }
      .receipts { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="bar">
    <div class="bar-content">
      <a class="brand" href="/">Affitti XRPL</a>
      <div class="identity">
        <span class="mode" id="mode" hidden></span>
        <strong class="small" id="actor" hidden></strong>
        <button class="secondary quiet small" id="change-role" type="button" hidden>Cambia ruolo</button>
      </div>
    </div>
  </header>

  <main>
    <p class="notice" id="feedback" role="status">Caricamento…</p>
    <section id="login" class="hero" hidden aria-labelledby="login-title">
      <div>
        <h1 id="login-title" tabindex="-1">Collega il tuo wallet</h1>
        <p>Scegli il ruolo con cui partecipi alla demo.</p>
      </div>
      <div class="role-grid">
        <button class="role-tile" type="button" data-action="login" data-role="alice"><strong>Alice</strong><span>Titolare</span></button>
        <button class="role-tile" type="button" data-action="login" data-role="bob"><strong>Bob</strong><span>Affittuario</span></button>
        <button class="role-tile" type="button" data-action="login" data-role="cad"><strong>Fornitore CAD</strong><span>Ente autorizzatore</span></button>
        <button class="role-tile" type="button" data-action="login" data-role="comune"><strong>Comune di Torino</strong><span>Ente autorizzatore</span></button>
      </div>
      <div class="row" id="role-options" hidden>
        <button class="secondary" id="keep-role" type="button">Torna al ruolo corrente</button>
        <button class="secondary quiet" id="logout" type="button">Disconnetti</button>
      </div>
    </section>

    <div id="workspace" class="workspace" hidden>
      <div id="resource-picker" class="resource-tabs" role="group" aria-label="Scegli la risorsa">
        <button type="button" data-action="resource" data-id="cad" aria-pressed="true">Posto CAD</button>
        <button type="button" data-action="resource" data-id="torino-01" aria-pressed="false">Cartellone</button>
      </div>
      <section class="stack" aria-labelledby="resource-name">
        <div class="resource-head">
          <div>
            <h1 id="resource-name" tabindex="-1"></h1>
            <p id="resource-subtitle" hidden></p>
          </div>
          <a id="service-link" class="button secondary" hidden></a>
        </div>
        <div id="access-state" class="access-line" aria-live="polite"></div>
      </section>
      <div id="work-cards" class="stack"></div>
      <section id="billboard-upload" class="panel stack" hidden aria-labelledby="upload-title">
        <h2 id="upload-title">Pubblica sul cartellone</h2>
        <form id="upload-form" class="stack">
          <label>Immagine <small>PNG o JPEG</small><input id="billboard-file" type="file" accept="image/png,image/jpeg" required></label>
          <div class="row">
            <button type="submit">Pubblica immagine</button>
            <button type="button" class="secondary" data-action="demo-image" id="demo-image" hidden>Usa un’immagine di esempio</button>
          </div>
        </form>
      </section>
    </div>
    <details id="demo-controls" class="tools" hidden>
      <summary>Comandi della simulazione</summary>
      <div class="stack">
        <p id="demo-clock" class="small muted"></p>
        <form id="preset-form" class="sim-row">
          <label>Scenario CAD <select id="preset"></select></label>
          <button type="submit" class="secondary">Carica scenario</button>
        </form>
        <div id="demo-time"></div>
      </div>
    </details>
  </main>

  <dialog id="listing-dialog" aria-labelledby="listing-title">
    <form id="listing-form" class="stack">
      <h2 id="listing-title">Nuovo annuncio</h2>
      <label>Prezzo totale in XRP <input id="price" type="text" inputmode="decimal" value="10" required></label>
      <p id="split" class="small muted" aria-live="polite"></p>
      <div class="date-fields">
        <label>Inizio <input id="starts" type="datetime-local" step="1" required></label>
        <label>Fine <input id="ends" type="datetime-local" step="1" required></label>
      </div>
      <p class="small muted">Orari di Torino. Il deposito va completato entro l’inizio.</p>
      <p id="listing-error" class="inline-error" role="alert" hidden></p>
      <div class="row">
        <button type="submit">Firma e pubblica</button>
        <button class="secondary" type="button" data-close="listing-dialog">Annulla</button>
      </div>
    </form>
  </dialog>
  <dialog id="reject-dialog" aria-labelledby="reject-title">
    <form id="reject-form" class="stack">
      <h2 id="reject-title">Rifiuta richiesta</h2>
      <label>Motivazione per Alice e Bob <textarea id="reject-reason" rows="3" required></textarea></label>
      <p id="reject-error" class="inline-error" role="alert" hidden></p>
      <div class="row">
        <button type="submit">Conferma rifiuto</button>
        <button class="secondary" type="button" data-close="reject-dialog">Annulla</button>
      </div>
    </form>
  </dialog>

  <script>
    const $ = (id) => document.getElementById(id);
    const labels = { alice: 'Alice', bob: 'Bob', cad: 'Fornitore CAD', comune: 'Comune di Torino' };
    const resourceIds = ['cad', 'torino-01'];
    const rome = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const romeInput = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const state = {
      selected: new URL(location.href).searchParams.get('risorsa') === 'torino-01' ? 'torino-01' : 'cad',
      session: null, sim: null, resources: [], listings: [], orders: [], access: null,
      choosing: false, busy: false, version: 0,
    };
    let listingDraft = null;
    let rejectionId = null;
    let pollId = null;
    const markupCache = new WeakMap();

    function html(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[char]);
    }
    function setHtml(el, markup) {
      if (markupCache.get(el) === markup) return;
      const opened = new Set(Array.from(el.querySelectorAll('details[open][data-detail]'), (item) => item.dataset.detail));
      const oldFocus = document.activeElement;
      const focusKey = el.contains(oldFocus) ? oldFocus.dataset.focus : null;
      el.innerHTML = markup;
      markupCache.set(el, markup);
      for (const item of el.querySelectorAll('details[data-detail]')) item.open = opened.has(item.dataset.detail);
      if (focusKey) Array.from(el.querySelectorAll('[data-focus]')).find((item) => item.dataset.focus === focusKey)?.focus();
    }
    function notice(message, failed = false) {
      const el = $('feedback');
      el.hidden = !message;
      el.className = 'notice' + (failed ? ' error' : '');
      el.textContent = message;
    }
    function inlineError(id, message) {
      $(id).hidden = !message;
      $(id).textContent = message;
    }
    async function api(url, options = {}) {
      const res = await fetch(url, options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Operazione non riuscita.');
      return data;
    }
    function post(url, body = {}) {
      return api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    }
    function orderPath(id, route) {
      return '/api/ordini/' + encodeURIComponent(id) + '/' + route;
    }
    function now() {
      return Date.parse(state.sim?.nowUtc) || Date.now();
    }
    function role() {
      const session = state.session;
      if (!session?.authenticated) return null;
      if (session.role === 'authority') return session.authorityScenario === 'cad' ? 'cad' : 'comune';
      return labels[session.role] ? session.role : null;
    }
    function selectedResource() {
      if (role() === 'cad') return 'cad';
      if (role() === 'comune') return 'torino-01';
      return state.selected;
    }
    function actorOrders() {
      return state.orders.filter((order) => [order.alice, order.bob, order.issuer].includes(state.session.address));
    }
    function findOrder(id) { return actorOrders().find((item) => item.orderId === id); }
    function findListing(id) { return state.listings.find((item) => item.listingId === id); }
    function xrp(drops) {
      const amount = BigInt(drops);
      const whole = (amount / 1000000n).toLocaleString('it-IT');
      const decimals = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
      return whole + (decimals ? ',' + decimals : '') + ' XRP';
    }
    function dropsFromPrice(value) {
      const parts = /^([0-9]{1,12})(?:[.,]([0-9]{1,6}))?$/.exec(value.trim());
      if (!parts) throw new Error('Inserisci un prezzo in XRP con al massimo 6 decimali.');
      return BigInt(parts[1]) * 1000000n + BigInt((parts[2] || '').padEnd(6, '0'));
    }
    function dateLabel(value) { return rome.format(new Date(value)); }
    function inputDate(value) {
      const fields = Object.fromEntries(romeInput.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
      return fields.year + '-' + fields.month + '-' + fields.day + 'T' + fields.hour + ':' + fields.minute + ':' + fields.second;
    }
    function utcDate(value) {
      const local = value.length === 16 ? value + ':00' : value;
      const clock = Date.parse(local + 'Z');
      // Torino alterna UTC+1 e UTC+2. Convalidiamo l'orario locale anche al cambio d'ora.
      const candidates = Number.isFinite(clock) ? [clock - 3600000, clock - 7200000].filter((ms) => inputDate(ms) === local) : [];
      if (candidates.length !== 1) throw new Error('Scegli un orario di Torino univoco e valido.');
      return new Date(candidates[0]).toISOString().replace('.000Z', 'Z');
    }
    function button(action, label, id = '', classes = '', choice = '') {
      const key = action + ':' + id + ':' + choice;
      return '<button type="button" class="' + classes + '" data-action="' + action + '" data-id="' + html(id) +
        '" data-choice="' + html(choice) + '" data-focus="' + html(key) + '">' + html(label) + '</button>';
    }
    function detailAttr(key) {
      return ' data-detail="' + html(key) + '"><summary data-focus="' + html('detail:' + key) + '">';
    }
    function fact(label, value) {
      return '<div><dt>' + html(label) + '</dt><dd>' + html(value) + '</dd></div>';
    }
    function amounts(item) {
      return '<p class="small muted">' + html(xrp(item.feeDrops) + ' all’ente · ' + xrp(item.netDrops) + ' ad Alice') + '</p>';
    }
    function period(item) {
      return '<dl class="facts" aria-label="Periodo in ora di Torino e prezzo totale">' + fact('Inizio', dateLabel(item.startsAt)) + fact('Fine', dateLabel(item.endsAt)) +
        fact('Totale', xrp(item.priceDrops)) + '</dl>';
    }

    function nextStep(o, who) {
      const authority = state.session.role === 'authority';
      const checkoutOpen = now() < Date.parse(o.fundBy);
      const s = o.settlement;
      if (o.status === 'recovery_verifying') {
        return authority
          ? { text: 'Il controllo del deposito o del rimborso è in corso.', action: 'recover', label: 'Verifica il recupero' }
          : { text: 'L’ente sta verificando il recupero.' };
      }
      if (o.pendingStep && o.pendingStep !== 'vault_payout_signatures') {
        return { text: 'La rete sta verificando l’ultima operazione.', action: 'reconcile', label: 'Verifica transazione' };
      }
      if (o.status === 'awaiting_authority') {
        if (!checkoutOpen) return {
          text: authority ? 'Il termine è scaduto. Chiudi la richiesta per liberare la risorsa.' : 'Il termine è scaduto. L’ente deve chiudere la richiesta.',
          ...(authority && { action: 'reject', label: 'Chiudi richiesta' }),
        };
        return authority
          ? { text: 'Controlla periodo e importi prima di emettere il pass.', action: 'approve', label: 'Approva ed emetti pass', reject: true }
          : { text: 'La richiesta è in attesa della decisione di ' + o.authorityName + '.' };
      }
      if (o.status === 'rejected') {
        const current = findListing(o.listingId)?.latestRevision;
        const resource = state.resources.find((item) => item.resourceId === o.resourceId);
        return who === 'alice' && current?.revision === o.revision && Date.parse(resource?.validTo) > now()
          ? { action: 'relist', label: 'Proponi un nuovo prezzo' }
          : { text: 'Alice può pubblicare una nuova proposta.' };
      }
      if (o.status === 'approved_offer_pending' || o.status === 'deposit_verifying') {
        return { text: 'La rete sta verificando l’ultima operazione.', action: 'reconcile', label: 'Verifica transazione' };
      }
      if (o.status === 'approved_offer_ready' || o.status === 'pass_delivered_unfunded') {
        const offer = o.status === 'approved_offer_ready';
        if (!checkoutOpen) return authority
          ? { text: 'Il termine è scaduto senza un deposito confermato.', action: 'recover', label: 'Recupera ordine' }
          : { text: 'Il termine è scaduto. L’ente può recuperare l’ordine.' };
        const amount = offer ? o.feeDrops : o.netDrops;
        return who === 'bob'
          ? { text: 'Termine: ' + dateLabel(o.fundBy) + ' (ora di Torino).',
              action: offer ? 'accept-pass' : 'deposit', label: (offer ? 'Ritira pass · ' : 'Versa deposito · ') + xrp(amount) }
          : { text: offer ? 'Bob può ritirare il pass.' : 'Bob deve ancora versare il deposito.' };
      }
      if (o.status === 'confirmed') return { text: 'Bob potrà usare la risorsa dall’inizio del periodo.' };
      if (o.status === 'active') return { text: 'Il periodo è riservato a Bob fino alla scadenza.' };
      if (o.status === 'expired') {
        if (s.payoutPhase === 'validated') return { text: xrp(o.receipts.payoutDeliveredDrops || o.netDrops) + ' liquidati.' };
        if (s.payoutPhase === 'awaiting_ledger') return { text: 'Il pagamento è in verifica.', action: 'reconcile', label: 'Verifica transazione' };
        if (s.payoutPhase === 'awaiting_signatures') {
          const beneficiary = s.beneficiary === o.bob ? 'a Bob' : 'ad Alice';
          const text = s.collectedSigners.length + ' di 2 firme raccolte per versare ' + xrp(o.netDrops) + ' ' + beneficiary + '.';
          const canSign = s.allowedSigners.includes(state.session.address) && !s.collectedSigners.includes(state.session.address);
          return canSign ? { text, action: 'sign', label: 'Firma la liquidazione' } : { text };
        }
        if (s.escrowState === 'releasable') {
          return { text: 'Il deposito può essere trasferito al vault.', action: 'release', label: 'Sblocca deposito' };
        }
        if (s.escrowState === 'credited_to_vault') {
          return { text: 'Il saldo è nel vault e richiede due firme.',
            action: 'prepare', label: 'Prepara liquidazione', arbitration: authority };
        }
        if (s.escrowState === 'unavailable') return { text: 'La rete non è disponibile per verificare il saldo.' };
        return { text: 'In attesa che il ledger renda disponibile il saldo.' };
      }
      if (o.status === 'revoked_refunded') return { text: xrp(o.feeDrops) + ' rimborsati a Bob.' };
      if (o.status === 'settled') return { text: xrp(o.receipts.payoutDeliveredDrops || o.netDrops) + ' liquidati.' };
      return {};
    }

    function orderCard(o, who) {
      const labels = {
        awaiting_authority: 'In attesa dell’ente', rejected: 'Richiesta rifiutata',
        approved_offer_pending: 'Emissione in verifica', approved_offer_ready: 'Pass disponibile',
        pass_delivered_unfunded: 'Deposito da versare', deposit_verifying: 'Deposito in verifica',
        confirmed: 'Prenotazione confermata', active: 'Affitto in corso', expired: 'Affitto terminato',
        recovery_verifying: 'Recupero in verifica', revoked_refunded: 'Rimborsato',
        revoked_unpaid: 'Offerta scaduta', settled: 'Liquidato',
      };
      const tone = o.status === 'rejected' ? ' error' : o.vaultHeld && o.status !== 'active' ? ' waiting' : !o.vaultHeld ? ' closed' : '';
      const next = nextStep(o, who);
      const rows = [
        ['Accordo', o.agreementHash], ['NFT del pass', o.receipts.passNftId], ['Offerta', o.receipts.offerId],
        ['Emissione', o.receipts.mintTxHash], ['Consegna del pass', o.receipts.acceptOfferHash],
        ['Deposito', o.receipts.createHash], ['Sblocco', o.receipts.releaseTxHash],
        ['Liquidazione', o.receipts.payoutTxHash], ['Revoca', o.receipts.burnTxHash], ['Rimborso', o.receipts.refundTxHash],
      ];
      return '<article class="panel stack">' +
        '<div class="panel-title"><h2>' + (who === 'alice' ? 'Richiesta di Bob' : 'Affitto') +
        '</h2><span class="status' + tone + '">' + html(labels[o.status] || o.statusLabel) + '</span></div>' +
        period(o) + (['awaiting_authority', 'approved_offer_ready', 'pass_delivered_unfunded'].includes(o.status) ? amounts(o) : '') +
        (o.rejectionReason ? '<p class="inline-error">' + html(o.rejectionReason) + '</p>' : '') +
        (next.text || next.action ? '<div class="next">' +
          (next.text ? '<p>' + html(next.text) + '</p>' : '') +
          (next.action ? '<div class="row">' + button(next.action, next.label, o.orderId) +
            (next.reject ? button('reject', 'Rifiuta', o.orderId, 'secondary danger') : '') + '</div>' : '') + '</div>' : '') +
        (next.arbitration ? '<details class="tools"' + detailAttr('arbitration:' + o.orderId) +
          'Arbitrato</summary><div class="row">' +
          button('arbitration', 'Prepara rimborso a Bob', o.orderId, 'secondary', 'arbitration_bob') +
          button('arbitration', 'Prepara pagamento ad Alice', o.orderId, 'secondary', 'arbitration_alice') +
          '</div></details>' : '') +
        '<details class="tools"' + detailAttr('receipts:' + o.orderId) + 'Ricevute XRPL</summary><dl class="receipts">' +
          rows.filter(([, value]) => value).map(([key, value]) => '<dt>' + html(key) + '</dt><dd>' + html(value) + '</dd>').join('') +
        '</dl></details></article>';
    }

    function listingCard(item, who) {
      const rev = item.latestRevision;
      return '<article class="panel stack"><div class="panel-title"><h2>Annuncio disponibile</h2></div>' +
        period(rev) + amounts(rev) +
        (who === 'bob' ? '<div class="row">' + button('accept-listing', 'Accetta proposta', item.listingId) + '</div>' : '') +
        '</article>';
    }

    function renderWorkspace(who, resourceId) {
      const isAuthority = state.session.role === 'authority';
      const resource = state.resources.find((item) => item.resourceId === resourceId);
      const access = state.access?.resourceId === resourceId ? state.access : null;
      $('resource-picker').hidden = isAuthority;
      for (const tab of $('resource-picker').querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab.dataset.id === resourceId));
      $('resource-name').textContent = resourceId === 'cad' ? 'Posto CAD' : 'Cartellone digitale';
      const subtitle = $('resource-subtitle');
      subtitle.textContent = resource?.displayName.split(' · ').at(-1) || '';
      subtitle.hidden = !subtitle.textContent;
      const link = $('service-link');
      link.hidden = isAuthority;
      link.href = resourceId === 'cad' ? '/cad' : '/schermo/torino-01';
      link.textContent = resourceId === 'cad' ? 'Portale CAD' : 'Apri schermo';
      link.target = resourceId === 'cad' ? '_self' : '_blank';
      link.rel = 'noopener';
      const orders = actorOrders();
      const open = orders.filter((o) => o.vaultHeld);
      const closed = orders.filter((o) => !o.vaultHeld);
      const rejected = who === 'alice' ? closed.find((o) => o.status === 'rejected'
        && findListing(o.listingId)?.latestRevision.revision === o.revision) : null;
      const reserved = state.orders.some((o) => o.vaultHeld);
      const listings = reserved || isAuthority ? [] : state.listings.filter((item) =>
        item.resourceId === resourceId && item.status === 'open' && item.latestRevision.status === 'active'
        && Date.parse(item.latestRevision.startsAt) > now());
      const featured = [...open, ...(rejected ? [rejected] : [])];
      if (!featured.length && !listings.length && closed.length) featured.push(closed[0]);
      const repeated = who === 'bob' && featured.length && ['WAIT_AUTHORITY', 'PASS_DELIVERED_NO_DEPOSIT',
        'CONFIRMED_BEFORE_START', 'BOB_ACTIVE', 'RENTAL_EXPIRED'].includes(access?.code);
      setHtml($('access-state'), isAuthority || repeated ? '' : access
        ? '<span class="status' + (access.canAccess ? '' : ' waiting') + '">' + html(access.headline) + '</span>'
        : '<span class="muted small">Verifica dell’accesso…</span>');
      $('access-state').hidden = isAuthority || repeated;
      const archive = closed.filter((o) => !featured.includes(o));
      const canPublish = who === 'alice' && Date.parse(resource?.validTo) > now();
      const publish = canPublish && !reserved && !rejected
        ? button('new-listing', 'Pubblica annuncio', '', listings.length || featured.length ? 'secondary' : '')
        : '';
      const empty = isAuthority ? 'Nessuna richiesta da valutare.' : reserved ? 'La risorsa ha già una richiesta in corso.'
        : who === 'bob' ? 'Nessun annuncio disponibile per questa risorsa.' : canPublish ? '' : 'La licenza è scaduta.';
      setHtml($('work-cards'), featured.map((o) => orderCard(o, who)).join('') +
        listings.map((item) => listingCard(item, who)).join('') +
        (!featured.length && !listings.length && empty ? '<p class="panel empty">' + html(empty) + '</p>' : '') +
        (publish ? '<div class="row">' + publish + '</div>' : '') +
        (archive.length ? '<details class="tools"' + detailAttr('history:' + resourceId + ':' + who) +
          'Ordini precedenti</summary><div class="stack">' + archive.map((o) => orderCard(o, who)).join('') + '</div></details>' : ''));

      const upload = $('billboard-upload');
      const showUpload = !isAuthority && resourceId === 'torino-01' && access?.canAccess;
      if (!showUpload && !upload.hidden) $('upload-form').reset();
      upload.hidden = !showUpload;
      $('demo-image').hidden = state.sim.mode !== 'simulated';
    }

    function demoMilestone() {
      const order = actorOrders().find((item) => item.vaultHeld);
      if (!order) return '';
      if (order.status === 'active') return button('time', 'Vai alla fine dell’affitto', order.endsAt, 'secondary');
      if (order.status === 'confirmed') return button('time', 'Vai all’inizio dell’affitto', order.startsAt, 'secondary');
      if (now() < Date.parse(order.fundBy)) {
        return button('time', 'Supera il termine per il deposito', order.fundBy, 'secondary');
      }
      return '';
    }

    function render() {
      const who = role();
      const choosing = !who || state.choosing;
      $('mode').hidden = !state.sim;
      $('mode').textContent = state.sim?.mode === 'testnet' ? 'Testnet XRPL' : 'Simulazione';
      $('actor').hidden = !who;
      $('actor').textContent = labels[who] || '';
      $('change-role').hidden = !who || choosing;
      $('role-options').hidden = !who || !choosing;
      $('login').hidden = !choosing;
      $('workspace').hidden = choosing;
      if (!choosing) renderWorkspace(who, selectedResource());

      const milestone = !choosing && state.sim?.mode === 'simulated' ? demoMilestone() : '';
      $('demo-controls').hidden = choosing || state.sim?.mode !== 'simulated' || (who === 'comune' && !milestone);
      if (!$('demo-controls').hidden) {
        $('demo-clock').textContent = 'Ora simulata: ' + dateLabel(state.sim.nowUtc);
        $('preset-form').hidden = who === 'comune';
        $('demo-time').hidden = !milestone;
        setHtml($('demo-time'), milestone);
        const options = state.sim.presets.map((p) => '<option value="' + html(p.id) + '">' +
          html(p.label.replace(/^[0-9]+ · /, '')) + '</option>').join('');
        if (markupCache.get($('preset')) !== options || $('preset').dataset.active !== state.sim.activePreset) {
          setHtml($('preset'), options);
          $('preset').value = state.sim.activePreset;
          $('preset').dataset.active = state.sim.activePreset;
        }
      } else $('demo-controls').open = false;
    }

    async function refresh() {
      const version = ++state.version;
      const [session, sim, resources] = await Promise.all([
        api('/api/wallet/session'), api('/api/simulazione/stato'), api('/api/risorse'),
      ]);
      if (version !== state.version) return;
      state.session = session;
      state.sim = sim;
      state.resources = resources;
      const who = role();
      if (!who || state.choosing) {
        render();
        return;
      }
      const id = selectedResource();
      const [orders, listings, access] = await Promise.all([
        api('/api/ordini?resourceId=' + encodeURIComponent(id)),
        session.role === 'authority' ? [] : api('/api/annunci'),
        session.role === 'authority' ? null : fetch('/api/risorse/' + encodeURIComponent(id) + '/accesso').then((res) => res.json()),
      ]);
      if (version !== state.version) return;
      state.orders = orders;
      state.listings = listings;
      state.access = access?.headline ? access : null;
      render();
    }

    function selectResource(id) {
      if (!resourceIds.includes(id) || state.selected === id) return;
      state.selected = id;
      const url = new URL(location.href);
      url.searchParams.set('risorsa', id);
      history.replaceState(null, '', url);
      state.orders = [];
      state.listings = [];
      state.access = null;
      $('billboard-upload').hidden = true;
      setHtml($('work-cards'), '<p class="muted">Caricamento…</p>');
      $('resource-name').textContent = id === 'cad' ? 'Posto CAD' : 'Cartellone digitale';
      $('resource-subtitle').hidden = true;
      $('service-link').hidden = true;
      setHtml($('access-state'), '');
      for (const tab of $('resource-picker').querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab.dataset.id === id));
    }

    async function runAction(control, action, opts = {}) {
      if (state.busy) return;
      state.busy = true;
      state.version++;
      if (control) control.disabled = true;
      if (opts.errorId) inlineError(opts.errorId, '');
      notice('Operazione in corso…');
      try {
        const result = await action();
        const view = result?.order || result;
        await refresh();
        const waiting = view?.pendingStep && view.pendingStep !== 'vault_payout_signatures';
        notice(waiting ? 'Operazione inviata. La rete la sta verificando.' : opts.message || '');
        if (opts.focus) $(opts.focus).focus();
      } catch (error) {
        if (opts.errorId) {
          notice('');
          inlineError(opts.errorId, error.message);
        } else notice(error.message, true);
      } finally {
        if (control) control.disabled = false;
        state.busy = false;
      }
    }

    async function loginAs(who) {
      const { challenge } = await post('/api/wallet/challenge');
      const { id, proof } = await post('/api/local-signer/login', { challenge, role: who });
      await post('/api/wallet/session', { id, proof });
      state.choosing = false;
      state.orders = [];
      state.access = null;
      $('upload-form').reset();
    }

    function updateSplit() {
      try {
        const gross = dropsFromPrice($('price').value);
        const fee = gross * BigInt(listingDraft.resource.feeBps) / 10000n;
        if (fee <= 0n || fee >= gross) throw new Error('Inserisci un prezzo sufficiente per coprire la commissione.');
        $('split').textContent = xrp(fee) + ' all’ente · ' + xrp(gross - fee) + ' ad Alice';
        return gross.toString();
      } catch (error) {
        $('split').textContent = error.message;
        return null;
      }
    }

    function showListing(order) {
      const resource = state.resources.find((item) => item.resourceId === selectedResource());
      if (!resource) return;
      listingDraft = { resource, listingId: order?.listingId };
      $('listing-title').textContent = order ? 'Proponi un nuovo prezzo' : 'Nuovo annuncio';
      $('price').value = order ? xrp(order.priceDrops).replace(' XRP', '').replaceAll('.', '') : '10';
      const base = now();
      const lead = state.sim?.mode === 'simulated' ? 60 : 180;
      const sameDates = order && Date.parse(order.startsAt) > base;
      $('starts').value = inputDate(sameDates ? order.startsAt : base + lead * 1000);
      $('ends').value = inputDate(sameDates ? order.endsAt : base + (lead + 120) * 1000);
      inlineError('listing-error', '');
      updateSplit();
      $('listing-dialog').showModal();
    }

    async function submitListing() {
      const priceDrops = updateSplit();
      if (!priceDrops) throw new Error($('split').textContent);
      const startsAt = utcDate($('starts').value);
      const endsAt = utcDate($('ends').value);
      if (Date.parse(startsAt) <= now() || startsAt >= endsAt) throw new Error('Scegli un periodo futuro con fine successiva all’inizio.');
      const signed = await post('/api/local-signer/proposal', {
        resourceId: listingDraft.resource.resourceId, listingId: listingDraft.listingId, startsAt, endsAt, priceDrops,
      });
      await post('/api/annunci', signed);
      $('listing-dialog').close();
    }

    async function acceptListing(id) {
      const listing = findListing(id);
      if (!listing) throw new Error('L’annuncio non è più disponibile.');
      const acceptance = await post('/api/local-signer/order', { listingId: id, revision: listing.latestRevision.revision });
      return post('/api/annunci/' + encodeURIComponent(id) + '/ordini', { acceptance });
    }

    async function signSettlement(o) {
      const signature = await post('/api/local-signer/vault-signature', { orderId: o.orderId, role: role() });
      return post(orderPath(o.orderId, 'liquidazione'), {
        action: 'sign', mode: o.settlement.resolutionMode, partialTxBlob: signature.tx_blob,
      });
    }

    async function uploadImage(image) {
      await api('/api/cartelloni/torino-01/immagine', {
        method: 'POST', headers: { 'content-type': image.type || 'application/octet-stream' }, body: image,
      });
      $('upload-form').reset();
    }

    async function sampleImage() {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0b332d';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#b5f3d8';
      ctx.fillRect(56, 100, 64, 8);
      ctx.font = '600 52px system-ui';
      ctx.fillText('Campagna di Bob', 56, 206);
      ctx.font = '22px system-ui';
      ctx.fillText('Cartellone digitale · Torino', 56, 256);
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!image) throw new Error('Immagine di esempio non disponibile.');
      await uploadImage(image);
    }

    const orderActions = {
      approve: ['decisione', { decision: 'approve' }],
      'accept-pass': ['pass/accetta', {}],
      deposit: ['deposito', {}],
      release: ['sblocco', {}],
      prepare: ['liquidazione', { action: 'prepare', mode: 'ordinary' }],
      recover: ['recupero', {}],
      reconcile: ['riconcilia', {}],
    };

    document.addEventListener('click', (event) => {
      const control = event.target.closest('button');
      if (!control || state.busy) return;
      if (control.dataset.close) return $(control.dataset.close).close();
      const { action, id, choice } = control.dataset;
      if (action === 'login') return runAction(control, () => loginAs(control.dataset.role), { focus: 'resource-name' });
      if (action === 'resource') {
        if (state.selected !== id) {
          selectResource(id);
          return runAction(null, async () => {});
        }
        return;
      }
      if (action === 'new-listing') return showListing();
      if (action === 'accept-listing') return runAction(control, () => acceptListing(id));
      if (action === 'time') return runAction(control, () => post('/api/simulazione/tempo', {
        seconds: Math.max(1, Math.ceil((Date.parse(id) - now()) / 1000) + 1),
      }));
      if (action === 'demo-image') return runAction(control, sampleImage, { message: 'Immagine pubblicata sul cartellone.' });
      if (!id) return;
      const order = findOrder(id);
      if (!order) return;
      if (action === 'relist') return showListing(order);
      if (action === 'reject') {
        rejectionId = order.orderId;
        $('reject-reason').value = now() >= Date.parse(order.fundBy) ? 'Termine per il deposito scaduto.' : '';
        inlineError('reject-error', '');
        return $('reject-dialog').showModal();
      }
      if (action === 'sign') return runAction(control, () => signSettlement(order));
      if (action === 'arbitration') return runAction(control,
        () => post(orderPath(id, 'liquidazione'), { action: 'prepare', mode: choice }));
      if (Object.hasOwn(orderActions, action)) {
        const [route, body] = orderActions[action];
        return runAction(control, () => post(orderPath(id, route), body));
      }
    });
    $('change-role').addEventListener('click', () => {
      if (state.busy) return;
      state.choosing = true;
      state.version++;
      notice('');
      render();
      $('login-title').focus();
    });
    $('keep-role').addEventListener('click', () => {
      if (state.busy) return;
      state.choosing = false;
      void runAction(null, async () => {}, { focus: 'resource-name' });
    });
    $('logout').addEventListener('click', (event) => {
      void runAction(event.currentTarget, async () => {
        await api('/api/wallet/session', { method: 'DELETE' });
        state.choosing = false;
        state.orders = [];
        state.access = null;
        $('upload-form').reset();
      }, { focus: 'login-title' });
    });
    $('price').addEventListener('input', updateSplit);
    $('listing-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction(event.submitter, submitListing, { errorId: 'listing-error', message: 'Annuncio pubblicato.' });
    });
    $('reject-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction(event.submitter, async () => {
        const reason = $('reject-reason').value.trim();
        if (!reason) throw new Error('Inserisci il motivo del rifiuto.');
        const response = await post(orderPath(rejectionId, 'decisione'), { decision: 'reject', reason });
        $('reject-dialog').close();
        return response;
      }, { errorId: 'reject-error' });
    });
    $('upload-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const file = $('billboard-file').files?.[0];
      if (file) void runAction(event.submitter, () => uploadImage(file), { message: 'Immagine pubblicata sul cartellone.' });
    });
    $('preset-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (state.busy || !confirm('Caricare lo scenario e sostituire annunci e ordini della simulazione?')) return;
      const preset = $('preset').value;
      void runAction(event.submitter, async () => {
        await post('/api/simulazione/preset', { preset });
        selectResource('cad');
      }, { message: 'Scenario caricato.' });
    });

    async function poll() {
      try {
        if (!state.busy) await refresh();
      } catch (error) {
        if (!state.busy) notice(error.message, true);
      } finally {
        pollId = setTimeout(poll, 2000);
      }
    }
    window.addEventListener('pagehide', () => clearTimeout(pollId));
    void runAction(null, async () => {}).then(() => { pollId = setTimeout(poll, 2000); });
  </script>
</body>
</html>`
}
