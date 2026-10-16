import type { ReactElement } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hearthlineLightTheme } from "@/components/theme/theme";

/** Renders inside the app's Fluent theme and returns a user-event instance for interactions. */
export function renderWithFluent(ui: ReactElement) {
  const user = userEvent.setup();
  return { user, ...render(<FluentProvider theme={hearthlineLightTheme}>{ui}</FluentProvider>) };
}
