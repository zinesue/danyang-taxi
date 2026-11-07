export async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `데이터를 불러오지 못했습니다 (${response.status}). 새로고침해 주세요.`,
    );
  if (url.endsWith(".gz")) {
    if (!("DecompressionStream" in globalThis))
      throw new Error(
        "압축 데이터 지원이 필요합니다. 최신 Chrome, Edge, Firefox 또는 Safari를 이용해 주세요.",
      );
    // .gz files are served as static bytes, not HTTP Content-Encoding: gzip.
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0] !== 31 || bytes[1] !== 139)
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).json() as Promise<T>;
  }
  return response.json() as Promise<T>;
}
