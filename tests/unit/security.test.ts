import { describe, expect, it } from "vitest";
import { redactSensitive } from "@/lib/redact";
import { RateLimiter } from "@/lib/rate-limit";
import { isPrivateAddress, UrlNotAllowedError, validateUrlShape } from "@/lib/ssrf";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { hasRole } from "@/lib/auth/roles";

describe("sensitive data redaction", () => {
  it("removes emails, IBANs, valid card numbers, national ids, phones and secrets", () => {
    const r = redactSensitive(
      "Mail me at jane.doe@example.com, IBAN EE38 2200 2210 2014 5685, card 4111 1111 1111 1111, " +
        "isikukood 38001085718, phone +372 5555 1234, my password: Hunter2!",
    );
    expect(r.text).not.toContain("jane.doe@example.com");
    expect(r.text).not.toContain("2200 2210");
    expect(r.text).not.toContain("4111 1111");
    expect(r.text).not.toContain("38001085718");
    expect(r.text).not.toContain("5555 1234");
    expect(r.text).not.toContain("Hunter2!");
    expect(r.redacted).toBe(true);
    expect(r.kinds).toEqual(expect.arrayContaining(["email", "iban", "card", "national_id", "phone", "secret"]));
  });

  it("leaves ordinary investor questions untouched", () => {
    const q = "What is the minimum investment of 10 EUR and how does Auto Invest work in 2025?";
    const r = redactSensitive(q);
    expect(r.text).toBe(q);
    expect(r.redacted).toBe(false);
  });

  it("does not treat non-Luhn digit runs as card numbers", () => {
    expect(redactSensitive("Order 1234 5678 9012 3456").kinds).not.toContain("card");
  });
});

describe("rate limiting", () => {
  it("blocks after the limit and reports retry-after", () => {
    const limiter = new RateLimiter(3, 60_000);
    const now = 1_000_000;
    expect(limiter.check("ip", now).allowed).toBe(true);
    expect(limiter.check("ip", now + 1).allowed).toBe(true);
    expect(limiter.check("ip", now + 2).allowed).toBe(true);
    const blocked = limiter.check("ip", now + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(limiter.check("other-ip", now + 3).allowed).toBe(true);
    expect(limiter.check("ip", now + 60_001).allowed).toBe(true);
  });
});

describe("SSRF protection for website ingestion", () => {
  const allowed = ["www.lendermarket.com"];

  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("only accepts https URLs on allowlisted hosts", () => {
    expect(validateUrlShape("https://www.lendermarket.com/faq#x", allowed).toString()).toBe("https://www.lendermarket.com/faq");
    const bad = [
      "http://www.lendermarket.com/",
      "https://evil.example.com/",
      "https://169.254.169.254/latest/meta-data",
      "https://user:pass@www.lendermarket.com/",
      "https://www.lendermarket.com:8443/",
      "file:///etc/passwd",
      "not a url",
    ];
    for (const url of bad) expect(() => validateUrlShape(url, allowed), url).toThrow(UrlNotAllowedError);
  });
});

describe("admin authentication primitives", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("enforces a password policy", () => {
    expect(passwordProblems("short")).not.toHaveLength(0);
    expect(passwordProblems("LongEnoughPassw0rd")).toHaveLength(0);
  });

  it("orders roles hierarchically", () => {
    expect(hasRole("OWNER", "ADMIN")).toBe(true);
    expect(hasRole("EDITOR", "EDITOR")).toBe(true);
    expect(hasRole("VIEWER", "EDITOR")).toBe(false);
    expect(hasRole("ADMIN", "OWNER")).toBe(false);
  });
});
