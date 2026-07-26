const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getApiUrl(path = ""): string {
  const base = API_URL.replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${base}${suffix}`;
}

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(body || `Request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const isFormData =
    typeof FormData !== "undefined" && rest.body instanceof FormData;

  const res = await fetch(getApiUrl(path), {
    ...rest,
    headers: {
      // Let the browser set multipart boundary for FormData uploads.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = body || `Request failed: ${res.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // keep raw body
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
