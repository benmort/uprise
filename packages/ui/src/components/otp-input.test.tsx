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

  it("ignores a non-numeric keystroke", () => {
    const onChange = vi.fn();
    render(<OtpInput value="" length={4} onChange={onChange} />);
    fireEvent.change(boxes()[0], { target: { value: "a" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
