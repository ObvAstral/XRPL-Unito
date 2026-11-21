export const demoThemeTokens = String.raw`
  :root {
    color-scheme: dark;
    --page: #090f1c;
    --surface: #111b2b;
    --surface-lift: #152337;
    --field: #0c1524;
    --ink: #edf5ff;
    --muted: #a8b8cd;
    --line: #2c4159;
    --accent: #72eac2;
    --accent-hover: #a3f9db;
    --accent-ink: #06271f;
    --tint: #142e32;
    --warning: #ffd58c;
    --warning-bg: #32291f;
    --error: #ffabb8;
    --error-bg: #38212e;
    --radius: 1rem;
    --sans: "Aptos", "Segoe UI", system-ui, sans-serif;
    --mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  }
`

export const marketplaceStyles = String.raw`
  ${demoThemeTokens}

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    min-height: 100vh;
    margin: 0;
    color: var(--ink);
    background: radial-gradient(ellipse 60rem 29rem at 68% 0%, #14243a 0, transparent 85%), var(--page);
    font: 1rem/1.55 var(--sans);
  }
  h1, h2, h3, p, dl, dd { margin: 0; }
  h1, h2, h3 { line-height: 1.12; letter-spacing: -.035em; }
  h1 { font-size: clamp(2.35rem, 5vw, 4.25rem); font-weight: 735; text-wrap: balance; }
  h2 { font-size: 1.34rem; font-weight: 700; }
  h3 { font-size: 1.17rem; }
  a { color: var(--accent); text-underline-offset: .2em; }
  :focus-visible { outline: 2px solid var(--accent-hover); outline-offset: 4px; }

  button, input, select, textarea { font: inherit; }
  button, .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: .58rem 1rem;
    border: 1px solid transparent;
    border-radius: .62rem;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    line-height: 1.3;
    text-decoration: none;
    cursor: pointer;
    transition: background-color .17s ease, border-color .17s ease, color .17s ease;
  }
  button:hover:not(:disabled), .button:hover { background: var(--accent-hover); }
  button:disabled { opacity: .55; cursor: wait; }
  .secondary { color: var(--ink); background: var(--surface-lift); border-color: var(--line); }
  .secondary:hover:not(:disabled), .button.secondary:hover { color: var(--accent-hover); background: #1a3340; }
  .danger { color: var(--error); }
  .danger:hover:not(:disabled) { color: var(--error); background: var(--error-bg); border-color: #85526a; }
  .quiet { background: transparent; padding-inline: .72rem; }
  input, select, textarea {
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: .54rem .7rem;
    border: 1px solid #526781;
    border-radius: .58rem;
    background: var(--field);
    color: var(--ink);
  }
  input::file-selector-button {
    margin-inline-end: .7rem;
    padding: .29rem .55rem;
    border: 0;
    border-radius: .35rem;
    background: var(--surface-lift);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  label { display: grid; gap: .34rem; font-weight: 650; }
  label small { color: var(--muted); font-weight: 400; }
  small, .small { font-size: .875rem; }
  .muted { color: var(--muted); }

  .bar { border-bottom: 1px solid var(--line); background: #0a1220; }
  .bar-content, main { width: min(100% - 3rem, 68rem); margin-inline: auto; }
  .bar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem 1rem;
    min-height: 4.45rem;
    padding-block: .5rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: .67rem;
    color: var(--ink);
    font-size: 1.07rem;
    font-weight: 750;
    letter-spacing: -.02em;
    text-decoration: none;
    white-space: nowrap;
  }
  .brand::before {
    content: "";
    flex: 0 0 .93rem;
    width: .93rem;
    height: .93rem;
    border: 1px solid var(--accent);
    border-radius: .16rem;
    background: linear-gradient(135deg, #14544a, #133b3c);
    box-shadow: inset 0 0 0 2px #102b33, 0 0 19px #72eac235;
    transform: rotate(45deg);
  }
  .identity { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: .25rem .7rem; }
  .mode, .funds-ledger { color: #b4c5d9; font: .76rem/1.4 var(--mono); }
  .mode {
    display: inline-flex;
    gap: .43rem;
    align-items: center;
    padding: .45rem .62rem;
    border: 1px solid var(--line);
    border-radius: .42rem;
    background: #101e2b;
    white-space: nowrap;
  }
  .mode::before {
    content: "";
    width: .4rem;
    height: .4rem;
    flex: 0 0 .4rem;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 .65rem #72eac289;
  }

  main { display: grid; gap: 1.2rem; padding-block: clamp(1.55rem, 5vw, 3.8rem); }
  .hero, .workspace > section[aria-labelledby="resource-name"] {
    position: relative;
    isolation: isolate;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #2f485f;
    border-radius: 1.25rem;
    background: linear-gradient(116deg, #15243b, #101b2d 63%, #123139);
  }
  .hero::before, .workspace > section[aria-labelledby="resource-name"]::before {
    position: absolute;
    z-index: -1;
    inset: 0;
    content: "";
    pointer-events: none;
    background:
      radial-gradient(circle at 90% 20%, #72eac22b, transparent 36%),
      repeating-linear-gradient(90deg, #a5dcca14 0 1px, transparent 1px 2.2rem),
      repeating-linear-gradient(0deg, #a5dcca14 0 1px, transparent 1px 2.2rem);
    mask-image: linear-gradient(90deg, transparent 6%, #000 84%);
  }
  .hero { display: grid; gap: 1.5rem; padding: clamp(1.45rem, 5vw, 3.9rem); box-shadow: 0 1rem 4rem #03071133; }
  .hero > div:first-child { display: grid; gap: .55rem; }
  .hero h1, .resource-head h1 { text-shadow: 0 2px 14px #02040e77; }
  .hero p, .resource-head p { color: #bdcde0; }
  .role-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .72rem; }
  .role-tile {
    display: grid;
    min-width: 0;
    min-height: 5.7rem;
    gap: .32rem;
    padding: .87rem 1rem;
    border: 1px solid #3d536d;
    border-radius: .75rem;
    background: linear-gradient(138deg, #172640, #121f33);
    color: var(--ink);
    text-align: left;
    justify-content: stretch;
  }
  .role-tile strong { font-size: 1.15rem; letter-spacing: -.015em; }
  .role-tile:hover:not(:disabled) { border-color: var(--accent); background: #1b3541; color: var(--accent-hover); }
  .role-tile span { color: var(--muted); font-size: .88rem; font-weight: 400; }

  .workspace, .stack { display: grid; gap: 1rem; min-width: 0; }
  .workspace > section[aria-labelledby="resource-name"] { padding: clamp(1rem, 3.2vw, 1.85rem); }
  .resource-tabs {
    display: flex;
    width: fit-content;
    max-width: 100%;
    gap: .3rem;
    padding: .27rem;
    border: 1px solid var(--line);
    border-radius: .83rem;
    background: var(--field);
  }
  .resource-tabs button { background: transparent; color: var(--muted); padding-inline: .9rem; }
  .resource-tabs button[aria-pressed="true"] { border-color: #467b72; background: var(--tint); color: var(--accent-hover); }
  .resource-tabs button:not([aria-pressed="true"]):hover { background: var(--surface-lift); color: var(--ink); }
  .resource-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: .8rem 1rem; }
  .resource-head p { margin-top: .35rem; }
  .access-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: .32rem .75rem; }
  .access-line:empty { display: none; }
  .access-line p, .empty { color: var(--muted); }

  .funds-panel {
    overflow: hidden;
    border: 1px solid #345165;
    border-radius: var(--radius);
    background: linear-gradient(112deg, #14253a, #0f1a2b 76%);
    box-shadow: 0 .6rem 1.5rem #02081328;
  }
  .funds-heading {
    display: flex;
    flex-wrap: wrap;
    gap: .4rem .85rem;
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
    padding: 1rem clamp(.88rem, 2vw, 1.35rem);
  }
  .funds-ledger { overflow-wrap: anywhere; }
  .funds-ledger:not(:empty) { padding: .32rem .51rem; border: 1px solid var(--line); border-radius: .4rem; background: #101e2b; }
  .funds-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: #2c4359; border-top: 1px solid #2c4359; }
  .funds-metric {
    display: grid;
    align-content: start;
    gap: .4rem;
    min-width: 0;
    padding: .9rem clamp(.85rem, 2vw, 1.35rem) 1.12rem;
    background: #111e30;
  }
  .funds-metric[data-account="escrow"] { background: linear-gradient(140deg, #27252b, #1d202c); }
  .funds-metric[data-account="vault"] { background: linear-gradient(140deg, #152c36, #142333); }
  .funds-label { color: #c4d4e7; font-size: .85rem; font-weight: 680; }
  .funds-amount {
    color: var(--ink);
    font: 650 clamp(1.06rem, 2vw, 1.7rem)/1.25 var(--mono);
    letter-spacing: -.045em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .funds-metric[data-account="escrow"] .funds-amount { color: var(--warning); }
  .funds-metric[data-account="vault"] .funds-amount { color: var(--accent-hover); }
  .funds-caption, .funds-note { color: var(--muted); font-size: .82rem; line-height: 1.4; }
  .funds-caption { overflow-wrap: anywhere; }
  .funds-note { border-top: 1px solid var(--line); padding: .68rem clamp(.88rem, 2vw, 1.35rem); }

  .panel {
    min-width: 0;
    padding: clamp(1rem, 3vw, 1.55rem);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: linear-gradient(135deg, #152338, #111b2a 75%);
  }
  .panel-title { display: flex; flex-wrap: wrap; gap: .54rem 1rem; align-items: start; justify-content: space-between; }
  .status {
    display: inline-block;
    padding: .22rem .54rem;
    border: 1px solid #447366;
    border-radius: .45rem;
    background: var(--tint);
    color: var(--accent-hover);
    font-size: .86rem;
    font-weight: 650;
  }
  .status.waiting { border-color: #7b6240; background: var(--warning-bg); color: var(--warning); }
  .status.closed { border-color: var(--line); background: var(--field); color: var(--muted); }
  .status.error { border-color: #85526a; background: var(--error-bg); color: var(--error); }
  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .7rem 1rem;
    padding: .85rem 0;
    border-block: 1px solid var(--line);
  }
  .facts > div { min-width: 0; }
  .facts dt { color: var(--muted); font-size: .875rem; }
  .facts dd { font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; }
  .next { display: grid; gap: .65rem; }
  .notice {
    padding: .72rem 1rem;
    border: 1px solid #447366;
    border-radius: .65rem;
    background: var(--tint);
    color: var(--accent-hover);
  }
  .notice.error { border-color: #85526a; background: var(--error-bg); color: var(--error); }
  .inline-error { color: var(--error); overflow-wrap: anywhere; }
  details { min-width: 0; }
  details summary { cursor: pointer; color: var(--accent); font-size: .9rem; font-weight: 650; }
  details summary::marker { color: var(--accent); }
  details[open] > summary { margin-bottom: .7rem; }
  details.tools { padding-top: .78rem; border-top: 1px solid var(--line); }
  #demo-controls {
    padding: .85rem 1rem;
    border: 1px dashed #3a506b;
    border-radius: .75rem;
    background: #0c1625;
  }
  .receipts { display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr); gap: .38rem .8rem; font-size: .875rem; }
  .receipts dt { color: var(--muted); }
  .receipts dd { overflow-wrap: anywhere; font-family: var(--mono); }
  .sim-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: end; }
  dialog {
    width: min(33rem, 100% - 2rem);
    max-height: calc(100dvh - 2rem);
    padding: clamp(1rem, 3vw, 1.55rem);
    border: 1px solid #4e6781;
    border-radius: var(--radius);
    background: #122034;
    color: var(--ink);
    box-shadow: 0 1rem 4rem #0009;
  }
  dialog::backdrop { background: #030713b5; }
  .date-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }

  @media (max-width: 56rem) {
    .funds-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .funds-amount { font-size: clamp(1rem, 3vw, 1.6rem); }
  }
  @media (max-width: 36rem) {
    .bar-content, main { width: min(100% - 1.8rem, 68rem); }
    .bar-content { flex-wrap: wrap; }
    .identity { gap: .25rem .5rem; }
    .hero { padding: 1rem; gap: 1.05rem; }
    .role-grid { gap: .55rem; }
    .role-tile { min-height: 5.2rem; padding: .72rem .65rem; }
    .role-tile strong { font-size: 1rem; }
    .role-tile span { font-size: .79rem; }
    .facts, .date-fields, .sim-row { grid-template-columns: 1fr; }
    .receipts { grid-template-columns: 1fr; gap: .15rem; }
    .receipts dd { margin-bottom: .45rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; }
  }
`
