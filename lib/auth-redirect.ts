/** Accept only the app's supported same-origin return destinations. */
export function getSafeAuthReturn(path: string | null | undefined): string {
  if (path === "/?view=mine") return path;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  if (/^\/(editor\/new|editor\/[A-Za-z0-9_-]+|m\/[A-Za-z0-9_-]+)\/?$/.test(path)) {
    return path;
  }
  return "/";
}

const RETURN_KEY = "fourbars.auth-return";
const MAX_AGE = 30 * 60 * 1000;
type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Store only a validated destination, never form values or credentials. */
export function rememberAuthReturn(storage: IntentStorage, path: string, now = Date.now()) {
  try {
    storage.setItem(
      RETURN_KEY,
      JSON.stringify({ path: getSafeAuthReturn(path), expires: now + MAX_AGE }),
    );
  } catch {
    // Authentication still works when browser storage is unavailable.
  }
}

export function consumeAuthReturn(storage: IntentStorage, now = Date.now()): string {
  try {
    const raw = storage.getItem(RETURN_KEY);
    storage.removeItem(RETURN_KEY);
    if (!raw) return "/";
    const intent = JSON.parse(raw);
    if (
      typeof intent.expires !== "number" ||
      intent.expires <= now ||
      intent.expires > now + MAX_AGE
    )
      return "/";
    return getSafeAuthReturn(intent.path);
  } catch {
    return "/";
  }
}
