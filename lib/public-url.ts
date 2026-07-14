type RequestLike = Pick<Request, "headers" | "url">;

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function normalizeProtocol(value: string | null, fallback: string): "http" | "https" {
  const protocol = (value || fallback).replace(/:$/, "").toLowerCase();
  return protocol === "https" ? "https" : "http";
}

function configuredOrigin(): string | null {
  const raw = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function publicOrigin(req: RequestLike): string {
  const configured = configuredOrigin();
  if (configured) return configured;

  const fallback = new URL(req.url);
  const forwardedProto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(req.headers.get("x-forwarded-host"));
  const requestHost = firstHeaderValue(req.headers.get("host"));
  const host =
    requestHost && requestHost !== fallback.host
      ? requestHost
      : forwardedHost || requestHost || fallback.host;
  const protocol = normalizeProtocol(forwardedProto, fallback.protocol);

  return `${protocol}://${host}`;
}

export function publicUrl(req: RequestLike, pathname: string): URL {
  return new URL(pathname, `${publicOrigin(req)}/`);
}
