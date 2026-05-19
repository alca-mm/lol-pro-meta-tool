import { describe, it, expect } from "vitest"
import { gzipBuffer, gunzipBuffer } from "../scripts/packData"

describe("gzipBuffer / gunzipBuffer", () => {
  it("compresses a repetitive input to a smaller buffer", async () => {
    const input = Buffer.from("hello world ".repeat(500))
    const compressed = await gzipBuffer(input)
    expect(compressed.length).toBeLessThan(input.length)
  })

  it("round-trip restores exact original content", async () => {
    const original = Buffer.from(JSON.stringify({ matches: [{ id: 1, champion: "Azir" }] }))
    const compressed = await gzipBuffer(original)
    const restored = await gunzipBuffer(compressed)
    expect(restored.toString("utf8")).toBe(original.toString("utf8"))
  })

  it("compressed output starts with gzip magic bytes (1f 8b)", async () => {
    const compressed = await gzipBuffer(Buffer.from("test"))
    expect(compressed[0]).toBe(0x1f)
    expect(compressed[1]).toBe(0x8b)
  })

  it("empty buffer compresses and decompresses cleanly", async () => {
    const compressed = await gzipBuffer(Buffer.alloc(0))
    const restored = await gunzipBuffer(compressed)
    expect(restored.length).toBe(0)
  })
})
