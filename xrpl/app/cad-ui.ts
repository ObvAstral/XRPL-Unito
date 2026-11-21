import { demoThemeTokens } from './marketplace-theme.js'

export function renderCadPortalHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CAD Seat · XRPL Rentals Deep Tech</title>
  <style>
    ${demoThemeTokens}
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      min-height: 100dvh;
      margin: 0;
      overflow-x: hidden;
      background-color: var(--bg-primary);
      background-image:
        radial-gradient(circle at 12% 15%, rgba(118, 185, 0, 0.09) 0%, transparent 45%),
        radial-gradient(circle at 88% 80%, rgba(0, 191, 255, 0.07) 0%, transparent 45%),
        linear-gradient(rgba(74, 74, 74, 0.16) 1px, transparent 1px),
        linear-gradient(90deg, rgba(74, 74, 74, 0.16) 1px, transparent 1px);
      background-size: 100% 100%, 100% 100%, 32px 32px, 32px 32px;
      color: var(--ink);
      font: 400 1rem/1.6 var(--mono);
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--primary); text-decoration: none; text-underline-offset: .22em; }
    a:hover { color: var(--circuit); text-decoration: underline; }
    :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    @keyframes entryFadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 0.45; transform: scale(0.95); }
      50% { opacity: 1; transform: scale(1.1); }
    }

    .skip-link {
      position: fixed;
      z-index: var(--z-toast);
      top: .75rem;
      left: 1rem;
      padding: .65rem 1rem;
      border-radius: var(--radius);
      background: var(--primary);
      color: var(--ink-dark);
      font-weight: 600;
      transform: translateY(-200%);
      transition: transform 200ms var(--spring-ease);
    }
    .skip-link:focus { transform: translateY(0); }

    header {
      position: sticky;
      top: 0;
      z-index: var(--z-sticky-nav);
      border-bottom: 1px solid var(--neutral);
      background: rgba(26, 26, 26, 0.92);
      backdrop-filter: blur(12px);
    }
    .topbar, main {
      width: min(100% - 3rem, 80rem);
      margin-inline: auto;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-height: 4.5rem;
      padding-block: .65rem;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: .75rem;
      color: var(--ink);
      font-weight: 700;
      text-decoration: none;
    }
    .brand:hover { color: var(--primary); text-decoration: none; }
    .brand-icon {
      display: grid;
      place-items: center;
      width: 2.15rem;
      height: 2.15rem;
      border: 1px solid var(--primary);
      border-radius: var(--radius);
      background: var(--primary-dim);
      color: var(--primary);
    }
    .brand small {
      display: block;
      font-size: .68rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 500;
    }

    .icon {
      width: 1.1rem;
      height: 1.1rem;
      stroke: currentColor;
      stroke-width: 1.85;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    main {
      display: grid;
      gap: 1.5rem;
      padding-block: clamp(1.75rem, 4vw, 3rem) 4rem;
    }
    h1, h2, p { margin: 0; }
    h1, h2 { line-height: 1.15; letter-spacing: -.03em; font-weight: 700; }

    /* Split-Screen High-Tech Hero */
    .hero {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: center;
      gap: 1.75rem;
      padding: clamp(1.5rem, 3.5vw, 2.5rem);
      border: 1px solid var(--neutral);
      border-left: 4px solid var(--primary);
      border-radius: var(--radius);
      background:
        radial-gradient(circle at 88% 22%, rgba(118, 185, 0, 0.16), transparent 55%),
        linear-gradient(135deg, #1E2419 0%, #2A2A2A 100%);
      color: var(--ink);
      box-shadow: var(--card-shadow);
      animation: entryFadeUp 540ms var(--spring-ease) both;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: .75rem;
      padding: 0.25rem 0.6rem;
      border: 1px solid rgba(118, 185, 0, 0.45);
      border-radius: var(--radius-sm);
      background: var(--primary-dim);
      color: var(--primary);
      font-size: .74rem;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h1 {
      font: 700 clamp(2.1rem, 4.5vw, 3.35rem)/1.08 var(--mono);
      letter-spacing: -.04em;
      text-wrap: balance;
    }
    .hero p {
      max-width: 58ch;
      margin-top: .75rem;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .hero-visual {
      padding: 0.85rem 1rem;
      border: 1px solid var(--line-subtle);
      border-radius: var(--radius);
      background: rgba(20, 22, 20, 0.88);
    }

    h2 { font-size: clamp(1.25rem, 3vw, 1.65rem); font-weight: 700; }

    .card {
      min-width: 0;
      padding: clamp(1.25rem, 2.8vw, 1.85rem);
      border: 1px solid var(--neutral);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--card-shadow);
      animation: entryFadeUp 540ms var(--spring-ease) both;
    }
    .access-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 1.25rem 2rem;
      align-items: center;
      border-left: 4px solid var(--primary);
    }
    .access-card > .error,
    .access-card > .tx-verification { grid-column: 1 / -1; }
    .tx-verification {
      display: grid;
      gap: 0.5rem;
      padding: 0.8rem 1rem;
      border: 1px solid rgba(0, 191, 255, 0.35);
      border-inline-start: 3px solid var(--electric);
      border-radius: var(--radius);
      background: rgba(0, 191, 255, 0.06);
    }
    .tx-verification-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.4rem 0.75rem;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--electric);
    }
    .tx-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .tx-link {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      max-width: 100%;
      padding: 0.3rem 0.6rem;
      border: 1px solid rgba(0, 191, 255, 0.4);
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      color: var(--ink);
      font: 500 0.76rem/1.35 var(--mono);
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .tx-link:hover {
      border-color: var(--circuit);
      background: var(--primary-dim);
      color: var(--circuit);
      text-decoration: none;
    }
    .tx-link-badge {
      padding: 0.1rem 0.36rem;
      border-radius: var(--radius-sm);
      background: var(--electric-dim);
      color: var(--electric);
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .card p { margin-top: .55rem; color: var(--muted); max-width: 68ch; }

    .status-label {
      display: inline-flex;
      align-items: center;
      gap: .45rem;
      margin-bottom: .65rem;
      padding: 0.25rem 0.65rem;
      border: 1px solid rgba(110, 250, 95, 0.4);
      border-radius: var(--radius-sm);
      background: var(--success-bg);
      color: var(--circuit);
      font-size: .75rem;
      font-weight: 600;
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .status-label::before {
      content: "";
      width: .45rem;
      height: .45rem;
      border-radius: 50%;
      background: currentColor;
      animation: pulseDot 2.2s infinite ease-in-out;
    }
    .access-card[data-state="inactive"] { border-left-color: var(--neutral); }
    .access-card[data-state="inactive"] .status-label {
      border-color: var(--neutral);
      background: var(--bg-primary);
      color: var(--muted);
    }
    .access-card[data-state="error"] { border-left-color: var(--error); }
    .access-card[data-state="error"] .status-label {
      border-color: rgba(255, 92, 92, 0.5);
      background: var(--error-bg);
      color: var(--error);
    }

    .actions:not([hidden]) {
      display: flex;
      flex-wrap: wrap;
      gap: .75rem;
      align-items: center;
    }
    button, summary { font: inherit; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 2.85rem;
      padding: .75rem 1.15rem;
      border: 1.5px solid transparent;
      border-radius: var(--radius);
      background: var(--primary);
      color: var(--ink-dark);
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.3;
      cursor: pointer;
      transition:
        transform 200ms var(--spring-ease),
        box-shadow 200ms var(--spring-ease),
        background-color 200ms var(--spring-ease),
        border-color 200ms var(--spring-ease);
    }
    button:hover:not(:disabled) {
      background: var(--primary-hover);
      transform: scale(1.03);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }
    button:active:not(:disabled) { transform: translateY(-1px); }
    button:disabled { opacity: .45; cursor: wait; }

    .secondary {
      border-color: var(--neutral);
      background: transparent;
      color: var(--primary);
    }
    .secondary:hover:not(:disabled) {
      background: var(--primary-dim);
      border-color: var(--primary);
      color: var(--circuit);
    }

    .account { position: relative; min-width: 0; }
    summary {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: .5rem .85rem;
      border: 1px solid var(--neutral);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--ink);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    summary:hover, .account[open] > summary {
      border-color: var(--primary);
      background: var(--primary-dim);
    }
    .address {
      color: var(--electric);
      font: 500 .78rem/1.4 var(--mono);
      overflow-wrap: anywhere;
    }
    .switcher {
      position: absolute;
      z-index: var(--z-overlay);
      inset: calc(100% + .45rem) 0 auto auto;
      display: grid;
      gap: 0.35rem;
      width: max-content;
      max-width: 85vw;
      padding: .5rem;
      border: 1px solid var(--primary);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
    }
    .switcher button {
      width: 100%;
      justify-content: flex-start;
      text-align: left;
    }

    .card p.error {
      padding: .85rem 1.1rem;
      border: 1px solid var(--error);
      border-radius: var(--radius);
      background: var(--error-bg);
      color: var(--error);
      overflow-wrap: anywhere;
    }

    /* CAD Engineering Blueprint Card */
    .project-card {
      padding: 0;
      overflow: hidden;
      border-color: var(--primary);
    }
    .project-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding: clamp(1.2rem, 2.8vw, 1.85rem);
      background: var(--bg-primary);
      border-bottom: 1px solid var(--neutral);
    }
    .drawing {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      gap: 1.5rem;
      padding: clamp(1rem, 2.2vw, 1.65rem);
      background: #121712;
    }
    .drawing-view {
      min-width: 0;
      border: 1px solid #2A3828;
      border-radius: var(--radius);
      overflow: hidden;
      background: #141B14;
    }
    .view-label {
      display: flex;
      justify-content: space-between;
      color: var(--circuit);
      font: 600 .74rem/1.5 var(--mono);
      letter-spacing: .07em;
      padding: .55rem .85rem;
      background: rgba(118, 185, 0, 0.1);
      border-bottom: 1px solid #2A3828;
    }
    .drawing-facts {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      margin: 0;
      background: var(--neutral);
      border-top: 1px solid var(--neutral);
    }
    .drawing-facts > div {
      padding: 1rem 1.25rem;
      background: var(--surface);
    }
    .drawing-facts dt {
      color: var(--muted);
      font-size: .75rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .drawing-facts dd {
      margin: .3rem 0 0;
      color: var(--circuit);
      font: 700 .98rem/1.4 var(--mono);
    }
    svg.cad-svg {
      display: block;
      width: 100%;
      height: auto;
      background: #121814;
    }

    @media (max-width: 48rem) {
      .hero,
      .access-card,
      .drawing {
        grid-template-columns: 1fr;
      }
      .drawing-facts {
        grid-template-columns: repeat(2, 1fr);
      }
      .actions { justify-content: start; }
    }
    @media (max-width: 36rem) {
      .topbar, main { width: calc(100% - 1.5rem); }
      .topbar { flex-wrap: wrap; gap: .75rem; }
      .actions > button, .actions { width: 100%; }
      .drawing-facts { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header>
    <div class="topbar">
      <a class="brand" href="/">
        <span class="brand-icon" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </span>
        <span>XRPL Rentals<small>Back to marketplace</small></span>
      </a>
      <details class="account" id="account" hidden>
        <summary><span id="actor"></span><span id="address" class="address"></span></summary>
        <div class="switcher">
          <button type="button" class="secondary" data-login="alice">Switch to Alice</button>
          <button type="button" class="secondary" data-login="bob">Switch to Bob</button>
        </div>
      </details>
    </div>
  </header>

  <main id="main" tabindex="-1">
    <section class="hero" aria-labelledby="seat">
      <div>
        <div class="eyebrow">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
          Design Portal · CAD
        </div>
        <h1 id="seat">CAD Seat</h1>
        <p>Instant cryptographic verification on a validated XRPL snapshot: annual NFT ownership, authority-signed temporary pass, and active escrow.</p>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <svg viewBox="0 0 360 110" width="100%" height="auto" role="presentation">
          <g stroke="#76B900" stroke-width="1.4" stroke-dasharray="4 3" fill="none">
            <path d="M95 55 H140"/>
            <path d="M220 55 H265"/>
          </g>
          <rect x="10" y="30" width="85" height="50" rx="6" fill="#1A1A1A" stroke="#76B900"/>
          <text x="52" y="52" text-anchor="middle" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="10" font-weight="700">ALICE NFT</text>
          <text x="52" y="67" text-anchor="middle" fill="#BDBDBD" font-family="Roboto Mono, monospace" font-size="8">Base Title</text>

          <rect x="140" y="25" width="80" height="60" rx="6" fill="#1A1A1A" stroke="#00BFFF"/>
          <text x="180" y="51" text-anchor="middle" fill="#00BFFF" font-family="Roboto Mono, monospace" font-size="10" font-weight="700">GUARDIAN</text>
          <text x="180" y="66" text-anchor="middle" fill="#6EFA5F" font-family="Roboto Mono, monospace" font-size="8">XRPL Snapshot</text>

          <rect x="265" y="30" width="85" height="50" rx="6" fill="#1A1A1A" stroke="#6EFA5F"/>
          <text x="307" y="52" text-anchor="middle" fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="10" font-weight="700">BOB PASS</text>
          <text x="307" y="67" text-anchor="middle" fill="#6EFA5F" font-family="Roboto Mono, monospace" font-size="8">Active Slot</text>
        </svg>
      </div>
    </section>

    <section class="card access-card" id="access-card" data-state="pending" aria-labelledby="headline">
      <div role="status" aria-atomic="true">
        <div class="status-label" id="status-label">Verifying access</div>
        <h2 id="headline" tabindex="-1">Access verification</h2>
        <p id="reason" hidden></p>
      </div>
      <div id="login-actions" class="actions" hidden>
        <button type="button" data-login="alice">Sign in as Alice</button>
        <button type="button" class="secondary" data-login="bob">Sign in as Bob</button>
      </div>
      <div id="project-action" class="actions" hidden>
        <button type="button" id="open-project">Open demo project</button>
      </div>
      <div id="cad-verified-txs" class="tx-verification" hidden></div>
      <p class="error" id="action-error" role="alert" hidden></p>
    </section>

    <section class="card project-card" id="project" aria-labelledby="project-title" hidden>
      <div class="project-heading">
        <div>
          <div class="eyebrow">Project Sheet · CAD Telemetry</div>
          <h2 id="project-title" tabindex="-1"></h2>
        </div>
        <span class="status-label">Protected CAD session</span>
      </div>
      <div class="drawing">
        <div class="drawing-view">
          <div class="view-label"><span>01 / FRONT VIEW</span><span>SCALE 1:1</span></div>
          <svg class="cad-svg" viewBox="0 0 440 440" role="img" aria-labelledby="front-title front-desc">
            <title id="front-title">Three-planet epicyclic gear train</title>
            <desc id="front-desc">72-tooth outer fixed ring gear, 24-tooth central sun gear, and three 24-tooth planet gears on a carrier. Outer diameter 170 millimeters.</desc>
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#1F2E1F" stroke-width=".7"/></pattern>
              <marker id="arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M7 0L0 3.5L7 7" fill="none" stroke="#76B900" stroke-width="1"/></marker>
            </defs>
            <rect width="440" height="440" fill="url(#grid)"/>
            <g stroke="#4A6B4A" stroke-width=".8" stroke-dasharray="10 4 2 4"><path d="M45 225H395M220 54V396"/><circle cx="220" cy="225" r="82" fill="none"/></g>
            <circle cx="220" cy="225" r="145" fill="#172418" stroke="#76B900" stroke-width="2"/>
            <path d="M 341.00,225.00 L 346.97,227.77 L 346.88,230.54 L 340.74,232.91 L 340.54,235.55 L 346.25,238.83 L 345.91,241.58 L 339.59,243.41 L 339.16,246.01 L 344.56,249.78 L 343.99,252.49 L 337.53,253.76 L 336.88,256.32 L 341.93,260.54 L 341.12,263.19 L 334.58,263.89 L 333.70,266.38 L 338.36,271.03 L 337.33,273.60 L 330.75,273.73 L 329.66,276.14 L 333.90,281.17 L 332.65,283.64 L 326.08,283.20 L 324.79,285.50 L 328.57,290.88 L 327.11,293.24 L 320.61,292.22 L 319.12,294.40 L 322.42,300.10 L 320.76,302.31 L 314.37,300.74 L 312.69,302.78 L 315.48,308.74 L 313.63,310.80 L 307.41,308.67 L 305.56,310.56 L 307.82,316.74 L 305.80,318.63 L 299.78,315.97 L 297.78,317.69 L 299.49,324.05 L 297.31,325.76 L 291.55,322.58 L 289.40,324.12 L 290.56,330.60 L 288.24,332.11 L 282.77,328.44 L 280.50,329.79 L 281.09,336.34 L 278.64,337.65 L 273.52,333.52 L 271.14,334.66 L 271.15,341.24 L 268.60,342.33 L 263.86,337.77 L 261.38,338.70 L 260.82,345.26 L 258.19,346.12 L 253.86,341.17 L 251.32,341.88 L 250.19,348.36 L 247.49,348.99 L 243.61,343.68 L 241.01,344.16 L 239.32,350.52 L 236.58,350.91 L 233.17,345.28 L 230.55,345.54 L 228.31,351.73 L 225.54,351.88 L 222.64,345.97 L 220.00,346.00 L 217.23,351.97 L 214.46,351.88 L 212.09,345.74 L 209.45,345.54 L 206.17,351.25 L 203.42,350.91 L 201.59,344.59 L 198.99,344.16 L 195.22,349.56 L 192.51,348.99 L 191.24,342.53 L 188.68,341.88 L 184.46,346.93 L 181.81,346.12 L 181.11,339.58 L 178.62,338.70 L 173.97,343.36 L 171.40,342.33 L 171.27,335.75 L 168.86,334.66 L 163.83,338.90 L 161.36,337.65 L 161.80,331.08 L 159.50,329.79 L 154.12,333.57 L 151.76,332.11 L 152.78,325.61 L 150.60,324.12 L 144.90,327.42 L 142.69,325.76 L 144.26,319.37 L 142.22,317.69 L 136.26,320.48 L 134.20,318.63 L 136.33,312.41 L 134.44,310.56 L 128.26,312.82 L 126.37,310.80 L 129.03,304.78 L 127.31,302.78 L 120.95,304.49 L 119.24,302.31 L 122.42,296.55 L 120.88,294.40 L 114.40,295.56 L 112.89,293.24 L 116.56,287.77 L 115.21,285.50 L 108.66,286.09 L 107.35,283.64 L 111.48,278.52 L 110.34,276.14 L 103.76,276.15 L 102.67,273.60 L 107.23,268.86 L 106.30,266.38 L 99.74,265.82 L 98.88,263.19 L 103.83,258.86 L 103.12,256.32 L 96.64,255.19 L 96.01,252.49 L 101.32,248.61 L 100.84,246.01 L 94.48,244.32 L 94.09,241.58 L 99.72,238.17 L 99.46,235.55 L 93.27,233.31 L 93.12,230.54 L 99.03,227.64 L 99.00,225.00 L 93.03,222.23 L 93.12,219.46 L 99.26,217.09 L 99.46,214.45 L 93.75,211.17 L 94.09,208.42 L 100.41,206.59 L 100.84,203.99 L 95.44,200.22 L 96.01,197.51 L 102.47,196.24 L 103.12,193.68 L 98.07,189.46 L 98.88,186.81 L 105.42,186.11 L 106.30,183.62 L 101.64,178.97 L 102.67,176.40 L 109.25,176.27 L 110.34,173.86 L 106.10,168.83 L 107.35,166.36 L 113.92,166.80 L 115.21,164.50 L 111.43,159.12 L 112.89,156.76 L 119.39,157.78 L 120.88,155.60 L 117.58,149.90 L 119.24,147.69 L 125.63,149.26 L 127.31,147.22 L 124.52,141.26 L 126.37,139.20 L 132.59,141.33 L 134.44,139.44 L 132.18,133.26 L 134.20,131.37 L 140.22,134.03 L 142.22,132.31 L 140.51,125.95 L 142.69,124.24 L 148.45,127.42 L 150.60,125.88 L 149.44,119.40 L 151.76,117.89 L 157.23,121.56 L 159.50,120.21 L 158.91,113.66 L 161.36,112.35 L 166.48,116.48 L 168.86,115.34 L 168.85,108.76 L 171.40,107.67 L 176.14,112.23 L 178.62,111.30 L 179.18,104.74 L 181.81,103.88 L 186.14,108.83 L 188.68,108.12 L 189.81,101.64 L 192.51,101.01 L 196.39,106.32 L 198.99,105.84 L 200.68,99.48 L 203.42,99.09 L 206.83,104.72 L 209.45,104.46 L 211.69,98.27 L 214.46,98.12 L 217.36,104.03 L 220.00,104.00 L 222.77,98.03 L 225.54,98.12 L 227.91,104.26 L 230.55,104.46 L 233.83,98.75 L 236.58,99.09 L 238.41,105.41 L 241.01,105.84 L 244.78,100.44 L 247.49,101.01 L 248.76,107.47 L 251.32,108.12 L 255.54,103.07 L 258.19,103.88 L 258.89,110.42 L 261.38,111.30 L 266.03,106.64 L 268.60,107.67 L 268.73,114.25 L 271.14,115.34 L 276.17,111.10 L 278.64,112.35 L 278.20,118.92 L 280.50,120.21 L 285.88,116.43 L 288.24,117.89 L 287.22,124.39 L 289.40,125.88 L 295.10,122.58 L 297.31,124.24 L 295.74,130.63 L 297.78,132.31 L 303.74,129.52 L 305.80,131.37 L 303.67,137.59 L 305.56,139.44 L 311.74,137.18 L 313.63,139.20 L 310.97,145.22 L 312.69,147.22 L 319.05,145.51 L 320.76,147.69 L 317.58,153.45 L 319.12,155.60 L 325.60,154.44 L 327.11,156.76 L 323.44,162.23 L 324.79,164.50 L 331.34,163.91 L 332.65,166.36 L 328.52,171.48 L 329.66,173.86 L 336.24,173.85 L 337.33,176.40 L 332.77,181.14 L 333.70,183.62 L 340.26,184.18 L 341.12,186.81 L 336.17,191.14 L 336.88,193.68 L 343.36,194.81 L 343.99,197.51 L 338.68,201.39 L 339.16,203.99 L 345.52,205.68 L 345.91,208.42 L 340.28,211.83 L 340.54,214.45 L 346.73,216.69 L 346.88,219.46 L 340.97,222.36 Z" fill="#121814" stroke="#76B900" stroke-width="1.3"/>
            <path d="M220 143L291.01 266L148.99 266Z" fill="#00BFFF" fill-opacity=".1" stroke="#00BFFF" stroke-width="8" stroke-linejoin="round"/>
            <path d="M 257.00,143.00 L 263.91,145.88 L 263.62,148.74 L 256.29,150.22 L 255.74,152.58 L 261.66,157.14 L 260.65,159.84 L 253.18,159.36 L 252.04,161.50 L 256.58,167.45 L 254.91,169.79 L 247.82,167.40 L 246.16,169.16 L 249.01,176.08 L 246.79,177.91 L 240.56,173.76 L 238.50,175.04 L 239.46,182.46 L 236.84,183.65 L 231.89,178.04 L 229.58,178.74 L 228.58,186.15 L 225.74,186.62 L 222.42,179.92 L 220.00,180.00 L 217.12,186.91 L 214.26,186.62 L 212.78,179.29 L 210.42,178.74 L 205.86,184.66 L 203.16,183.65 L 203.64,176.18 L 201.50,175.04 L 195.55,179.58 L 193.21,177.91 L 195.60,170.82 L 193.84,169.16 L 186.92,172.01 L 185.09,169.79 L 189.24,163.56 L 187.96,161.50 L 180.54,162.46 L 179.35,159.84 L 184.96,154.89 L 184.26,152.58 L 176.85,151.58 L 176.38,148.74 L 183.08,145.42 L 183.00,143.00 L 176.09,140.12 L 176.38,137.26 L 183.71,135.78 L 184.26,133.42 L 178.34,128.86 L 179.35,126.16 L 186.82,126.64 L 187.96,124.50 L 183.42,118.55 L 185.09,116.21 L 192.18,118.60 L 193.84,116.84 L 190.99,109.92 L 193.21,108.09 L 199.44,112.24 L 201.50,110.96 L 200.54,103.54 L 203.16,102.35 L 208.11,107.96 L 210.42,107.26 L 211.42,99.85 L 214.26,99.38 L 217.58,106.08 L 220.00,106.00 L 222.88,99.09 L 225.74,99.38 L 227.22,106.71 L 229.58,107.26 L 234.14,101.34 L 236.84,102.35 L 236.36,109.82 L 238.50,110.96 L 244.45,106.42 L 246.79,108.09 L 244.40,115.18 L 246.16,116.84 L 253.08,113.99 L 254.91,116.21 L 250.76,122.44 L 252.04,124.50 L 259.46,123.54 L 260.65,126.16 L 255.04,131.11 L 255.74,133.42 L 263.15,134.42 L 263.62,137.26 L 256.92,140.58 Z" fill="#182C1E" stroke="#6EFA5F" stroke-width="1.4"/><circle cx="220.00" cy="143.00" r="10" fill="#121814" stroke="#6EFA5F" stroke-width="1.5"/><path d="M 328.01,266.00 L 334.92,268.88 L 334.64,271.74 L 327.30,273.22 L 326.75,275.58 L 332.68,280.14 L 331.66,282.84 L 324.20,282.36 L 323.06,284.50 L 327.60,290.45 L 325.92,292.79 L 318.83,290.40 L 317.18,292.16 L 320.03,299.08 L 317.80,300.91 L 311.57,296.76 L 309.51,298.04 L 310.47,305.46 L 307.85,306.65 L 302.91,301.04 L 300.59,301.74 L 299.60,309.15 L 296.76,309.62 L 293.43,302.92 L 291.01,303.00 L 288.14,309.91 L 285.27,309.62 L 283.80,302.29 L 281.44,301.74 L 276.87,307.66 L 274.18,306.65 L 274.65,299.18 L 272.51,298.04 L 266.57,302.58 L 264.23,300.91 L 266.62,293.82 L 264.85,292.16 L 257.93,295.01 L 256.11,292.79 L 260.25,286.56 L 258.97,284.50 L 251.55,285.46 L 250.36,282.84 L 255.98,277.89 L 255.27,275.58 L 247.86,274.58 L 247.39,271.74 L 254.09,268.42 L 254.01,266.00 L 247.11,263.12 L 247.39,260.26 L 254.73,258.78 L 255.27,256.42 L 249.35,251.86 L 250.36,249.16 L 257.83,249.64 L 258.97,247.50 L 254.43,241.55 L 256.11,239.21 L 263.20,241.60 L 264.85,239.84 L 262.00,232.92 L 264.23,231.09 L 270.46,235.24 L 272.51,233.96 L 271.55,226.54 L 274.18,225.35 L 279.12,230.96 L 281.44,230.26 L 282.43,222.85 L 285.27,222.38 L 288.59,229.08 L 291.01,229.00 L 293.89,222.09 L 296.76,222.38 L 298.23,229.71 L 300.59,230.26 L 305.16,224.34 L 307.85,225.35 L 307.38,232.82 L 309.51,233.96 L 315.46,229.42 L 317.80,231.09 L 315.41,238.18 L 317.18,239.84 L 324.10,236.99 L 325.92,239.21 L 321.78,245.44 L 323.06,247.50 L 330.48,246.54 L 331.66,249.16 L 326.05,254.11 L 326.75,256.42 L 334.17,257.42 L 334.64,260.26 L 327.93,263.58 Z" fill="#182C1E" stroke="#6EFA5F" stroke-width="1.4"/><circle cx="291.01" cy="266.00" r="10" fill="#121814" stroke="#6EFA5F" stroke-width="1.5"/><path d="M 185.99,266.00 L 192.89,268.88 L 192.61,271.74 L 185.27,273.22 L 184.73,275.58 L 190.65,280.14 L 189.64,282.84 L 182.17,282.36 L 181.03,284.50 L 185.57,290.45 L 183.89,292.79 L 176.80,290.40 L 175.15,292.16 L 178.00,299.08 L 175.77,300.91 L 169.54,296.76 L 167.49,298.04 L 168.45,305.46 L 165.82,306.65 L 160.88,301.04 L 158.56,301.74 L 157.57,309.15 L 154.73,309.62 L 151.41,302.92 L 148.99,303.00 L 146.11,309.91 L 143.24,309.62 L 141.77,302.29 L 139.41,301.74 L 134.84,307.66 L 132.15,306.65 L 132.62,299.18 L 130.49,298.04 L 124.54,302.58 L 122.20,300.91 L 124.59,293.82 L 122.82,292.16 L 115.90,295.01 L 114.08,292.79 L 118.22,286.56 L 116.94,284.50 L 109.52,285.46 L 108.34,282.84 L 113.95,277.89 L 113.25,275.58 L 105.83,274.58 L 105.36,271.74 L 112.07,268.42 L 111.99,266.00 L 105.08,263.12 L 105.36,260.26 L 112.70,258.78 L 113.25,256.42 L 107.32,251.86 L 108.34,249.16 L 115.80,249.64 L 116.94,247.50 L 112.40,241.55 L 114.08,239.21 L 121.17,241.60 L 122.82,239.84 L 119.97,232.92 L 122.20,231.09 L 128.43,235.24 L 130.49,233.96 L 129.53,226.54 L 132.15,225.35 L 137.09,230.96 L 139.41,230.26 L 140.40,222.85 L 143.24,222.38 L 146.57,229.08 L 148.99,229.00 L 151.86,222.09 L 154.73,222.38 L 156.20,229.71 L 158.56,230.26 L 163.13,224.34 L 165.82,225.35 L 165.35,232.82 L 167.49,233.96 L 173.43,229.42 L 175.77,231.09 L 173.38,238.18 L 175.15,239.84 L 182.07,236.99 L 183.89,239.21 L 179.75,245.44 L 181.03,247.50 L 188.45,246.54 L 189.64,249.16 L 184.02,254.11 L 184.73,256.42 L 192.14,257.42 L 192.61,260.26 L 185.91,263.58 Z" fill="#182C1E" stroke="#6EFA5F" stroke-width="1.4"/><circle cx="148.99" cy="266.00" r="10" fill="#121814" stroke="#6EFA5F" stroke-width="1.5"/>
            <path d="M 257.00,225.00 L 263.91,227.88 L 263.62,230.74 L 256.29,232.22 L 255.74,234.58 L 261.66,239.14 L 260.65,241.84 L 253.18,241.36 L 252.04,243.50 L 256.58,249.45 L 254.91,251.79 L 247.82,249.40 L 246.16,251.16 L 249.01,258.08 L 246.79,259.91 L 240.56,255.76 L 238.50,257.04 L 239.46,264.46 L 236.84,265.65 L 231.89,260.04 L 229.58,260.74 L 228.58,268.15 L 225.74,268.62 L 222.42,261.92 L 220.00,262.00 L 217.12,268.91 L 214.26,268.62 L 212.78,261.29 L 210.42,260.74 L 205.86,266.66 L 203.16,265.65 L 203.64,258.18 L 201.50,257.04 L 195.55,261.58 L 193.21,259.91 L 195.60,252.82 L 193.84,251.16 L 186.92,254.01 L 185.09,251.79 L 189.24,245.56 L 187.96,243.50 L 180.54,244.46 L 179.35,241.84 L 184.96,236.89 L 184.26,234.58 L 176.85,233.58 L 176.38,230.74 L 183.08,227.42 L 183.00,225.00 L 176.09,222.12 L 176.38,219.26 L 183.71,217.78 L 184.26,215.42 L 178.34,210.86 L 179.35,208.16 L 186.82,208.64 L 187.96,206.50 L 183.42,200.55 L 185.09,198.21 L 192.18,200.60 L 193.84,198.84 L 190.99,191.92 L 193.21,190.09 L 199.44,194.24 L 201.50,192.96 L 200.54,185.54 L 203.16,184.35 L 208.11,189.96 L 210.42,189.26 L 211.42,181.85 L 214.26,181.38 L 217.58,188.08 L 220.00,188.00 L 222.88,181.09 L 225.74,181.38 L 227.22,188.71 L 229.58,189.26 L 234.14,183.34 L 236.84,184.35 L 236.36,191.82 L 238.50,192.96 L 244.45,188.42 L 246.79,190.09 L 244.40,197.18 L 246.16,198.84 L 253.08,195.99 L 254.91,198.21 L 250.76,204.44 L 252.04,206.50 L 259.46,205.54 L 260.65,208.16 L 255.04,213.11 L 255.74,215.42 L 263.15,216.42 L 263.62,219.26 L 256.92,222.58 Z" fill="#1C2833" stroke="#00BFFF" stroke-width="1.5"/>
            <circle cx="220" cy="225" r="17" fill="#121814" stroke="#00BFFF" stroke-width="2"/>
            <path d="M212 210V202H228V210" fill="#121814" stroke="#00BFFF" stroke-width="1.3"/>
            <g fill="#121814" stroke="#76B900" stroke-width="1.5"><circle cx="220" cy="89" r="5"/><circle cx="356" cy="225" r="5"/><circle cx="220" cy="361" r="5"/><circle cx="84" cy="225" r="5"/></g>
            <g fill="none" stroke="#76B900" stroke-width="1"><path d="M75 70V39M365 70V39"/><path d="M79 48H361" marker-start="url(#arrow)" marker-end="url(#arrow)"/></g>
            <g fill="#6EFA5F" font-family="Roboto Mono, monospace" font-size="15"><text x="220" y="37" text-anchor="middle">Ø170</text></g>
            <g fill="none" stroke="#00BFFF" stroke-width="1"><path d="M325 133L365 105H420"/><path d="M255 248L353 310H420"/><path d="M194 258L116 382H20"/></g>
            <g fill="#F0F2F5" font-family="Roboto Mono, monospace" font-size="13"><text x="367" y="98">01</text><text x="367" y="302">02</text><text x="24" y="375">03</text></g>
            <g fill="#BDBDBD" font-family="Roboto Mono, monospace" font-size="12"><text x="20" y="423">01 RING · 02 SUN · 03 PLANETS</text></g>
          </svg>
        </div>
        <div class="drawing-view">
          <div class="view-label"><span>02 / LONGITUDINAL SECTION A–A</span><span>ISO H7</span></div>
          <svg class="cad-svg" viewBox="0 0 400 440" role="img" aria-labelledby="section-title section-desc">
            <title id="section-title">Housing and shaft cross-section</title>
            <desc id="section-desc">Outer housing, bearings, coaxial input and output shafts. Housing axial length 120 millimeters; shaft bore with H7 tolerance.</desc>
            <defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="#4A6B4A" stroke-width="1"/></pattern></defs>
            <g stroke="#4A6B4A" stroke-width=".8" stroke-dasharray="10 4 2 4"><path d="M15 225H385"/><path d="M200 75V370"/></g>
            <g fill="url(#hatch)" stroke="#76B900" stroke-width="1.5"><path d="M88 118H312V179H286V145H114V179H88Z"/><path d="M88 271H114V305H286V271H312V332H88Z"/><path d="M87 179H112V271H87ZM288 179H313V271H288Z"/></g>
            <g fill="#182C1E" stroke="#F0F2F5" stroke-width="1.5"><path d="M25 211H143V196H185V254H143V239H25Z"/><path d="M215 196H257V208H375V242H257V254H215Z"/></g>
            <g fill="#14242E" stroke="#00BFFF" stroke-width="1.5"><path d="M180 149H195V301H180Z"/><path d="M211 158H226V292H211Z"/></g>
            <g fill="#263318" stroke="#6EFA5F" stroke-width="1.5"><path d="M143 175H175V208H143ZM143 242H175V275H143Z"/><path d="M230 170H260V205H230ZM230 245H260V280H230Z"/></g>
            <g fill="none" stroke="#00BFFF" stroke-width="1"><path d="M88 180L112 204M112 180L88 204M88 247L112 271M112 247L88 271M288 180L312 204M312 180L288 204M288 247L312 271M312 247L288 271"/></g>
            <g fill="none" stroke="#76B900" stroke-width="1"><path d="M88 340V374M312 340V374"/><path d="M92 365H308" marker-start="url(#arrow)" marker-end="url(#arrow)"/><path d="M56 211V175H20M345 242V284H380"/></g>
            <g fill="#6EFA5F" font-family="Roboto Mono, monospace" font-size="14"><text x="200" y="390" text-anchor="middle">120</text><text x="20" y="162">INPUT</text><text x="310" y="304">OUTPUT</text></g>
            <g fill="#BDBDBD" font-family="Roboto Mono, monospace" font-size="12"><text x="25" y="423">DIMENSIONS IN mm · DEMO SCHEMATIC</text></g>
          </svg>
        </div>
      </div>
      <dl class="drawing-facts">
        <div><dt>Configuration</dt><dd>3 planets</dd></div>
        <div><dt>Sun / ring teeth</dt><dd>24 / 72</dd></div>
        <div><dt>Reduction ratio</dt><dd>4 : 1</dd></div>
        <div><dt>Bore tolerance</dt><dd>H7</dd></div>
      </dl>
    </section>
  </main>

  <script>
    const el = (id) => document.getElementById(id);
    const loginButtons = document.querySelectorAll('[data-login]');
    const names = { alice: 'Alice', bob: 'Bob', authority: 'Authority' };
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
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

    function message(headline, reason = '', state = 'pending') {
      el('access-card').dataset.state = state;
      text('status-label', { pending: 'Verifying access', active: 'Access authorized', inactive: 'Project access', error: 'Connection check required' }[state]);
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
      if (!response.ok) throw new Error(data.message || 'Wallet sign-in failed.');
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
      message('Verifying access');
      refreshAccess();
    }

    function escHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[char]);
    }

    function renderCadTxs(verifiedTxs) {
      const box = el('cad-verified-txs');
      if (!Array.isArray(verifiedTxs) || !verifiedTxs.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      box.innerHTML =
        '<div class="tx-verification-head"><span>Verified XRPL Testnet Transactions</span><span>testnet.xrpl.org</span></div>' +
        '<div class="tx-links">' +
        verifiedTxs.map((tx) => {
          const clean = String(tx.txHash || '').trim().toUpperCase();
          const short = clean.length > 16 ? clean.slice(0, 8) + '…' + clean.slice(-6) : clean;
          const ledger = tx.ledgerIndex != null ? ' · #' + tx.ledgerIndex : '';
          const url = tx.explorerUrl || ('https://testnet.xrpl.org/transactions/' + encodeURIComponent(clean));
          return '<a class="tx-link" href="' + escHtml(url) + '" target="_blank" rel="noopener noreferrer" title="Verify transaction ' + escHtml(clean) + ' on XRPL Testnet Explorer">' +
            '<span>' + escHtml(tx.label) + ' (' + escHtml(short + ledger) + ')</span>' +
            '<span class="tx-link-badge">Testnet TX ↗</span></a>';
        }).join('') +
        '</div>';
      box.hidden = false;
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
      renderCadTxs(access.verifiedTxs);

      if (access.code === 'SESSION_REQUIRED') {
        message('Connect wallet', 'Choose a demo profile to check CAD license availability.', 'inactive');
      } else if (access.canAccess && !hasAccess) {
        message('Verifying access');
      } else if (access.code === 'ALICE_SUSPENDED') {
        message('License rented out', access.reason, 'inactive');
      } else if (access.code === 'BOB_ACTIVE') {
        message('Pass active', 'Access available until ' + dateFormatter.format(Date.parse(access.activeUntilUtc)) + '.', 'active');
      } else {
        message(access.headline, access.reason === access.headline ? '' : access.reason, hasAccess ? 'active' : 'inactive');
      }
      return hasAccess;
    }

    async function fetchAccess() {
      const startedAt = performance.now();
      const { data } = await request('/api/risorse/cad/accesso');
      if (typeof data?.canAccess !== 'boolean') throw new Error('Server response unavailable.');
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
        message('Connection unavailable', 'Retrying automatically.', 'error');
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
      el('access-card').setAttribute('aria-busy', String(value));
      text('open-project', value ? 'Please wait…' : 'Open demo project');
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
      message('Connecting wallet');
      try {
        const { challenge } = await send('/api/wallet/challenge', {});
        const { id, proof } = await send('/api/local-signer/login', { challenge, role });
        await send('/api/wallet/session', { id, proof });
        const { data, startedAt } = await fetchAccess();
        applyAccess(data, startedAt);
        el('headline').focus({ preventScroll: true });
      } catch (error) {
        el('login-actions').hidden = !el('account').hidden;
        message('Connection failed', '', 'error');
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
        if (!response.ok) throw new Error(data.message || 'Project access unavailable.');
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
