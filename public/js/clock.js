// Server time and countdowns. Every view carries serverNow, so the client knows how far
// its own clock is off and timers agree across phones. One interval updates every
// countdown on screen.

import { t } from './i18n.js';

let offset = 0;

export function syncServerTime(serverNow) {
  offset = serverNow - Date.now();
}

export const serverNow = () => Date.now() + offset;

export function startCountdowns() {
  setInterval(() => {
    for (const el of document.querySelectorAll('.countdown[data-ends-at]')) {
      const endsAt = Number(el.dataset.endsAt);
      const total = Number(el.dataset.total) || 1;
      const left = Math.max(0, endsAt - serverNow());
      el.querySelector('.secs').textContent = t('unit.secShort', { n: Math.ceil(left / 1000) });
      el.querySelector('.bar > i').style.width = `${Math.min(100, (left / total) * 100)}%`;
      // The last five seconds pulse, except on the short fixed steps that are nearly all "last".
      el.classList.toggle('urgent', left > 0 && left <= 5000 && total > 8000);
    }
  }, 200);
}
