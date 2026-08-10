import { describe, expect, it } from "vitest";
import { errorCode, errorMessage, isAuthError } from "@/lib/errors";

describe("errorMessage", () => {
  it("reads the message off a real Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("reads the message off a Supabase-shaped plain object", () => {
    // PostgrestError is not an Error instance, which is the case the old
    // `catch (e: any) { e.message }` pattern got right only by accident.
    const postgrestError = {
      message: 'column "external_form" does not exist',
      code: "PGRST204",
      details: null,
      hint: null,
    };
    expect(errorMessage(postgrestError)).toBe('column "external_form" does not exist');
  });

  it("falls back rather than rendering undefined for values with no message", () => {
    expect(errorMessage(null)).toBe("Something went wrong");
    expect(errorMessage(undefined)).toBe("Something went wrong");
    expect(errorMessage({ status: 500 })).toBe("Something went wrong");
    expect(errorMessage(new Error(""))).toBe("Something went wrong");
  });

  it("uses a caller-supplied fallback", () => {
    expect(errorMessage(null, "Failed to delete")).toBe("Failed to delete");
  });

  it("passes through a thrown string", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage("   ")).toBe("Something went wrong");
  });
});

describe("errorCode / isAuthError", () => {
  it("extracts a PostgREST code when present", () => {
    expect(errorCode({ message: "x", code: "42501" })).toBe("42501");
    expect(errorCode(new Error("x"))).toBeNull();
  });

  it("treats an RLS refusal as an auth error so it is not retried", () => {
    expect(isAuthError({ message: "permission denied", code: "42501" })).toBe(true);
    expect(isAuthError({ message: "timeout", code: "57014" })).toBe(false);
  });
});
