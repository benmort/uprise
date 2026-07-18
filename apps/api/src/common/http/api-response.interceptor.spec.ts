import { lastValueFrom, of } from "rxjs";
import { ApiResponseInterceptor } from "./api-response.interceptor";

/** Build an ExecutionContext whose response reports the given Content-Type. */
function ctx(contentType?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: "req-1" }),
      getResponse: () => ({ getHeader: (_: string) => contentType }),
    }),
  } as any;
}
const handler = (value: unknown) => ({ handle: () => of(value) }) as any;

describe("ApiResponseInterceptor", () => {
  it("wraps a JSON object response in the { ok, data, requestId } envelope", async () => {
    const out = await lastValueFrom(new ApiResponseInterceptor().intercept(ctx(), handler({ id: "e1" })));
    expect(out).toEqual({ ok: true, data: { id: "e1" }, requestId: "req-1" });
  });

  it("passes TwiML (application/xml) through raw — never wrapped (else Twilio 12100)", async () => {
    const twiml = '<?xml version="1.0"?><Response><Dial>+61400000000</Dial></Response>';
    const out = await lastValueFrom(
      new ApiResponseInterceptor().intercept(ctx("application/xml"), handler(twiml)),
    );
    expect(out).toBe(twiml);
  });

  it("passes a raw string body through even before the Content-Type header is set", async () => {
    const csv = "Name,Email\nA,a@b.c";
    const out = await lastValueFrom(new ApiResponseInterceptor().intercept(ctx(undefined), handler(csv)));
    expect(out).toBe(csv);
  });
});
