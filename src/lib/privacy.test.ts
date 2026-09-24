import type { User } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import {
  accountDisplayName,
  PRIVACY_POLICY_URL,
  PUBLIC_AUTHOR_NAME,
} from "./privacy"

function user(input: Partial<User>): User {
  return { user_metadata: {}, ...input } as User
}

describe("privacy contracts", () => {
  it("defines a generic public identity and a stable policy path", () => {
    expect(PUBLIC_AUTHOR_NAME).toBe("Cidadão")
    expect(PRIVACY_POLICY_URL).toBe("./privacy.html")
  })

  it("never exposes a phone number in the private account label", () => {
    const phone = "+5561999999999"
    const label = accountDisplayName(user({ phone }))

    expect(label).toBe("Conta por celular")
    expect(label).not.toContain(phone)
    expect(label).not.toContain("9999")
  })

  it("uses account metadata only for the signed-in user's private label", () => {
    expect(
      accountDisplayName(
        user({ user_metadata: { full_name: "Maria da Silva" } }),
      ),
    ).toBe("Maria da Silva")
    expect(accountDisplayName(user({ email: "maria@example.com" }))).toBe(
      "maria",
    )
  })
})
