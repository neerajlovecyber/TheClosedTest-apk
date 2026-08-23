import { describe, expect, it } from "bun:test"

import { verifyTokenPayload } from "../middlewares/auth"

describe("test-token backdoor gating", () => {
  it("accepts fixture tokens in test environment", async () => {
    const token = `test-clerk-${crypto.randomUUID()}`
    const payload = await verifyTokenPayload(token)
    expect(payload).not.toBeNull()
    expect(payload?.sub).toBe(token)
  })

  it("rejects fixture tokens when NODE_ENV is production", async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    try {
      const token = `test-clerk-${crypto.randomUUID()}`
      const payload = await verifyTokenPayload(token)
      expect(payload).toBeNull()
    } finally {
      process.env.NODE_ENV = original
    }
  })

  it("rejects fixture tokens when NODE_ENV is development", async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = "development"
    try {
      const token = `test-clerk-${crypto.randomUUID()}`
      const payload = await verifyTokenPayload(token)
      expect(payload).toBeNull()
    } finally {
      process.env.NODE_ENV = original
    }
  })

  it("still rejects malformed tokens in test environment", async () => {
    const payload = await verifyTokenPayload("garbage")
    expect(payload).toBeNull()
  })
})
