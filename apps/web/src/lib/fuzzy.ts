export function fuzzyIncludes(input: string, query: string): boolean {
  const source = input.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (source.includes(needle)) return true;

  let qi = 0;
  for (let si = 0; si < source.length && qi < needle.length; si += 1) {
    if (source[si] === needle[qi]) qi += 1;
  }
  return qi === needle.length;
}
