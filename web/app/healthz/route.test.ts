import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const originalVersion = process.env.APP_VERSION;

afterEach(() => {
  if (originalVersion === undefined) {
    delete process.env.APP_VERSION;
  } else {
    process.env.APP_VERSION = originalVersion;
  }
});

describe("GET /healthz", () => {
  it("reports the deployed version", async () => {
    process.env.APP_VERSION = "0123456789abcdef0123456789abcdef01234567";

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      version: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("falls back to dev when APP_VERSION is unset", async () => {
    delete process.env.APP_VERSION;

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      status: "ok",
      version: "dev",
    });
  });
});
