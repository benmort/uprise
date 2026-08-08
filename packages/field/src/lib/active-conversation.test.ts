import { describe, expect, it } from "vitest";
import { resolveActiveConversationPhone } from "./active-conversation";

const conv = (...phones: string[]) => phones.map((contactPhone) => ({ contactPhone }));

describe("resolveActiveConversationPhone", () => {
  it("shows nothing from the reply half while an initial send is pending", () => {
    expect(
      resolveActiveConversationPhone({
        hasPendingSend: true,
        tappedPhone: "+61400000001",
        conversations: conv("+61400000002"),
      }),
    ).toBeNull();
  });

  it("prefers the conversation the volunteer tapped", () => {
    expect(
      resolveActiveConversationPhone({
        hasPendingSend: false,
        tappedPhone: "+61400000001",
        conversations: conv("+61400000002", "+61400000001"),
      }),
    ).toBe("+61400000001");
  });

  /**
   * THE regression. With no tap, the screen shows the first conversation — but the contact id
   * that dispositions and survey answers attach to was hydrated only from the tap handler. So the
   * conversation a volunteer lands on could be read and replied to and never logged. Pinning the
   * auto-selection here is what lets the screen hydrate from the SAME value it displays.
   */
  it("auto-selects the first conversation when none was tapped", () => {
    expect(
      resolveActiveConversationPhone({
        hasPendingSend: false,
        tappedPhone: null,
        conversations: conv("+61400000002", "+61400000003"),
      }),
    ).toBe("+61400000002");
  });

  it("returns null when there is nothing to show", () => {
    expect(
      resolveActiveConversationPhone({ hasPendingSend: false, tappedPhone: null, conversations: [] }),
    ).toBeNull();
  });

  it("tolerates a conversation row with no phone rather than showing undefined", () => {
    expect(
      resolveActiveConversationPhone({
        hasPendingSend: false,
        tappedPhone: null,
        conversations: [{ contactPhone: null }],
      }),
    ).toBeNull();
  });
});
