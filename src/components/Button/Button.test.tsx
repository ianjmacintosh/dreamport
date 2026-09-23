import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import Button from "./Button";

describe("Button", () => {
  test("exists", () => {
    expect(Button).not.toBe(undefined);
  });

  test("renders plain children when no state is given", () => {
    const button = Button({ children: "Delete" });
    expect(button.props.children).toBe("Delete");
  });

  test("state/Button.State: stacks every state, marking only the active one", () => {
    const button = Button({
      state: "pending",
      children: [
        <Button.State key="ready" name="ready">
          Send code
        </Button.State>,
        <Button.State key="pending" name="pending">
          Sending…
        </Button.State>,
      ],
    });
    const stack = button.props.children as ReactElement<{
      children?: ReactNode;
    }>;
    const stateSpans = Children.toArray(stack.props.children).filter(
      isValidElement,
    ) as ReactElement<{ children?: unknown; "data-active"?: unknown }>[];

    expect(stateSpans.map((span) => span.props.children)).toEqual([
      "Send code",
      "Sending…",
    ]);
    expect(stateSpans[0].props["data-active"]).toBe(undefined);
    expect(stateSpans[1].props["data-active"]).toBe(true);
  });
});
