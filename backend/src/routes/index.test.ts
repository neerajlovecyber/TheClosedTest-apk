import { describe, expect, it } from "vitest"

import app from "../app"

describe("Index Route & OpenAPI Endpoints", () => {
  it("GET / returns 200 and healthy message", async () => {
    const res = await app.request("/")
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toEqual({
      message: "TheClosedTest API is healthy",
    })
  })

  it("GET /doc returns valid OpenAPI JSON specification", async () => {
    const res = await app.request("/doc")
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.openapi).toBe("3.0.0")
    expect(json.info.title).toBe("TheClosedTest API")
  })

  it("GET /reference returns Scalar documentation HTML", async () => {
    const res = await app.request("/reference")
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("html")
  })

  it("GET /non-existent-route returns 404", async () => {
    const res = await app.request("/non-existent-route")
    expect(res.status).toBe(404)
  })
})
