/**
 * The homepage's number animation, shared by the hero ticker, the stage satellites and the Atlas
 * stats — one implementation so a figure counts the same wherever it appears.
 *
 * The target rides on the element as data attributes rather than props, because the stage counts
 * its satellites from a scroll handler that only has DOM nodes to work with:
 *
 *   data-to      the final value (required; a non-numeric value is ignored)
 *   data-dp      decimal places, default 0 — 0 also switches on en-AU thousands grouping
 *   data-suffix  appended verbatim, e.g. "M" or "%"
 *
 * Counts once per node, unless `resetCount` clears it. Under reduced motion the final value is
 * written immediately: the number is the content, so it must never be reachable only by animating.
 */
const counted = new WeakSet<Element>();

/**
 * Let a figure count again. Used by RevealScope when a band leaves the viewport, so a number
 * replays with the band it belongs to rather than sitting at its final value while everything
 * around it re-animates.
 *
 * "0" is what the server renders for every one of these nodes, so a reset node is back to the
 * markup it arrived as.
 */
export function resetCount(node: HTMLElement): void {
  counted.delete(node);
  node.textContent = "0";
}

export function countUp(node: HTMLElement, reduce: boolean): void {
  if (counted.has(node)) return;
  counted.add(node);

  const to = Number(node.dataset.to);
  if (!Number.isFinite(to)) return;

  const dp = Number(node.dataset.dp ?? 0);
  const suffix = node.dataset.suffix ?? "";
  const fmt = (v: number) =>
    (dp ? v.toFixed(dp) : Math.round(v).toLocaleString("en-AU")) + suffix;

  if (reduce) {
    node.textContent = fmt(to);
    return;
  }

  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min((now - t0) / 1400, 1);
    node.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
