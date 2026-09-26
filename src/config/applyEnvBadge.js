// Visual "you are NOT on production" indicator. Opt-in via VITE_ENV_LABEL:
// set it (e.g. "DEV") in .env.local and in Vercel's Preview-scoped env vars,
// leave it unset for Production. Unset → this is a no-op.
//
// Adds a colored frame around the viewport with a label tab, prefixes the
// document title, and dots the favicon so the browser tab is recognizable
// too. Everything is pointer-events:none and position:fixed, so it never
// blocks clicks or affects layout.

const label = import.meta.env.VITE_ENV_LABEL?.trim();
const color = import.meta.env.VITE_ENV_COLOR?.trim() || '#f97316';

export function applyEnvBadge() {
  if (!label) return;

  document.title = `[${label}] ${document.title}`;

  const style = document.createElement('style');
  style.textContent = `
    .env-badge-frame {
      position: fixed;
      inset: 0;
      border: 3px solid ${color};
      pointer-events: none;
      z-index: 2147483647;
    }
    .env-badge-tab {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      padding: 1px 10px 2px;
      background: ${color};
      color: #fff;
      font: 700 11px/1.3 system-ui, sans-serif;
      letter-spacing: 0.08em;
      border-radius: 0 0 6px 6px;
      opacity: 0.9;
    }
  `;
  document.head.appendChild(style);

  const frame = document.createElement('div');
  frame.className = 'env-badge-frame';
  frame.setAttribute('aria-hidden', 'true');
  const tab = document.createElement('div');
  tab.className = 'env-badge-tab';
  tab.textContent = label;
  frame.appendChild(tab);
  document.body.appendChild(frame);

  dotFavicon();
}

function dotFavicon() {
  const link = document.querySelector('link[rel~="icon"]');
  if (!link) return;

  const img = new Image();
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size * 0.75, size * 0.75, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    link.type = 'image/png';
    link.href = canvas.toDataURL('image/png');
  };
  img.src = link.href;
}
