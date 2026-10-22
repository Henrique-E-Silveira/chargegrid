# Architecture

- Keep the operator's supplied 24-hour simulation in a pure browser-safe module separate from the shared charging-session store; scenario playback must never modify real driver sessions or existing dashboard tariffs.
- Render the operator prototype as its own TanStack content route using the existing UI components and semantic theme tokens; preserve the existing dashboards.