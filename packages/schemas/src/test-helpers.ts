export function deepSet<T>(obj: T, path: string, value: unknown): T {
  const copy = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const parts = path.split('.');
  let cur: Record<string, unknown> = copy;
  for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]] as Record<string, unknown>;
  cur[parts[parts.length - 1]] = value;
  return copy as T;
}

export function deepDelete<T>(obj: T, path: string): T {
  const copy = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const parts = path.split('.');
  let cur: Record<string, unknown> = copy;
  for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]] as Record<string, unknown>;
  delete cur[parts[parts.length - 1]];
  return copy as T;
}
