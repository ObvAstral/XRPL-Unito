export const demoThemeTokens = String.raw`
  @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap');

  :root {
    color-scheme: dark;
    /* Color Palette — Estilo Deep Learning High-Tech */
    --bg-primary: #1A1A1A;
    --bg-elevated: #222222;
    --surface: #2A2A2A;
    --surface-lift: #333333;
    --field: #161616;
    --ink: #F0F2F5;
    --ink-dark: #1A1A1A;
    --muted: #BDBDBD;
    --neutral: #4A4A4A;
    --line: #4A4A4A;
    --line-subtle: #363636;
    --field-line: #4A4A4A;

    /* Accents (Saturation capped & calibrated) */
    --primary: #76B900;
    --primary-hover: #6CA900;
    --primary-dim: rgba(118, 185, 0, 0.14);
    --primary-glow: rgba(118, 185, 0, 0.28);
    --electric: #00BFFF;
    --electric-dim: rgba(0, 191, 255, 0.14);
    --circuit: #6EFA5F;
    --circuit-dim: rgba(110, 250, 95, 0.14);

    /* Semantic aliases */
    --page: var(--bg-primary);
    --accent: var(--primary);
    --accent-hover: var(--primary-hover);
    --accent-ink: var(--ink-dark);
    --link: var(--primary);
    --tint: var(--primary-dim);
    --focus: var(--primary);

    /* Status & Feedback */
    --success: #6EFA5F;
    --success-bg: rgba(110, 250, 95, 0.12);
    --warning: #F5B041;
    --warning-bg: rgba(245, 176, 65, 0.14);
    --error: #FF5C5C;
    --error-bg: rgba(255, 92, 92, 0.14);

    /* Hero & Surfaces */
    --hero: #1F241A;
    --hero-ink: #F0F2F5;
    --hero-muted: #BDBDBD;

    /* Shapes & Spacing */
    --radius: 0.5rem;
    --radius-sm: 0.375rem;
    --radius-lg: 0.5rem;
    --space-unit: 0.5rem;

    /* Z-Index Contract */
    --z-base: 0;
    --z-sticky-nav: 100;
    --z-overlay: 200;
    --z-modal: 300;
    --z-toast: 500;

    /* Typography — Technical Monospace */
    --mono: "Roboto Mono", ui-monospace, "Cascadia Code", "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
    --sans: var(--mono);
    --display: var(--mono);

    /* Physics & Motion */
    --spring-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --card-shadow: 0 2px 12px rgba(0, 0, 0, 0.32);
    --card-shadow-lift: 0 10px 28px rgba(0, 0, 0, 0.5), 0 0 18px rgba(118, 185, 0, 0.14);
  }
`

