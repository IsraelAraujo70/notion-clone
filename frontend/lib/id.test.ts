import { describe, expect, it, vi } from "vitest"

import { createId } from "@reason/core/id"

describe("createId", () => {
  it("uses native randomUUID when available", () => {
    const randomUUIDSpy = vi.fn()
    const randomUUID: Crypto["randomUUID"] = () => {
      randomUUIDSpy()
      return "00000000-0000-4000-8000-000000000000"
    }

    expect(
      createId({
        randomUUID,
        getRandomValues: vi.fn(),
      })
    ).toBe("00000000-0000-4000-8000-000000000000")
    expect(randomUUIDSpy).toHaveBeenCalled()
  })

  it("falls back to UUID v4 from getRandomValues", () => {
    const getRandomValues: Crypto["getRandomValues"] = <
      T extends ArrayBufferView | null,
    >(
      array: T
    ) => {
      const bytes = array as Uint8Array
      bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      return array
    }

    const id = createId({
      randomUUID: undefined,
      getRandomValues,
    })

    expect(id).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f")
  })
})
