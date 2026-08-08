import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtpInput } from "./otp-input";

/**
 * Behaviour, not markup. The one that mattered: `onComplete` fires when the last digit lands.
 * It never did — `!joined.includes("")` is always false in JS, because every string contains the
 * empty string — so every caller's auto-submit was dead code and people had to press the button
 * after typing the final digit.
 */
const boxes = () => screen.getAllByRole("textbox") as HTMLInputElement[];

describe("OtpInput", () => {
  it("renders one box per digit", () => {
    render(<OtpInput value="" length={6} onChange={() => {}} />);
    expect(boxes()).toHaveLength(6);
  });

  // THE regression.
  it("fires onComplete once, with the full code, when the final digit is entered", () => {
    const onComplete = vi.fn();
    let value = "";
    // Controlled: feed each emission back in, the way a real caller does.
    function handle(next: string) {
      value = next;
      view.rerender(<OtpInput value={value} length={4} onChange={handle} onComplete={onComplete} />);
    }
    const view = render(<OtpInput value={value} length={4} onChange={handle} onComplete={onComplete} />);
    for (let i = 0; i < 4; i += 1) {
      fireEvent.change(boxes()[i], { target: { value: String(i + 1) } });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("does not fire onComplete while a slot is still empty", () => {
    const onComplete = vi.fn();
    let value = "";
    function handle(next: string) {
      value = next;
      view.rerender(<OtpInput value={value} length={4} onChange={handle} onComplete={onComplete} />);
    }
    const view = render(<OtpInput value={value} length={4} onChange={handle} onComplete={onComplete} />);
    fireEvent.change(boxes()[0], { target: { value: "1" } });
    fireEvent.change(boxes()[1], { target: { value: "2" } });
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * Correcting ONE mistyped digit, which is what everyone does with an SMS code.
   *
   * The boxes used to be derived from the joined value by left-packing, and a joined string
   * cannot express an interior gap: clearing box 3 of "123456" emitted "12456", which re-derived
   * as [1,2,4,5,6,""]. Every later digit slid one box left, the last one vanished, and the submit
   * button went dead because the code was a digit short — while the boxes still looked like a
   * plausible code, so nothing on screen showed what had happened.
   */
  it("clearing a middle box leaves every other digit where it was", () => {
    let value = "123456";
    function handle(next: string) {
      value = next;
      view.rerender(<OtpInput value={value} length={6} onChange={handle} />);
    }
    const view = render(<OtpInput value={value} length={6} onChange={handle} />);

    fireEvent.change(boxes()[2], { target: { value: "" } });

    expect(boxes().map((b) => b.value)).toEqual(["1", "2", "", "4", "5", "6"]);
  });

  it("retyping the corrected digit restores the whole code and completes", () => {
    const onComplete = vi.fn();
    let value = "123456";
    function handle(next: string) {
      value = next;
      view.rerender(<OtpInput value={value} length={6} onChange={handle} onComplete={onComplete} />);
    }
    const view = render(
      <OtpInput value={value} length={6} onChange={handle} onComplete={onComplete} />,
    );

    fireEvent.change(boxes()[2], { target: { value: "" } });
    fireEvent.change(boxes()[2], { target: { value: "9" } });

    expect(boxes().map((b) => b.value).join("")).toBe("129456");
    expect(onComplete).toHaveBeenCalledWith("129456");
  });

  // A caller clearing the field (the Resend button) must still empty every box — the slot state
  // must not ignore a genuine external change.
  it("a caller clearing the value empties every box", () => {
    const view = render(<OtpInput value="123456" length={6} onChange={() => {}} />);
    expect(boxes()[0].value).toBe("1");
    view.rerender(<OtpInput value="" length={6} onChange={() => {}} />);
    expect(boxes().map((b) => b.value)).toEqual(["", "", "", "", "", ""]);
  });

  it("ignores a non-numeric keystroke", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" length={4} onChange={onChange} />);
    fireEvent.change(boxes()[0], { target: { value: "a" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
