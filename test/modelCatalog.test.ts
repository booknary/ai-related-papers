import { assert } from "chai";
import {
  fetchModelCatalog,
  ModelCatalogError,
} from "../src/modules/ai/modelCatalog";

describe("model catalog", function () {
  const connection = {
    baseURL: "https://api.deepseek.com",
    apiKey: "fixture-key",
  };

  it("uses the models endpoint and parses IDs and optional display names", async function () {
    const models = await fetchModelCatalog(
      { ...connection, baseURL: "https://api.deepseek.com/v1/" },
      {
        fetcher: async (url, init) => {
          assert.equal(url, "https://api.deepseek.com/v1/models");
          assert.equal(init?.method, "GET");
          assert.equal(
            (init?.headers as Record<string, string>).Authorization,
            "Bearer fixture-key",
          );
          assert.equal(init?.redirect, "error");
          return jsonResponse({
            data: [
              { id: "model-b", name: "Model B" },
              { id: "model-a" },
              { id: "model-a" },
              { id: "" },
              null,
            ],
          });
        },
      },
    );
    assert.deepEqual(models, [
      { id: "model-a", name: undefined },
      { id: "model-b", name: "Model B" },
    ]);
  });

  it("rejects a missing key before making a request", async function () {
    await expectError(
      fetchModelCatalog(
        { ...connection, apiKey: " " },
        {
          fetcher: async () => {
            throw new Error("Must not send a request");
          },
        },
      ),
      "missing-key",
    );
  });

  it("rejects invalid URLs and URLs containing credentials or query parameters", async function () {
    for (const baseURL of [
      "invalid",
      "file:///models",
      "https://user:password@example.org",
      "https://api.deepseek.com?secret=value",
    ]) {
      await expectError(
        fetchModelCatalog({ ...connection, baseURL }),
        "invalid-url",
      );
    }
  });

  it("reports HTTP failure without echoing response bodies or credentials", async function () {
    const error = await expectError(
      fetchModelCatalog(connection, {
        fetcher: async () =>
          ({
            ok: false,
            status: 401,
            json: () => {
              throw new Error("Must not read error bodies");
            },
          }) as unknown as Response,
      }),
      "http",
    );
    assert.equal(error.status, 401);
    assert.notInclude(error.message, connection.apiKey);
  });

  it("distinguishes empty and malformed model lists", async function () {
    await expectError(
      fetchModelCatalog(connection, {
        fetcher: async () => jsonResponse({ data: [] }),
      }),
      "empty",
    );
    await expectError(
      fetchModelCatalog(connection, {
        fetcher: async () => jsonResponse({ models: [] }),
      }),
      "invalid-response",
    );
    await expectError(
      fetchModelCatalog(connection, {
        fetcher: async () =>
          ({
            ok: true,
            json: async () => {
              throw new SyntaxError("Bad JSON");
            },
          }) as unknown as Response,
      }),
      "invalid-response",
    );
  });

  it("times out and aborts stalled requests", async function () {
    await expectError(
      fetchModelCatalog(connection, {
        timeoutMS: 10,
        fetcher: async (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("Aborted")),
              { once: true },
            );
          }),
      }),
      "timeout",
    );
  });

  it("honors cancellation and sanitizes network failures", async function () {
    const controller = new AbortController();
    controller.abort();
    await expectError(
      fetchModelCatalog(connection, { signal: controller.signal }),
      "cancelled",
    );
    const error = await expectError(
      fetchModelCatalog(connection, {
        fetcher: async () => {
          throw new Error(`Network failed with ${connection.apiKey}`);
        },
      }),
      "network",
    );
    assert.notInclude(error.message, connection.apiKey);
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function expectError(
  promise: Promise<unknown>,
  code: ModelCatalogError["code"],
) {
  try {
    await promise;
  } catch (error) {
    assert.instanceOf(error, ModelCatalogError);
    assert.equal((error as ModelCatalogError).code, code);
    return error as ModelCatalogError;
  }
  throw new Error(`Expected model catalog error: ${code}`);
}
