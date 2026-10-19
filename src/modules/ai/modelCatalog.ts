export interface ModelConnection {
  baseURL: string;
  apiKey: string;
}

export interface ModelOption {
  id: string;
  name?: string;
}

export class ModelCatalogError extends Error {
  constructor(
    public code:
      | "missing-key"
      | "invalid-url"
      | "http"
      | "empty"
      | "invalid-response"
      | "timeout"
      | "cancelled"
      | "network",
    public status?: number,
  ) {
    super(`Model catalog: ${code}${status ? ` (${status})` : ""}`);
  }
}

export async function fetchModelCatalog(
  connection: ModelConnection,
  options: {
    signal?: AbortSignal;
    fetcher?: typeof fetch;
    timeoutMS?: number;
  } = {},
): Promise<ModelOption[]> {
  const apiKey = connection.apiKey.trim();
  if (!apiKey) throw new ModelCatalogError("missing-key");
  const runtime = Zotero.getMainWindow() as unknown as Pick<
    typeof globalThis,
    "URL" | "AbortController" | "fetch" | "setTimeout" | "clearTimeout"
  >;
  let url: URL;
  try {
    url = new runtime.URL(
      connection.baseURL.trim().replace(/\/+$/, "") + "/models",
    );
  } catch {
    throw new ModelCatalogError("invalid-url");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ModelCatalogError("invalid-url");
  }

  const controller = new runtime.AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new ModelCatalogError("cancelled");
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = runtime.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMS ?? 15000);
  try {
    const response = await (options.fetcher ?? runtime.fetch.bind(runtime))(
      url.href,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        redirect: "error",
      },
    );
    if (!response.ok) throw new ModelCatalogError("http", response.status);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      if (controller.signal.aborted) throw new Error("Aborted model response");
      throw new ModelCatalogError("invalid-response");
    }
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray((data as any).data)
    ) {
      throw new ModelCatalogError("invalid-response");
    }
    const models = new Map<string, ModelOption>();
    for (const entry of (data as any).data) {
      if (typeof entry?.id !== "string" || !entry.id.trim()) continue;
      const id = entry.id.trim();
      models.set(id, {
        id,
        name: typeof entry.name === "string" ? entry.name.trim() : undefined,
      });
    }
    if (!models.size) throw new ModelCatalogError("empty");
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ModelCatalogError(timedOut ? "timeout" : "cancelled");
    }
    if (error instanceof ModelCatalogError) throw error;
    // Do not include request/response details that could contain credentials.
    throw new ModelCatalogError("network");
  } finally {
    runtime.clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}
