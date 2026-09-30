// Bits shared between scenes.
import { C, clamp, ease } from '../core.js';
import { text, measure } from '../font.js';

// Montage day counter: tear-off calendar page + "DAY N" (top-right), pops in.
export function dayBadge(g, day, age) {
  const k = clamp(age / 0.12);
  const dy = Math.round((1 - ease.outBack(k)) * -14);
  const x = 262, y = 8 + dy;
  // calendar page
  g.rect(x, y + 2, 22, 24, C('#181425'));
  g.rect(x + 1, y + 3, 20, 22, C('#F4F1EC'));
  g.rect(x + 1, y + 3, 20, 6, C('#E43B44'));
  g.rect(x + 5, y, 2, 5, C('#8B9BB4')); g.rect(x + 15, y, 2, 5, C('#8B9BB4'));
  const s = String(day);
  text(g, s, x + 11, y + 11, C('#181425'), { align: 'center' });
  // a torn page flying off (previous day)
  if (age < 0.3) {
    const p = age / 0.3;
    const fx = x + 1 + Math.round(p * 26), fy = y + 3 - Math.round(p * 18 - p * p * 30);
    g.rect(fx, fy, Math.max(2, Math.round(20 * (1 - p))), Math.max(2, Math.round(22 * (1 - p * 0.5))), C('#E8E4DA'));
  }
  text(g, 'DAY', x - 4, y + 6, C('#F4F1EC'), { font: 'f8', align: 'right', outline: C('#181425') });
}
