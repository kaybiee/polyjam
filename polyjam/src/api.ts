const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
    const requestUrl = typeof input === "string" && input.startsWith("/api")
        ? `${apiBaseUrl}${input}`
        : input;
    return fetch(requestUrl, init);
}
