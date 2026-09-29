import { createRootRoute, Outlet } from "@tanstack/react-router";

// PROTOTYPE (#120) — the bar-contrast switcher, dev builds only.
import BarContrastPrototype from "../components/BarContrastPrototype/BarContrastPrototype";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && <BarContrastPrototype />}
    </>
  ),
});