export const marketplaceStyles = String.raw`
  ${demoThemeTokens}

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }

  html {
    background: var(--bg-primary);
    color: var(--ink);
  }

  body {
    position: relative;
    min-height: 100dvh;
    margin: 0;
    overflow-x: hidden;
    color: var(--ink);
    background-color: var(--bg-primary);
    background-image:
      radial-gradient(circle at 14% 12%, rgba(118, 185, 0, 0.08) 0%, transparent 42%),
      radial-gradient(circle at 86% 82%, rgba(0, 191, 255, 0.06) 0%, transparent 45%),
      linear-gradient(rgba(74, 74, 74, 0.16) 1px, transparent 1px),
      linear-gradient(90deg, rgba(74, 74, 74, 0.16) 1px, transparent 1px);
    background-size: 100% 100%, 100% 100%, 32px 32px, 32px 32px;
    font: 400 1rem/1.6 var(--mono);
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3, h4, p, dl, dd, ul { margin: 0; }
  h1, h2, h3 {
    font-family: var(--mono);
    font-weight: 700;
    line-height: 1.18;
    letter-spacing: -0.03em;
    text-wrap: balance;
    color: var(--ink);
  }
  h1 { font-size: clamp(2.25rem, 4.5vw, 3.5rem); }
  h2 { font-size: 1.5rem; }
  h3 { font-size: 1.15rem; }
  p { max-width: 72ch; }

  a {
    color: var(--primary);
    text-decoration: none;
    text-underline-offset: 0.25em;
    transition: color 200ms var(--spring-ease);
  }
  a:hover { color: var(--circuit); text-decoration: underline; }

  :focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* Entry & Neural Keyframe Animations (Transform & Opacity only) */
  @keyframes entryFadeUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes pulseNode {
    0%, 100% {
      opacity: 0.45;
      transform: scale(0.96);
    }
    50% {
      opacity: 1;
      transform: scale(1.06);
    }
  }

  @keyframes shimmerSkeleton {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @keyframes float3D {
    0%, 100% {
      transform: perspective(900px) rotateX(4deg) rotateY(-4deg) translateY(0px);
    }
    50% {
      transform: perspective(900px) rotateX(2deg) rotateY(3deg) translateY(-6px);
    }
  }

  /* Controls & Buttons */
  button, input, select, textarea {
    font: inherit;
  }

  button, .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.75rem 1.125rem;
    border: 1.5px solid transparent;
    border-radius: var(--radius);
    background: var(--primary);
    color: var(--ink-dark);
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition:
      transform 200ms var(--spring-ease),
      box-shadow 200ms var(--spring-ease),
      background-color 200ms var(--spring-ease),
      border-color 200ms var(--spring-ease),
      color 200ms var(--spring-ease);
  }
  button:hover:not(:disabled), .button:hover {
    background: var(--primary-hover);
    color: var(--ink-dark);
    text-decoration: none;
    transform: scale(1.03);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }
  button:active:not(:disabled), .button:active {
    transform: translateY(-1px) scale(0.995);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }

  .secondary, .button.secondary {
    background: transparent;
    color: var(--primary);
    border: 1.5px solid var(--neutral);
  }
  .secondary:hover:not(:disabled), .button.secondary:hover {
    background: rgba(118, 185, 0, 0.1);
    border-color: var(--primary);
    color: var(--circuit);
  }

  .danger, .secondary.danger {
    color: var(--error);
    border-color: rgba(255, 92, 92, 0.5);
  }
  .danger:hover:not(:disabled) {
    color: var(--ink);
    background: var(--error-bg);
    border-color: var(--error);
  }

  .quiet {
    background: transparent;
    border-color: var(--line-subtle);
    color: var(--muted);
    padding-inline: 0.75rem;
  }
  .quiet:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--neutral);
    background: var(--surface);
  }

  .icon {
    width: 1.1rem;
    height: 1.1rem;
    flex: 0 0 1.1rem;
    stroke: currentColor;
    stroke-width: 1.85;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }
  .icon-lg {
    width: 1.5rem;
    height: 1.5rem;
    flex: 0 0 1.5rem;
  }

  /* Inputs — Label above input, 1px stroke, 2px focus ring offset 2px */
  input, select, textarea {
    width: 100%;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--field);
    color: var(--ink);
    font-size: 0.9375rem;
    transition: border-color 200ms var(--spring-ease), box-shadow 200ms var(--spring-ease);
  }
  input:hover, select:hover, textarea:hover {
    border-color: var(--muted);
  }
  input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-color: var(--primary);
  }
  textarea { resize: vertical; }
  input::file-selector-button {
    margin-inline-end: 0.75rem;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--primary);
    font: 500 0.8125rem var(--mono);
    cursor: pointer;
    transition: background-color 180ms ease, border-color 180ms ease;
  }
  input::file-selector-button:hover {
    background: var(--primary-dim);
    border-color: var(--primary);
  }

  label {
    display: grid;
    gap: 0.4rem;
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  label small {
    color: var(--muted);
    font-weight: 400;
  }
  small, .small {
    font-size: 0.875rem;
    letter-spacing: 0.015em;
  }
  .muted { color: var(--muted); }

  /* Accessibility Skip Link */
  .skip-link {
    position: fixed;
    top: 0.75rem;
    left: 0.75rem;
    z-index: var(--z-toast);
    padding: 0.6rem 0.95rem;
    border-radius: var(--radius);
    color: var(--ink-dark);
    background: var(--primary);
    font-weight: 600;
    transform: translateY(-200%);
    transition: transform 200ms var(--spring-ease);
  }
  .skip-link:focus { transform: translateY(0); }

  /* Sticky Top Navigation (z-index: 100) */
  .bar {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky-nav);
    border-bottom: 1px solid var(--neutral);
    background: rgba(26, 26, 26, 0.92);
    backdrop-filter: blur(12px);
  }
  .bar-content, main {
    width: min(100% - 3rem, 80rem);
    margin-inline: auto;
  }
  .bar-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1.25rem;
    min-height: 4.5rem;
    padding-block: 0.65rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--ink);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    text-decoration: none;
    white-space: nowrap;
  }
  .brand:hover {
    color: var(--primary);
    text-decoration: none;
  }
  .brand-mark {
    display: inline-grid;
    place-items: center;
    width: 2.15rem;
    height: 2.15rem;
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    background: linear-gradient(135deg, rgba(118, 185, 0, 0.22), rgba(0, 191, 255, 0.08));
    color: var(--primary);
    box-shadow: inset 0 0 10px rgba(118, 185, 0, 0.2);
  }
  .brand-meta {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .brand-tag {
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .identity {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem 0.85rem;
  }
  .mode, .funds-ledger {
    font: 500 0.78rem/1.4 var(--mono);
    letter-spacing: 0.03em;
  }
  .mode {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.75rem;
    border: 1px solid rgba(118, 185, 0, 0.45);
    border-radius: var(--radius);
    background: var(--primary-dim);
    color: var(--circuit);
    white-space: nowrap;
  }
  .mode::before {
    width: 0.45rem;
    height: 0.45rem;
    flex: 0 0 0.45rem;
    border-radius: 50%;
    background: var(--circuit);
    box-shadow: 0 0 8px var(--circuit);
    content: "";
    animation: pulseNode 2.4s infinite ease-in-out;
  }
  .actor-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.75rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  /* Main Container */
  main {
    display: grid;
    gap: clamp(1.75rem, 3.5vw, 2.75rem);
    padding-block: clamp(1.75rem, 4vw, 3.5rem) clamp(3rem, 6vw, 5rem);
  }

  /* Split-Screen Hero Layout (Text + Neural Topology left, Interactive Roles right) */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: clamp(1.5rem, 3vw, 2.5rem);
    padding: clamp(1.25rem, 2.8vw, 2.25rem);
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background:
      radial-gradient(circle at 12% 18%, rgba(118, 185, 0, 0.14), transparent 52%),
      radial-gradient(circle at 88% 85%, rgba(0, 191, 255, 0.1), transparent 48%),
      var(--surface);
    box-shadow: var(--card-shadow);
    animation: entryFadeUp 540ms var(--spring-ease) both;
  }

  .login-intro {
    position: relative;
    isolation: isolate;
    display: grid;
    align-content: space-between;
    gap: 1.5rem;
    padding: clamp(1.25rem, 2.5vw, 2rem);
    border: 1px solid rgba(118, 185, 0, 0.35);
    border-radius: var(--radius);
    background:
      linear-gradient(160deg, rgba(26, 26, 26, 0.95) 0%, rgba(34, 42, 24, 0.88) 100%);
    overflow: hidden;
  }
  .login-intro::before {
    position: absolute;
    z-index: -1;
    inset: 0;
    background:
      linear-gradient(rgba(118, 185, 0, 0.08) 1px, transparent 1px) center / 24px 24px,
      linear-gradient(90deg, rgba(118, 185, 0, 0.08) 1px, transparent 1px) center / 24px 24px;
    mask-image: radial-gradient(circle at 75% 30%, #000 20%, transparent 85%);
    pointer-events: none;
    content: "";
  }

  .eyebrow-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: fit-content;
    padding: 0.3rem 0.65rem;
    border: 1px solid rgba(118, 185, 0, 0.45);
    border-radius: var(--radius-sm);
    background: rgba(118, 185, 0, 0.12);
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .login-intro h1 {
    font-size: clamp(2.1rem, 4.2vw, 3.25rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    color: var(--ink);
  }
  .login-intro p {
    color: var(--muted);
    font-size: 0.95rem;
    max-width: 54ch;
  }

  /* 3D Neural / Node-and-Edge Ledger Diagram in Hero */
  .neural-stage {
    position: relative;
    padding: 0.85rem 1rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius);
    background: rgba(20, 22, 20, 0.85);
    box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6);
    animation: float3D 8s infinite ease-in-out;
  }
  .neural-stage-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .neural-stage-head span:last-child {
    color: var(--electric);
  }
  .neural-svg {
    display: block;
    width: 100%;
    height: auto;
  }

  /* Role Selection Matrix + Zig-Zag Protocol Specs */
  .hero-right {
    display: grid;
    align-content: center;
    gap: 1rem;
  }
  .role-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }
  .role-tile {
    position: relative;
    display: grid;
    align-content: start;
    justify-content: stretch;
    min-width: 0;
    min-height: 9.25rem;
    gap: 0.45rem;
    padding: 1.1rem 1.15rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--bg-primary);
    color: var(--ink);
    text-align: left;
    box-shadow: var(--card-shadow);
    animation: entryFadeUp 540ms var(--spring-ease) both;
  }
  .role-tile:nth-child(1) { animation-delay: 60ms; }
  .role-tile:nth-child(2) { animation-delay: 180ms; }
  .role-tile:nth-child(3) { animation-delay: 300ms; }
  .role-tile:nth-child(4) { animation-delay: 420ms; }

  .role-tile:hover:not(:disabled) {
    background: #23281E;
    border-color: var(--primary);
    color: var(--ink);
    transform: scale(1.03);
    box-shadow: var(--card-shadow-lift);
  }
  .role-tile-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
  }
  .role-icon {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid rgba(118, 185, 0, 0.4);
    border-radius: var(--radius-sm);
    background: var(--primary-dim);
    color: var(--primary);
  }
  .role-tile[data-role="bob"] .role-icon {
    border-color: rgba(0, 191, 255, 0.45);
    background: var(--electric-dim);
    color: var(--electric);
  }
  .role-tile strong {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--ink);
  }
  .role-tile span.role-badge {
    display: inline-block;
    width: fit-content;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .role-tile[data-role="bob"] span.role-badge {
    color: var(--electric);
  }
  .role-tile small {
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 400;
    line-height: 1.45;
  }
  #role-options {
    grid-column: 1 / -1;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  /* Zig-Zag Alternating Feature Rows on Landing/Hero */
  .zigzag-features {
    grid-column: 1 / -1;
    display: grid;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line-subtle);
  }
  .zigzag-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
    gap: 1.25rem;
    align-items: center;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius);
    background: rgba(26, 26, 26, 0.7);
  }
  .zigzag-row.reverse {
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  }
  .zigzag-visual {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--surface);
    font-size: 0.8rem;
    color: var(--circuit);
  }

  /* Workspace Layout */
  .workspace, .stack {
    display: grid;
    gap: 1.25rem;
    min-width: 0;
  }
  .workspace {
    align-items: start;
    animation: entryFadeUp 540ms var(--spring-ease) both;
  }

  /* Navigation Tabs (Resource Picker) */
  .resource-tabs {
    display: flex;
    flex-wrap: wrap;
    width: fit-content;
    max-width: 100%;
    gap: 0.35rem;
    padding: 0.35rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--bg-primary);
  }
  .resource-tabs button {
    background: transparent;
    color: var(--muted);
    border: 1px solid transparent;
    padding: 0.55rem 1rem;
    font-weight: 500;
  }
  .resource-tabs button[aria-pressed="true"] {
    border-color: var(--primary);
    background: var(--primary-dim);
    color: var(--primary);
    font-weight: 600;
    box-shadow: inset 0 -2px 0 var(--primary);
  }
  .resource-tabs button:not([aria-pressed="true"]):hover {
    background: var(--surface);
    color: var(--ink);
    transform: none;
  }

  /* Workspace Resource Banner */
  .workspace > section[aria-labelledby="resource-name"] {
    position: relative;
    isolation: isolate;
    gap: 1rem;
    padding: clamp(1.35rem, 3vw, 2.25rem);
    border: 1px solid var(--neutral);
    border-left: 4px solid var(--primary);
    border-radius: var(--radius);
    background:
      radial-gradient(circle at 92% 20%, rgba(118, 185, 0, 0.14), transparent 55%),
      linear-gradient(135deg, #22261F 0%, #2A2A2A 100%);
    box-shadow: var(--card-shadow);
    overflow: hidden;
  }
  .workspace[data-resource="torino-01"] > section[aria-labelledby="resource-name"] {
    border-left-color: var(--electric);
    background:
      radial-gradient(circle at 92% 20%, rgba(0, 191, 255, 0.14), transparent 55%),
      linear-gradient(135deg, #1D252C 0%, #2A2A2A 100%);
  }

  .resource-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 1rem 1.5rem;
  }
  .resource-head h1 {
    font-size: clamp(1.85rem, 3.6vw, 2.75rem);
    letter-spacing: -0.035em;
  }
  .resource-head p {
    margin-top: 0.35rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  .access-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.85rem;
  }
  .access-line:empty { display: none; }

  .workspace-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--line-subtle);
  }
  .workspace-heading h2 {
    font-size: 1.35rem;
    letter-spacing: -0.02em;
  }

  /* Neural Protocol Lifecycle Stepper inside Order Cards */
  .neural-stepper {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.4rem;
    padding: 0.75rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius);
    background: var(--bg-primary);
  }
  .step-node {
    position: relative;
    display: grid;
    gap: 0.2rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius-sm);
    background: var(--surface);
    font-size: 0.72rem;
    color: var(--muted);
    transition: border-color 200ms ease, background-color 200ms ease;
  }
  .step-node strong {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .step-node.done {
    border-color: rgba(118, 185, 0, 0.5);
    background: rgba(118, 185, 0, 0.08);
    color: var(--ink);
  }
  .step-node.done strong {
    color: var(--primary);
  }
  .step-node.current {
    border-color: var(--circuit);
    background: rgba(110, 250, 95, 0.14);
    color: var(--ink);
    box-shadow: 0 0 12px rgba(118, 185, 0, 0.2);
  }
  .step-node.current strong {
    color: var(--circuit);
  }
  .step-node.failed {
    border-color: var(--error);
    background: var(--error-bg);
    color: var(--error);
  }
  .step-node.failed strong {
    color: var(--error);
  }

  /* Funds Panel — Data-Driven XRP Telemetry */
  .funds-panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }
  .funds-heading {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.85rem;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 1rem 1.25rem;
    background: var(--bg-primary);
    border-bottom: 1px solid var(--neutral);
  }
  .funds-heading h2 {
    font-size: 1.15rem;
  }
  .funds-ledger {
    overflow-wrap: anywhere;
    color: var(--electric);
  }
  .funds-ledger:not(:empty) {
    padding: 0.28rem 0.6rem;
    border: 1px solid rgba(0, 191, 255, 0.4);
    border-radius: var(--radius-sm);
    background: var(--electric-dim);
  }
  .funds-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--neutral);
  }
  .funds-metric {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.4rem;
    min-width: 0;
    padding: 1rem 1.15rem;
    background: var(--surface);
    transition: background-color 200ms var(--spring-ease);
  }
  .funds-metric:hover {
    background: var(--surface-lift);
  }
  .funds-metric[data-account="escrow"] {
    background: #23211B;
  }
  .funds-metric[data-account="vault"] {
    background: #1B2329;
  }
  .funds-label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .funds-amount {
    font-size: clamp(1.1rem, 2vw, 1.4rem);
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .funds-metric[data-account="escrow"] .funds-amount { color: var(--warning); }
  .funds-metric[data-account="vault"] .funds-amount { color: var(--electric); }
  .funds-metric[data-account="alice"] .funds-amount { color: var(--circuit); }
  .funds-caption, .funds-note {
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .funds-note {
    border-top: 1px solid var(--neutral);
    padding: 0.8rem 1.25rem;
    background: rgba(118, 185, 0, 0.08);
    color: var(--circuit);
  }

  /* Cards & Panels — 0.5rem radius, #2A2A2A surface, 1px stroke #4A4A4A */
  .panel {
    min-width: 0;
    padding: clamp(1.15rem, 2.5vw, 1.5rem);
    border: 1px solid var(--neutral);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--card-shadow);
    animation: entryFadeUp 540ms var(--spring-ease) both;
    transition: transform 200ms var(--spring-ease), box-shadow 200ms var(--spring-ease), border-color 200ms var(--spring-ease);
  }
  .panel:hover {
    border-color: rgba(118, 185, 0, 0.55);
    box-shadow: var(--card-shadow-lift);
  }
  .panel-title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem 1rem;
    align-items: center;
    justify-content: space-between;
  }

  /* Status Badges */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    max-width: 100%;
    padding: 0.3rem 0.7rem;
    border: 1px solid rgba(110, 250, 95, 0.45);
    border-radius: var(--radius-sm);
    background: var(--success-bg);
    color: var(--success);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .status::before {
    width: 0.42rem;
    height: 0.42rem;
    flex: 0 0 0.42rem;
    border-radius: 50%;
    background: currentColor;
    content: "";
  }
  .status.waiting {
    border-color: rgba(245, 176, 65, 0.45);
    background: var(--warning-bg);
    color: var(--warning);
  }
  .status.closed {
    border-color: var(--neutral);
    background: var(--bg-primary);
    color: var(--muted);
  }
  .status.error {
    border-color: rgba(255, 92, 92, 0.5);
    background: var(--error-bg);
    color: var(--error);
  }

  /* Asymmetric 2-Column / 4-Column Data Facts (No 3-equal-columns!) */
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.35fr);
    gap: 0.75rem;
    padding: 0.9rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius);
    background: var(--bg-primary);
  }
  .facts > div {
    min-width: 0;
    padding: 0.35rem 0.5rem;
  }
  .facts > div:last-child {
    border-left: 2px solid var(--primary);
    padding-left: 0.85rem;
    background: rgba(118, 185, 0, 0.06);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }
  .facts dt {
    color: var(--muted);
    font-size: 0.76rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .facts dd {
    margin-top: 0.2rem;
    font-weight: 700;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .facts > div:last-child dd {
    color: var(--circuit);
    font-size: 1.1rem;
  }

  .split-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius-sm);
    background: rgba(0, 191, 255, 0.06);
    color: var(--muted);
    font-size: 0.82rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .next {
    display: grid;
    gap: 0.65rem;
    padding: 1rem 1.15rem;
    border: 1px solid rgba(118, 185, 0, 0.35);
    border-inline-start: 3px solid var(--primary);
    border-radius: var(--radius);
    background: rgba(118, 185, 0, 0.07);
    overflow-wrap: anywhere;
  }
  .next-label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--circuit);
    font-size: 0.875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Multisig 2-of-3 Progress */
  .signature-status {
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    font-size: 0.85rem;
  }
  .signature-status > ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .signature-status li {
    padding: 0.25rem 0.6rem;
    border: 1px solid var(--neutral);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--muted);
    font-size: 0.78rem;
  }
  .signature-status li.signed {
    border-color: var(--primary);
    background: var(--primary-dim);
    color: var(--circuit);
  }
  .signature-meter {
    width: min(100%, 20rem);
    height: 0.55rem;
    accent-color: var(--primary);
  }

  /* Notice & Toast Bar */
  .notice {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 1.15rem;
    border: 1px solid rgba(118, 185, 0, 0.45);
    border-inline-start: 4px solid var(--primary);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--circuit);
    font-size: 0.875rem;
    box-shadow: var(--card-shadow);
    overflow-wrap: anywhere;
  }
  .notice.error {
    border-color: var(--error);
    background: var(--error-bg);
    color: var(--error);
  }
  .inline-error {
    color: var(--error);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  /* Shimmer Skeleton & Icon Empty State */
  .skeleton-card {
    position: relative;
    overflow: hidden;
    height: 9rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .skeleton-card::after {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(118, 185, 0, 0.09), transparent);
    animation: shimmerSkeleton 1.6s infinite;
    content: "";
  }

  .empty-state {
    display: grid;
    justify-items: start;
    gap: 0.85rem;
    padding: 1.75rem;
    border: 1px dashed var(--neutral);
    border-radius: var(--radius);
    background: rgba(42, 42, 42, 0.65);
  }
  .empty-icon {
    display: inline-grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 1px solid rgba(118, 185, 0, 0.4);
    border-radius: var(--radius);
    background: var(--primary-dim);
    color: var(--primary);
  }

  /* Technical Details & XRPL Receipts */
  details { min-width: 0; }
  details summary {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2rem;
    cursor: pointer;
    color: var(--primary);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  details summary:hover { color: var(--circuit); }
  details[open] > summary { margin-bottom: 0.75rem; }
  details.tools {
    padding-top: 0.75rem;
    border-top: 1px solid var(--line-subtle);
  }

  #demo-controls {
    padding: 0.95rem 1.25rem;
    border: 1px solid var(--neutral);
    border-left: 3px solid var(--electric);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .receipts {
    display: grid;
    grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
    gap: 0.45rem 1rem;
    padding: 0.85rem;
    border: 1px solid var(--line-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    font-size: 0.8125rem;
  }
  .receipts dt {
    color: var(--muted);
    font-weight: 500;
  }
  .receipts dd {
    overflow-wrap: anywhere;
    font-family: var(--mono);
    color: var(--electric);
  }

  .sim-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: end;
  }

  /* Modals / Dialogs (z-index: 300) */
  dialog {
    z-index: var(--z-modal);
    width: min(40rem, 100% - 2rem);
    max-height: calc(100dvh - 2rem);
    padding: clamp(1.25rem, 3vw, 1.85rem);
    border: 1px solid var(--primary);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75), 0 0 24px rgba(118, 185, 0, 0.15);
  }
  dialog::backdrop {
    z-index: var(--z-overlay);
    background: rgba(15, 17, 15, 0.82);
    backdrop-filter: blur(4px);
  }
  .date-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
    gap: 0.85rem;
  }

  /* Desktop Asymmetric Workspace Grid */
  @media (min-width: 58rem) {
    .workspace:has(> .workspace-main) {
      grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
    }
    .workspace > .resource-tabs,
    .workspace > section[aria-labelledby="resource-name"] {
      grid-column: 1 / -1;
    }
    .workspace > .workspace-main {
      grid-column: 1;
    }
    .workspace:has(> .workspace-main) > .funds-panel {
      grid-column: 2;
      position: sticky;
      top: 5.5rem;
    }
  }

  /* Mobile Collapse below 768px (48rem) */
  @media (max-width: 48rem) {
    .bar-content, main {
      width: min(100% - 2rem, 80rem);
    }
    .hero,
    .zigzag-row,
    .zigzag-row.reverse,
    .facts,
    .sim-row,
    .date-fields {
      grid-template-columns: minmax(0, 1fr);
    }
    .neural-stepper {
      grid-template-columns: minmax(0, 1fr);
    }
    .role-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .role-tile {
      min-height: auto;
    }
    .funds-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .receipts {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
    }
    .receipts dd {
      margin-bottom: 0.5rem;
    }
  }

  @media (max-width: 36rem) {
    .bar-content, main {
      width: calc(100% - 1.5rem);
    }
    .bar-content {
      flex-wrap: wrap;
    }
    .resource-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }
  }
`
