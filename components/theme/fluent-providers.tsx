"use client";

import { useRef, useState, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import {
  FluentProvider,
  RendererProvider,
  SSRProvider,
  createDOMRenderer,
  renderToStyleElements,
} from "@fluentui/react-components";
import { hearthlineLightTheme } from "./theme";

/** Theme and styling for every page. */
export function FluentProviders({ children }: { children: ReactNode }) {
  return (
    <GriffelRegistry>
      <FluentProvider theme={hearthlineLightTheme} style={{ minHeight: "100dvh" }}>
        {children}
      </FluentProvider>
    </GriffelRegistry>
  );
}

/**
 * Fluent UI's App Router setup: Griffel collects the CSS rules used during the
 * server render and Next inserts them into the HTML once, so the first paint is
 * styled. After hydration Griffel inserts any further rules itself.
 */
function GriffelRegistry({ children }: { children: ReactNode }) {
  const [renderer] = useState(() => createDOMRenderer());
  const didInsertStyles = useRef(false);

  useServerInsertedHTML(() => {
    if (didInsertStyles.current) return;
    didInsertStyles.current = true;
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <RendererProvider renderer={renderer}>
      <SSRProvider>{children}</SSRProvider>
    </RendererProvider>
  );
}
