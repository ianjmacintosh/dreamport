import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { describe, expect, test, vi } from "vitest";

import Dialog from "./Dialog";

type AnyElement = ReactElement<{
  children?: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean, details?: unknown) => void;
}>;

/**
 * Every element nested inside `node`, depth-first. No DOM renderer is
 * available in the unit suite and the panel is portaled, so this reads the
 * element tree `Dialog` returns, the same approach `AppNav.test.tsx` uses.
 * Focus trapping, `Escape` and outside clicks are Base UI's, covered end to
 * end in `e2e/trailblazer.spec.ts`.
 */
function descendants(node: ReactNode): AnyElement[] {
  return Children.toArray(node)
    .filter(isValidElement)
    .flatMap((child) => {
      const element = child as AnyElement;
      return [element, ...descendants(element.props.children)];
    });
}

function render(open = true, onOpenChange = () => {}) {
  const root = Dialog({
    open,
    onOpenChange,
    title: "Add Path",
    children: <form id="the-form" />,
  }) as AnyElement;
  return { root, elements: descendants(root.props.children) };
}

describe("Dialog", () => {
  test("is open exactly when the caller says", () => {
    expect(render(true).root.props.open).toBe(true);
    expect(render(false).root.props.open).toBe(false);
  });

  test("tells the caller when the User dismisses it", () => {
    const onOpenChange = vi.fn();
    render(true, onOpenChange).root.props.onOpenChange?.(false, {});
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  test("heads its panel with the title, then the caller's content", () => {
    const { elements } = render();
    const popup = elements.find((el) => el.type === BaseDialog.Popup);
    const [title, content] = Children.toArray(popup?.props.children).filter(
      isValidElement,
    ) as AnyElement[];
    expect(title.type).toBe(BaseDialog.Title);
    expect(title.props.children).toBe("Add Path");
    expect(content.type).toBe("form");
  });

  test("dims the page behind the panel", () => {
    const { elements } = render();
    expect(elements.some((el) => el.type === BaseDialog.Backdrop)).toBe(true);
  });
});
