export function isSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}
