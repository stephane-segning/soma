export function assetHeaders(token: string) {
  return {
    Accept: "application/octet-stream",
    Authorization: `Bearer ${token}`,
    "User-Agent": "soma-packaging",
  };
}

export async function fetchGithubJson<T>(
  url: string,
  token: string
): Promise<T> {
  return fetchJsonUrl<T>(url, token, true);
}

export async function fetchJsonUrl<T>(
  url: string,
  token: string,
  forceGithubAuth: boolean
): Promise<T> {
  const target = new URL(url);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "soma-packaging",
  };
  if (forceGithubAuth || target.hostname === "api.github.com") {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`
    );
  }
  return (await response.json()) as T;
}
