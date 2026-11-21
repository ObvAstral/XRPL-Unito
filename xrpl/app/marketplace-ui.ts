import { marketplaceStyles } from './marketplace-theme.js'

export function renderMarketplaceHtml(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XRPL Rentals · Deep Tech Marketplace</title>
  <style>${marketplaceStyles}</style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="bar">
    <div class="bar-content">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24">
            <circle cx="6" cy="6" r="2.5"/>
            <circle cx="18" cy="6" r="2.5"/>
            <circle cx="12" cy="18" r="2.5"/>
            <path d="M8.2 7.2L10.8 15.8M15.8 7.2L13.2 15.8M8.5 6H15.5"/>
          </svg>
        </span>
        <span class="brand-meta">
          <span>XRPL Rentals</span>
          <span class="brand-tag">Ledger Rights &amp; Vault Protocol</span>
        </span>
      </a>
      <div class="identity">
        <span class="mode" id="mode" hidden></span>
        <strong class="actor-pill small" id="actor" hidden></strong>
        <button class="secondary quiet small" id="change-role" type="button" hidden>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
          Switch role
        </button>
      </div>
    </div>
  </header>

  <main id="main" tabindex="-1">
    <p class="notice" id="feedback" role="status">Initializing XRPL telemetry…</p>

    <section id="login" class="hero" hidden aria-labelledby="login-title">
      <div class="login-intro">
        <div class="stack">
          <span class="eyebrow-badge">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
            XRPL Neural Ledger · Protocol v2
          </span>
          <h1 id="login-title" tabindex="-1">Choose your role</h1>
          <p>Each role controls a demo cryptographic wallet to negotiate, authorize, and settle temporary usage rights on a CAD seat or a digital billboard.</p>
        </div>

        <div class="neural-stage" aria-hidden="true">
          <div class="neural-stage-head">
            <span>ON-LEDGER ACCOUNTING &amp; RIGHTS TOPOLOGY</span>
            <span>2-OF-3 MULTISIG VAULT</span>
          </div>
          <svg class="neural-svg" viewBox="0 0 520 175" role="presentation">
            <defs>
              <linearGradient id="edgeGradGreen" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#76B900" stop-opacity="0.25"/>
                <stop offset="50%" stop-color="#6EFA5F" stop-opacity="0.95"/>
                <stop offset="100%" stop-color="#00BFFF" stop-opacity="0.35"/>
              </linearGradient>
              <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
              </filter>
            </defs>
            <!-- Neural Edges -->
            <g stroke="url(#edgeGradGreen)" stroke-width="1.6" fill="none" stroke-dasharray="5 4">
              <path d="M80 48 L255 38"/>
              <path d="M80 48 L255 135"/>
              <path d="M255 38 L435 86"/>
              <path d="M255 135 L435 86"/>
              <path d="M255 38 L255 135"/>
            </g>
            <!-- Data Flow Pulses -->
            <circle cx="168" cy="43" r="3.5" fill="#6EFA5F" filter="url(#glowGreen)"/>
            <circle cx="345" cy="62" r="3.5" fill="#76B900" filter="url(#glowGreen)"/>
            <circle cx="345" cy="110" r="3.5" fill="#00BFFF" filter="url(#glowGreen)"/>
            <!-- Node 1: Alice -->
            <g transform="translate(22, 24)">
              <rect width="116" height="48" rx="6" fill="#1A1A1A" stroke="#76B900" stroke-width="1.4"/>
              <circle cx="16" cy="24" r="4.5" fill="#76B900"/>
              <text x="28" y="21" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="11" font-weight="700">ALICE</text>
              <text x="28" y="36" fill="#BDBDBD" font-family="Roboto Mono, monospace" font-size="9">Title NFT</text>
            </g>
            <!-- Node 2: Oracle Authority -->
            <g transform="translate(192, 14)">
              <rect width="130" height="48" rx="6" fill="#1A1A1A" stroke="#6EFA5F" stroke-width="1.4"/>
              <circle cx="16" cy="24" r="4.5" fill="#6EFA5F"/>
              <text x="28" y="21" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="11" font-weight="700">ORACLE AUTHORITY</text>
              <text x="28" y="36" fill="#6EFA5F" font-family="Roboto Mono, monospace" font-size="9">Veto &amp; Mint Pass</text>
            </g>
            <!-- Node 3: Escrow & Vault -->
            <g transform="translate(192, 112)">
              <rect width="130" height="48" rx="6" fill="#1A1A1A" stroke="#00BFFF" stroke-width="1.4"/>
              <circle cx="16" cy="24" r="4.5" fill="#00BFFF"/>
              <text x="28" y="21" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="11" font-weight="700">2-OF-3 VAULT</text>
              <text x="28" y="36" fill="#00BFFF" font-family="Roboto Mono, monospace" font-size="9">90% Net Escrow</text>
            </g>
            <!-- Node 4: Bob -->
            <g transform="translate(382, 62)">
              <rect width="116" height="48" rx="6" fill="#1A1A1A" stroke="#76B900" stroke-width="1.4"/>
              <circle cx="16" cy="24" r="4.5" fill="#6EFA5F"/>
              <text x="28" y="21" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="11" font-weight="700">BOB</text>
              <text x="28" y="36" fill="#BDBDBD" font-family="Roboto Mono, monospace" font-size="9">Temporary Pass</text>
            </g>
          </svg>
        </div>
      </div>

      <div class="hero-right">
        <div class="role-grid">
          <button class="role-tile" type="button" data-action="login" data-role="alice">
            <div class="role-tile-head">
              <span class="role-icon" aria-hidden="true">
                <svg class="icon" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </span>
              <span class="role-badge">Holder</span>
            </div>
            <strong>Alice</strong>
            <small>Publish a signed listing, suspend your usage during the active period, and collect the net payout from the vault.</small>
          </button>

          <button class="role-tile" type="button" data-action="login" data-role="bob">
            <div class="role-tile-head">
              <span class="role-icon" aria-hidden="true">
                <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <span class="role-badge">Renter</span>
            </div>
            <strong>Bob</strong>
            <small>Pick a listing, claim the NFT pass from the authority, deposit the escrow, and use the resource.</small>
          </button>

          <button class="role-tile" type="button" data-action="login" data-role="cad">
            <div class="role-tile-head">
              <span class="role-icon" aria-hidden="true">
                <svg class="icon" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>
              </span>
              <span class="role-badge">Authorizing authority</span>
            </div>
            <strong>CAD Provider</strong>
            <small>Review requests for the CAD seat, mint the NFT pass, and co-sign the CAD vault.</small>
          </button>

          <button class="role-tile" type="button" data-action="login" data-role="comune">
            <div class="role-tile-head">
              <span class="role-icon" aria-hidden="true">
                <svg class="icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </span>
              <span class="role-badge">Authorizing authority</span>
            </div>
            <strong>Municipality of Turin</strong>
            <small>Authorize display on billboard torino-01, collect the fee, and oversee the vault.</small>
          </button>
        </div>

        <div class="row" id="role-options" hidden>
          <button class="secondary" id="keep-role" type="button">Back to current role</button>
          <button class="secondary quiet" id="logout" type="button">Disconnect</button>
        </div>
      </div>

      <div class="zigzag-features" aria-label="Architecture of the two demo scenarios">
        <div class="zigzag-row">
          <div>
            <strong class="small" style="color: var(--primary);">01 · CAD SOFTWARE LICENSE</strong>
            <p class="small muted">Alice keeps the annual NFT in her wallet while temporarily delegating the seat to Bob. The CAD portal verifies NFT, escrow, and time window live on the ledger.</p>
          </div>
          <div class="zigzag-visual">
            <span>10 XRP DEMO SPLIT</span>
            <strong>1 XRP Fee · 9 XRP Vault</strong>
          </div>
        </div>
        <div class="zigzag-row reverse">
          <div class="zigzag-visual" style="color: var(--electric);">
            <span>TORINO-01 SCREEN</span>
            <strong>PNG / JPEG Live Screen</strong>
          </div>
          <div>
            <strong class="small" style="color: var(--electric);">02 · DIGITAL ADVERTISING BILLBOARD</strong>
            <p class="small muted">The Municipality of Turin approves the agreement and mints the NFT pass. Only during the active rental can Bob broadcast an image to the public screen.</p>
          </div>
        </div>
      </div>
    </section>

    <div id="workspace" class="workspace" hidden>
      <div id="resource-picker" class="resource-tabs" role="group" aria-label="Choose resource">
        <button type="button" data-action="resource" data-id="cad" aria-pressed="true">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
          CAD Seat
        </button>
        <button type="button" data-action="resource" data-id="torino-01" aria-pressed="false">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          Advertising Billboard
        </button>
      </div>

      <section class="stack" aria-labelledby="resource-name">
        <div class="resource-head">
          <div>
            <span class="eyebrow-badge" id="resource-badge">ON-LEDGER RESOURCE</span>
            <h1 id="resource-name" tabindex="-1"></h1>
            <p id="resource-subtitle" hidden></p>
          </div>
          <a id="service-link" class="button secondary" hidden></a>
        </div>
        <div id="access-state" class="access-line" aria-live="polite"></div>
      </section>

      <section class="workspace-main stack" aria-labelledby="work-title">
        <div class="workspace-heading">
          <h2 id="work-title" tabindex="-1"></h2>
        </div>
        <div id="work-cards" class="stack"></div>

        <section id="billboard-upload" class="panel stack" hidden aria-labelledby="upload-title">
          <div class="panel-title">
            <h3 id="upload-title">Publish to billboard</h3>
            <span class="status">Authorized channel</span>
          </div>
          <form id="upload-form" class="stack">
            <label>Image <small>Node-verified PNG or JPEG format</small>
              <input id="billboard-file" type="file" accept="image/png,image/jpeg" required>
            </label>
            <div class="row">
              <button type="submit">Publish image</button>
              <button type="button" class="secondary" data-action="demo-image" id="demo-image" hidden>Use a sample image</button>
            </div>
          </form>
        </section>
      </section>

      <section id="funds" class="funds-panel" hidden aria-labelledby="funds-title">
        <div class="funds-heading">
          <h2 id="funds-title">XRP Movements</h2>
          <span id="funds-ledger" class="funds-ledger" hidden></span>
        </div>
        <div class="funds-grid" id="funds-grid"></div>
        <p id="funds-note" class="funds-note" hidden></p>
      </section>
    </div>

    <details id="demo-controls" class="tools" hidden>
      <summary>
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Simulation controls
      </summary>
      <div class="stack">
        <p id="demo-clock" class="small muted"></p>
        <form id="preset-form" class="sim-row">
          <label>CAD Scenario <select id="preset"></select></label>
          <button type="submit" class="secondary">Load scenario</button>
        </form>
        <div id="demo-time"></div>
      </div>
    </details>
  </main>

  <dialog id="listing-dialog" aria-labelledby="listing-title">
    <form id="listing-form" class="stack">
      <h2 id="listing-title">New listing</h2>
      <label>Total price in XRP <input id="price" type="text" inputmode="decimal" value="10" required></label>
      <p id="split" class="small muted" aria-live="polite"></p>
      <div class="date-fields">
        <label>Start <input id="starts" type="datetime-local" step="1" required></label>
        <label>End <input id="ends" type="datetime-local" step="1" required></label>
      </div>
      <p class="small muted">Turin time. The deposit must be completed before the start time.</p>
      <p id="listing-error" class="inline-error" role="alert" hidden></p>
      <div class="row">
        <button type="submit">Sign and publish</button>
        <button class="secondary" type="button" data-close="listing-dialog">Cancel</button>
      </div>
    </form>
  </dialog>

  <dialog id="reject-dialog" aria-labelledby="reject-title">
    <form id="reject-form" class="stack">
      <h2 id="reject-title">Reject request</h2>
      <label>Reason for Alice and Bob <textarea id="reject-reason" rows="3" required></textarea></label>
      <p id="reject-error" class="inline-error" role="alert" hidden></p>
      <div class="row">
        <button type="submit">Confirm rejection</button>
        <button class="secondary" type="button" data-close="reject-dialog">Cancel</button>
      </div>
    </form>
  </dialog>

  <script>
    const $ = (id) => document.getElementById(id);
    const labels = { alice: 'Alice', bob: 'Bob', cad: 'CAD Provider', comune: 'Municipality of Turin' };
    const resourceIds = ['cad', 'torino-01'];
    const roleContext = {
      alice: { name: 'Holder', title: 'Listings and rentals' },
      bob: { name: 'Renter', title: 'Booking and rental' },
      cad: { name: 'Authorizing authority', title: 'Rental requests' },
      comune: { name: 'Authorizing authority', title: 'Rental requests' },
    };
    const rome = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const romeInput = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const state = {
      selected: new URL(location.href).searchParams.get('risorsa') === 'torino-01' ? 'torino-01' : 'cad',
      session: null, sim: null, resources: [], listings: [], orders: [], access: null, funds: null,
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
      if (!res.ok) throw new Error(data.message || 'Operation failed.');
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
      const whole = (amount / 1000000n).toLocaleString('en-US');
      const decimals = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
      return whole + (decimals ? '.' + decimals : '') + ' XRP';
    }
    function dropsFromPrice(value) {
      const parts = /^([0-9]{1,12})(?:[.,]([0-9]{1,6}))?$/.exec(value.trim());
      if (!parts) throw new Error('Enter a price in XRP with at most 6 decimal places.');
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
      const candidates = Number.isFinite(clock) ? [clock - 3600000, clock - 7200000].filter((ms) => inputDate(ms) === local) : [];
      if (candidates.length !== 1) throw new Error('Choose a unique and valid Turin time.');
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
      return '<div class="split-bar"><span>Authority fee <strong>' + html(xrp(item.feeDrops)) +
        '</strong></span><span>Security deposit <strong>' + html(xrp(item.netDrops)) + '</strong></span></div>';
    }
    function period(item) {
      return '<dl class="facts" aria-label="Period in Turin time and total price">' +
        fact('Start', dateLabel(item.startsAt)) +
        fact('End', dateLabel(item.endsAt)) +
        fact('Total', xrp(item.priceDrops)) + '</dl>';
    }

    function orderStepper(o) {
      const stageMap = {
        awaiting_authority: 2,
        rejected: -2,
        approved_offer_pending: 2,
        approved_offer_ready: 2,
        pass_delivered_unfunded: 3,
        deposit_verifying: 3,
        confirmed: 4,
        active: 4,
        expired: 5,
        recovery_verifying: -3,
        revoked_refunded: -3,
        revoked_unpaid: -2,
        settled: 6,
      };
      const stage = stageMap[o.status] || 1;
      const nodes = [
        [1, '01 · Agreement', 'A+B Sigs'],
        [2, '02 · Oracle', 'Veto & Pass'],
        [3, '03 · Escrow', '90% Locked'],
        [4, '04 · Usage', 'Active Access'],
        [5, '05 · 2/3 Vault', 'Settlement'],
      ];
      return '<div class="neural-stepper" aria-label="XRPL protocol status">' +
        nodes.map(([idx, title, sub]) => {
          let cls = 'step-node';
          if (stage < 0) {
            const failAt = Math.abs(stage);
            if (idx < failAt) cls += ' done';
            else if (idx === failAt) cls += ' failed';
          } else if (idx < stage) {
            cls += ' done';
          } else if (idx === stage) {
            cls += ' current';
          }
          return '<div class="' + cls + '"><strong>' + html(title) + '</strong><span>' + html(sub) + '</span></div>';
        }).join('') + '</div>';
    }

    function nextStep(o, who) {
      const authority = state.session.role === 'authority';
      const checkoutOpen = now() < Date.parse(o.fundBy);
      const s = o.settlement;
      const verifying = { heading: 'Awaiting network', text: 'XRPL is verifying the transaction.',
        action: 'reconcile', label: 'Verify transaction' };
      if (o.status === 'recovery_verifying') {
        return authority
          ? { text: 'Verify the pass revocation and any refund status.',
              action: 'recover', label: 'Verify recovery' }
          : { heading: 'Awaiting authority', text: 'The authority is verifying the pass revocation and any refund.' };
      }
      if (o.pendingStep && o.pendingStep !== 'vault_payout_signatures') return verifying;
      if (o.status === 'awaiting_authority') {
        if (!checkoutOpen) return {
          text: authority ? 'The deadline has passed. Close the request to free the resource.'
            : 'The deadline has passed. The authority must close the request.',
          ...(authority && { action: 'reject', label: 'Close request' }),
        };
        return authority
          ? { text: 'Review period and amounts. Approving issues the access pass to Bob.',
              action: 'approve', label: 'Approve and issue pass', reject: true }
          : { text: o.authorityName + ' must review the request. After approval, Bob can claim the pass.' };
      }
      if (o.status === 'rejected') {
        const current = findListing(o.listingId)?.latestRevision;
        const resource = state.resources.find((item) => item.resourceId === o.resourceId);
        return who === 'alice' && current?.revision === o.revision && Date.parse(resource?.validTo) > now()
          ? { text: 'You can edit the listing. Bob will need to accept the new proposal.',
              action: 'relist', label: 'Propose a new price' }
          : {};
      }
      if (o.status === 'approved_offer_pending' || o.status === 'deposit_verifying') return verifying;
      if (o.status === 'approved_offer_ready' || o.status === 'pass_delivered_unfunded') {
        const offer = o.status === 'approved_offer_ready';
        if (!checkoutOpen) return authority
          ? { text: 'The deadline has passed. Start recovery to close the order.',
              action: 'recover', label: 'Recover order' }
          : { text: 'The deadline has passed. The authority can start recovery.' };
        const deadline = 'Deposit deadline: ' + dateLabel(o.fundBy) + ' (Turin time).';
        return who === 'bob'
          ? { text: offer ? 'Claim the access pass by paying the authority fee.' : 'Make the deposit to confirm the booking.',
              deadline, action: offer ? 'accept-pass' : 'deposit',
              label: offer ? 'Claim pass · ' + xrp(o.feeDrops) : 'Deposit · ' + xrp(o.netDrops) }
          : { heading: 'Waiting for Bob', text: offer ? 'Bob must claim the pass and make the deposit.'
              : 'Bob has claimed the pass. The booking will be confirmed after the deposit.', deadline };
      }
      if (o.status === 'confirmed') return {
        text: who === 'bob' ? 'Come back at the start time to use the resource.' : 'Bob will be able to use the resource from the start time.',
      };
      if (o.status === 'active') return {
        text: who === 'bob' ? 'You can use the resource until the end time.' : 'The resource is reserved for Bob until the end time.',
      };
      if (o.status === 'expired') {
        if (s.payoutPhase === 'validated') return { text: xrp(o.receipts.payoutDeliveredDrops || o.netDrops) + ' settled.' };
        if (s.payoutPhase === 'awaiting_ledger') return verifying;
        if (s.payoutPhase === 'awaiting_signatures') {
          const beneficiary = s.beneficiary === o.bob ? 'to Bob' : 'to Alice';
          const hasSigned = s.collectedSigners.includes(state.session.address);
          const canSign = s.allowedSigners.includes(state.session.address) && !hasSigned;
          return {
            heading: hasSigned ? 'You have already signed' : canSign ? 'You can sign the settlement' : 'Awaiting signatures',
            text: 'Two signatures are required to pay ' + xrp(o.netDrops) + ' ' + beneficiary + '.',
            signatures: true,
            ...(canSign && { action: 'sign', label: 'Sign settlement' }),
          };
        }
        if (s.escrowState === 'releasable') {
          return { text: 'Transfer the deposit to the settlement account (vault).',
            action: 'release', label: 'Release deposit' };
        }
        if (s.escrowState === 'credited_to_vault') {
          return { text: 'Prepare the deposit payout to Alice. Two signatures will be needed next.',
            action: 'prepare', label: 'Prepare settlement', arbitration: authority };
        }
        if (s.escrowState === 'unavailable') return { text: 'Deposit verification on XRPL is temporarily unavailable.' };
        return { heading: 'Awaiting network', text: 'XRPL must make the deposit releasable.' };
      }
      if (o.status === 'revoked_refunded') return { text: xrp(o.feeDrops) + ' refunded to Bob.' };
      if (o.status === 'settled') return { text: xrp(o.receipts.payoutDeliveredDrops || o.netDrops) + ' settled.' };
      return {};
    }

    function signatures(o) {
      const { allowedSigners, collectedSigners } = o.settlement;
      const count = collectedSigners.length;
      const progress = count === 1 ? 'One of two signatures collected' : count + ' of two signatures collected';
      const signers = [[o.alice, 'Alice'], [o.bob, 'Bob'], [o.issuer, o.authorityName]]
        .filter(([address]) => allowedSigners.includes(address) || collectedSigners.includes(address));
      return '<div class="signature-status"><p>' + html(progress) + '</p>' +
        '<progress class="signature-meter" max="2" value="' + count + '" aria-label="Signatures collected for settlement"></progress>' +
        (signers.length ? '<ul>' + signers.map(([address, name]) => {
          const signed = collectedSigners.includes(address);
          return '<li class="' + (signed ? 'signed' : '') + '">' + html(name + ' · ' +
            (signed ? 'Signature collected' : 'Can sign')) + '</li>';
        }).join('') + '</ul>' : '') +
        '</div>';
    }

    function orderCard(o, who) {
      const labels = {
        awaiting_authority: 'Awaiting authority', rejected: 'Request rejected',
        approved_offer_pending: 'Issuance verifying', approved_offer_ready: 'Pass available',
        pass_delivered_unfunded: 'Deposit required', deposit_verifying: 'Verifying deposit',
        confirmed: 'Booking confirmed', active: 'Rental active', expired: 'Rental ended',
        recovery_verifying: 'Verifying recovery', revoked_refunded: 'Refunded',
        revoked_unpaid: 'Offer expired', settled: 'Settled',
      };
      const tone = o.status === 'rejected' ? ' error' : o.vaultHeld && o.status !== 'active' ? ' waiting' : !o.vaultHeld ? ' closed' : '';
      const next = nextStep(o, who);
      const rows = [
        ['Agreement', o.agreementHash], ['Pass NFT', o.receipts.passNftId], ['Offer', o.receipts.offerId],
        ['Mint', o.receipts.mintTxHash], ['Pass delivery', o.receipts.acceptOfferHash],
        ['Deposit', o.receipts.createHash], ['Release', o.receipts.releaseTxHash],
        ['Settlement', o.receipts.payoutTxHash], ['Revocation', o.receipts.burnTxHash], ['Refund', o.receipts.refundTxHash],
      ];
      const request = ['awaiting_authority', 'rejected'].includes(o.status);
      const title = request ? (who === 'bob' ? 'Your request' : 'Bob’s request')
        : who === 'bob' ? 'Your rental' : 'Bob’s rental';
      return '<article class="panel stack">' +
        '<div class="panel-title"><h3>' + html(title) +
        '</h3><span class="status' + tone + '">' + html(labels[o.status] || o.statusLabel) + '</span></div>' +
        orderStepper(o) +
        period(o) + (['awaiting_authority', 'approved_offer_ready', 'pass_delivered_unfunded'].includes(o.status) ? amounts(o) : '') +
        (o.rejectionReason ? '<p class="inline-error"><strong>Rejection reason:</strong> ' + html(o.rejectionReason) + '</p>' : '') +
        (next.text || next.action ? '<div class="next">' +
          (next.heading || next.action ? '<p class="next-label"><strong>' + html(next.heading || 'Next step') + '</strong></p>' : '') +
          (next.text ? '<p>' + html(next.text) + '</p>' : '') +
          (next.deadline ? '<p class="small muted">' + html(next.deadline) + '</p>' : '') +
          (next.signatures ? signatures(o) : '') +
          (next.action ? '<div class="row">' + button(next.action, next.label, o.orderId) +
            (next.reject ? button('reject', 'Reject', o.orderId, 'secondary danger') : '') + '</div>' : '') + '</div>' : '') +
        (next.arbitration ? '<details class="tools"' + detailAttr('arbitration:' + o.orderId) +
          'Arbitration options</summary><div class="row">' +
          button('arbitration', 'Prepare refund to Bob', o.orderId, 'secondary', 'arbitration_bob') +
          button('arbitration', 'Prepare payout to Alice', o.orderId, 'secondary', 'arbitration_alice') +
          '</div></details>' : '') +
        '<details class="tools"' + detailAttr('receipts:' + o.orderId) + 'XRPL receipts</summary><dl class="receipts">' +
          rows.filter(([, value]) => value).map(([key, value]) => '<dt>' + html(key) + '</dt><dd>' + html(value) + '</dd>').join('') +
        '</dl></details></article>';
    }

    function listingCard(item, who) {
      const rev = item.latestRevision;
      const title = who === 'alice' ? 'Published listing' : 'Available listing';
      return '<article class="panel stack"><div class="panel-title"><h3>' + title + '</h3><span class="status">Signed proposal</span></div>' +
        period(rev) + amounts(rev) +
        (who === 'bob' ? '<div class="next"><p>The request will be sent to the authority. You will pay when claiming the pass and making the deposit.</p>' +
          '<div class="row">' + button('accept-listing', 'Sign and submit request', item.listingId) + '</div></div>'
          : '<p class="muted">The listing is visible to Bob on the marketplace.</p>') +
        '</article>';
    }

    function fundsMetric(id, label, drops, caption) {
      return '<div class="funds-metric" data-account="' + id + '">' +
        '<span class="funds-label">' + html(label) + '</span>' +
        '<strong class="funds-amount">' + (drops == null ? '—' : html(xrp(drops))) + '</strong>' +
        '<small class="funds-caption">' + html(caption) + '</small></div>';
    }

    function renderFunds(resourceId) {
      const view = state.funds?.resourceId === resourceId ? state.funds : null;
      const accounts = view?.accounts;
      const escrow = view?.escrow;
      const caption = (account) => account ? xrp(account.spendableDrops) + ' available'
        : view ? 'Account inactive' : 'Balance unavailable';
      const captions = {
        not_created: 'No deposit', pending: 'Verifying deposit', locked: 'Deposit locked',
        releasable: 'Ready for release', credited_to_vault: 'Transferred to vault',
        missing: 'Deposit missing', mismatch: 'Deposit needs check', unavailable: 'Check unavailable',
      };
      setHtml($('funds-grid'),
        fundsMetric('bob', '01 · Bob’s balance', accounts?.bob?.balanceDrops, caption(accounts?.bob)) +
        fundsMetric('escrow', '02 · XRP in escrow', escrow?.lockedDrops, captions[escrow?.state] || 'Check unavailable') +
        fundsMetric('vault', '03 · Vault balance', accounts?.vault?.balanceDrops, caption(accounts?.vault)) +
        fundsMetric('alice', '04 · Alice’s balance', accounts?.alice?.balanceDrops, caption(accounts?.alice)));
      const ledger = $('funds-ledger');
      ledger.hidden = !view;
      ledger.textContent = view ? 'Validated ledger #' + view.ledgerIndex.toLocaleString('en-US') : '';
      const payout = view?.payout;
      const note = $('funds-note');
      note.textContent = !view ? 'Balances temporarily unavailable.'
        : payout ? xrp(payout.deliveredDrops) + (payout.beneficiary === 'alice' ? ' settled to Alice.' : ' settled to Bob.')
        : escrow?.creditedDrops ? xrp(escrow.creditedDrops) + ' from this rental credited to vault.' : '';
      note.hidden = !note.textContent;
      $('funds').hidden = false;
    }

    function renderWorkspace(who, resourceId) {
      const isAuthority = state.session.role === 'authority';
      const resource = state.resources.find((item) => item.resourceId === resourceId);
      const access = state.access?.resourceId === resourceId ? state.access : null;
      $('workspace').dataset.resource = resourceId;
      $('work-title').textContent = roleContext[who].title;
      $('resource-picker').hidden = isAuthority;
      for (const tab of $('resource-picker').querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab.dataset.id === resourceId));
      $('resource-badge').textContent = resourceId === 'cad' ? 'SOFTWARE LICENSE · XRPL NFT' : 'DIGITAL INSTALLATION · TORINO-01';
      $('resource-name').textContent = resourceId === 'cad' ? 'CAD Seat' : 'Advertising Billboard';
      const subtitle = $('resource-subtitle');
      subtitle.textContent = resource?.displayName.split(' · ').at(-1) || '';
      subtitle.hidden = !subtitle.textContent;
      const link = $('service-link');
      link.hidden = isAuthority;
      link.href = resourceId === 'cad' ? '/cad' : '/schermo/torino-01';
      link.textContent = resourceId === 'cad' ? 'CAD Portal' : 'Open screen';
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
        : '<span class="muted small">Verifying access…</span>');
      $('access-state').hidden = isAuthority || repeated;
      renderFunds(resourceId);
      const archive = closed.filter((o) => !featured.includes(o));
      const canPublish = who === 'alice' && Date.parse(resource?.validTo) > now();
      const publish = canPublish && !reserved && !rejected
        ? button('new-listing', 'Publish listing', '', listings.length || featured.length ? 'secondary' : '')
        : '';
      const empty = isAuthority ? 'No requests to review.' : reserved ? 'This resource already has a request in progress.'
        : who === 'bob' ? 'No listings available. You can submit a request once Alice publishes a listing.'
          : canPublish ? 'Publish a listing to propose a rental period to Bob.' : 'The license has expired.';
      const emptySvg = '<span class="empty-icon" aria-hidden="true"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>';
      setHtml($('work-cards'), featured.map((o) => orderCard(o, who)).join('') +
        listings.map((item) => listingCard(item, who)).join('') +
        (!featured.length && !listings.length && empty ? '<div class="empty-state">' + emptySvg + '<p>' + html(empty) + '</p>' +
          (publish ? '<div class="row">' + publish + '</div>' : '') + '</div>'
          : publish ? '<div class="row">' + publish + '</div>' : '') +
        (archive.length ? '<details class="tools"' + detailAttr('history:' + resourceId + ':' + who) +
          'Previous orders</summary><div class="stack">' + archive.map((o) => orderCard(o, who)).join('') + '</div></details>' : ''));

      const upload = $('billboard-upload');
      const showUpload = !isAuthority && resourceId === 'torino-01' && access?.canAccess;
      if (!showUpload && !upload.hidden) $('upload-form').reset();
      upload.hidden = !showUpload;
      $('demo-image').hidden = state.sim.mode !== 'simulated';
    }

    function demoMilestone() {
      const order = actorOrders().find((item) => item.vaultHeld);
      if (!order) return '';
      if (order.status === 'active') return button('time', 'Jump to rental end', order.endsAt, 'secondary');
      if (order.status === 'confirmed') return button('time', 'Jump to rental start', order.startsAt, 'secondary');
      if (now() < Date.parse(order.fundBy)) {
        return button('time', 'Advance past deposit deadline', order.fundBy, 'secondary');
      }
      return '';
    }

    function render() {
      const who = role();
      const choosing = !who || state.choosing;
      $('mode').hidden = !state.sim;
      $('mode').textContent = state.sim?.mode === 'testnet' ? 'XRPL Testnet' : 'Simulation';
      $('actor').hidden = !who;
      $('actor').textContent = who ? labels[who] + ' · ' + roleContext[who].name : '';
      $('change-role').hidden = !who || choosing;
      $('role-options').hidden = !who || !choosing;
      $('login').hidden = !choosing;
      $('workspace').hidden = choosing;
      if (!choosing) renderWorkspace(who, selectedResource());

      const milestone = !choosing && state.sim?.mode === 'simulated' ? demoMilestone() : '';
      $('demo-controls').hidden = choosing || state.sim?.mode !== 'simulated' || (who === 'comune' && !milestone);
      if (!$('demo-controls').hidden) {
        $('demo-clock').textContent = 'Simulated time: ' + dateLabel(state.sim.nowUtc);
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
      const [orders, listings, access, funds] = await Promise.all([
        api('/api/ordini?resourceId=' + encodeURIComponent(id)),
        session.role === 'authority' ? [] : api('/api/annunci'),
        session.role === 'authority' ? null : fetch('/api/risorse/' + encodeURIComponent(id) + '/accesso').then((res) => res.json()),
        api('/api/risorse/' + encodeURIComponent(id) + '/fondi').catch(() => null),
      ]);
      if (version !== state.version) return;
      state.orders = orders;
      state.listings = listings;
      state.access = access?.headline ? access : null;
      state.funds = funds;
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
      $('funds').hidden = true;
      setHtml($('work-cards'), '<div class="skeleton-card" aria-label="Loading"></div>');
      $('resource-name').textContent = id === 'cad' ? 'CAD Seat' : 'Advertising Billboard';
      $('resource-subtitle').hidden = true;
      $('service-link').hidden = true;
      setHtml($('access-state'), '');
      for (const tab of $('resource-picker').querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab.dataset.id === id));
    }

    async function runAction(control, action, opts = {}) {
      if (state.busy) return;
      state.busy = true;
      state.version++;
      const restoreFocus = $('work-cards').contains(control) && control === document.activeElement;
      if (control) control.disabled = true;
      if (opts.errorId) inlineError(opts.errorId, '');
      notice(opts.pending || 'Operation in progress…');
      try {
        const result = await action();
        const view = result?.order || result;
        await refresh();
        const waiting = view?.pendingStep && view.pendingStep !== 'vault_payout_signatures';
        notice(waiting ? 'Transaction submitted. The network is verifying it.' : opts.message || '');
        if (opts.focus) $(opts.focus).focus();
        else if (restoreFocus && document.activeElement === document.body) {
          if (!control.isConnected) $('work-title').focus();
        }
      } catch (error) {
        if (opts.errorId) {
          notice('');
          inlineError(opts.errorId, error.message);
        } else notice(error.message, true);
      } finally {
        if (control) control.disabled = false;
        if (restoreFocus && control.isConnected && document.activeElement === document.body) control.focus();
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
        if (fee <= 0n || fee >= gross) throw new Error('Enter a price large enough to cover the fee.');
        $('split').textContent = xrp(fee) + ' to authority · ' + xrp(gross - fee) + ' to Alice';
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
      $('listing-title').textContent = order ? 'Propose a new price' : 'New listing';
      $('price').value = order ? xrp(order.priceDrops).replace(' XRP', '').replaceAll(',', '') : '10';
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
      if (Date.parse(startsAt) <= now() || startsAt >= endsAt) throw new Error('Choose a future period with end after start.');
      const signed = await post('/api/local-signer/proposal', {
        resourceId: listingDraft.resource.resourceId, listingId: listingDraft.listingId, startsAt, endsAt, priceDrops,
      });
      await post('/api/annunci', signed);
      $('listing-dialog').close();
    }

    async function acceptListing(id) {
      const listing = findListing(id);
      if (!listing) throw new Error('Listing is no longer available.');
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
      ctx.fillStyle = '#1A1A1A';
      ctx.fillRect(0, 0, 640, 360);
      ctx.strokeStyle = '#2A2A2A';
      ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
      for (let y = 0; y < 360; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
      ctx.fillStyle = '#76B900';
      ctx.fillRect(56, 86, 84, 6);
      ctx.fillStyle = '#F0F2F5';
      ctx.font = '700 46px monospace';
      ctx.fillText('Bob’s Campaign', 56, 188);
      ctx.fillStyle = '#00BFFF';
      ctx.font = '500 20px monospace';
      ctx.fillText('XRPL Verified Pass · Site torino-01', 56, 240);
      const image = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!image) throw new Error('Sample image unavailable.');
      await uploadImage(image);
    }

    const orderActions = {
      approve: ['decisione', { decision: 'approve' }, 'Issuing pass…'],
      'accept-pass': ['pass/accetta', {}, 'Claiming pass…'],
      deposit: ['deposito', {}, 'Sending deposit…'],
      release: ['sblocco', {}, 'Releasing deposit…'],
      prepare: ['liquidazione', { action: 'prepare', mode: 'ordinary' }, 'Preparing settlement…'],
      recover: ['recupero', {}, 'Recovering order…'],
      reconcile: ['riconcilia', {}, 'Verifying transaction on XRPL…'],
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
      if (action === 'accept-listing') return runAction(control, () => acceptListing(id), {
        pending: 'Signing and submitting request…', message: 'Request sent to the authority.',
      });
      if (action === 'time') return runAction(control, () => post('/api/simulazione/tempo', {
        seconds: Math.max(1, Math.ceil((Date.parse(id) - now()) / 1000) + 1),
      }));
      if (action === 'demo-image') return runAction(control, sampleImage, { message: 'Image published to billboard.' });
      if (!id) return;
      const order = findOrder(id);
      if (!order) return;
      if (action === 'relist') return showListing(order);
      if (action === 'reject') {
        rejectionId = order.orderId;
        $('reject-reason').value = now() >= Date.parse(order.fundBy) ? 'Deposit deadline expired.' : '';
        inlineError('reject-error', '');
        return $('reject-dialog').showModal();
      }
      if (action === 'sign') return runAction(control, () => signSettlement(order), {
        pending: 'Submitting signature…', message: 'Signature recorded.',
      });
      if (action === 'arbitration') return runAction(control,
        () => post(orderPath(id, 'liquidazione'), { action: 'prepare', mode: choice }));
      if (Object.hasOwn(orderActions, action)) {
        const [route, body, pending] = orderActions[action];
        return runAction(control, () => post(orderPath(id, route), body), { pending });
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
      void runAction(event.submitter, submitListing, {
        errorId: 'listing-error', pending: 'Signing and publishing…',
        message: 'Listing published.', focus: 'work-title',
      });
    });
    $('reject-form').addEventListener('submit', (event) => {
      event.preventDefault();
      void runAction(event.submitter, async () => {
        const reason = $('reject-reason').value.trim();
        if (!reason) throw new Error('Enter a rejection reason.');
        const response = await post(orderPath(rejectionId, 'decisione'), { decision: 'reject', reason });
        $('reject-dialog').close();
        return response;
      }, { errorId: 'reject-error', message: 'Request closed.', focus: 'work-title' });
    });
    $('upload-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const file = $('billboard-file').files?.[0];
      if (file) void runAction(event.submitter, () => uploadImage(file), { message: 'Image published to billboard.' });
    });
    $('preset-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (state.busy || !confirm('Load the scenario and replace simulation listings and orders?')) return;
      const preset = $('preset').value;
      void runAction(event.submitter, async () => {
        await post('/api/simulazione/preset', { preset });
        selectResource('cad');
      }, { message: 'Scenario loaded.' });
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
