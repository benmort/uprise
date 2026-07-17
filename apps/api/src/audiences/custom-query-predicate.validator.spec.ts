import {
  buildContactsSafeQuery,
  validateContactsSafePredicate,
} from "./custom-query-predicate.validator";

describe("validateContactsSafePredicate — the AI SQL lane's AST gate", () => {
  it("accepts a clean predicate over allowlisted columns + functions", () => {
    const result = validateContactsSafePredicate(
      "state = 'NSW' and has_phone = true and created_at > now() - interval '90 days'",
      50000,
    );
    expect(result.ok).toBe(true);
    expect(result.sql).toBe(
      buildContactsSafeQuery(
        "state = 'NSW' and has_phone = true and created_at > now() - interval '90 days'",
        50000,
      ),
    );
    // The executor's tenant filter is part of the envelope, never model-authored.
    expect(result.sql).toContain("tenant_id = $1");
  });

  it("accepts lower()/coalesce()/IN lists", () => {
    expect(
      validateContactsSafePredicate(
        "lower(locality) in ('sydney', 'brisbane') and coalesce(postcode, '') <> ''",
        100,
      ).ok,
    ).toBe(true);
  });

  const REFUSALS: Array<[string, string]> = [
    ["empty", "   "],
    ["semicolon breakout", "true; drop table audience.contacts_safe"],
    ["union breakout", "true union select id from public.\"Contact\""],
    ["comment smuggling", "true -- ) limit 1; select *"],
    ["subquery", "contact_id in (select id from public.\"Contact\")"],
    ["disallowed column", "secret_score > 5"],
    ["disallowed function", "pg_sleep(10) is null"],
    ["wildcard", "* = 1"],
  ];
  for (const [name, predicate] of REFUSALS) {
    it(`refuses: ${name}`, () => {
      const result = validateContactsSafePredicate(predicate, 100);
      expect(result.ok).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.sql).toBe("");
    });
  }

  it("accepts the remaining expression shapes (cast, ternary/BETWEEN, unary, arrays, keywords)", () => {
    expect(validateContactsSafePredicate("created_at::date > current_date - 30", 10).ok).toBe(true);
    expect(
      validateContactsSafePredicate("created_at between '2025-01-01' and '2026-01-01'", 10).ok,
    ).toBe(true);
    expect(validateContactsSafePredicate("not has_email", 10).ok).toBe(true);
    // `any()` reads as a (non-allowlisted) function call — IN lists are the supported form.
    expect(validateContactsSafePredicate("state = any(array['NSW','VIC'])", 10).ok).toBe(false);
    expect(validateContactsSafePredicate("created_at < current_timestamp", 10).ok).toBe(true);
  });

  it("refuses a tenant-filter override attempt (tenant_id is allowlisted but the executor's AND still binds)", () => {
    // `tenant_id` is a legal column, so a model may reference it — but the envelope
    // ANDs the executor's own `tenant_id = $1`, so `or tenant_id = 'other'` can never
    // widen past the bound tenant... UNLESS the OR binds loosely. The envelope wraps
    // the predicate in parentheses, so the executor filter always applies.
    const result = validateContactsSafePredicate("tenant_id = 'someone-else' or true", 100);
    expect(result.ok).toBe(true);
    // The whole model predicate sits inside its own parens, AND-ed after the executor's filter.
    expect(result.sql).toMatch(/tenant_id = \$1 and \(tenant_id = 'someone-else' or true\)/);
  });
});
