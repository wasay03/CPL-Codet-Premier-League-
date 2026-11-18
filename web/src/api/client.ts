import { useSession } from "../lib/session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { token } = useSession.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    let message = "Something went wrong";
    if (isJson && data) {
      const d = (data as { detail?: unknown }).detail;
      if (typeof d === "string") message = d;
      else if (Array.isArray(d) && d[0]?.msg) message = `${d[0].loc?.slice(-1)[0] ?? "field"}: ${d[0].msg}`;
    }
    if (res.status === 401 && token) useSession.getState().logout();
    if (res.status === 403 && message === "PASSWORD_CHANGE_REQUIRED") {
      useSession.getState().setMustChange(true);
      message = "Change your password first";
    }
    throw new ApiError(res.status, message, (data as { code?: string })?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>("POST", path, fd);
  },
  download: async (path: string, filename: string) => {
    const { token } = useSession.getState();
    const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const imageUrl = (id: number | null | undefined) => (id ? `/api/images/${id}` : undefined);
