---
version: alpha
name: Copilot Token Bridge
description: A VS Code native status bar entry for manually controlling a local token server.
omitted:
  - section: colors
    reason: Colors are owned by the active VS Code theme.
  - section: typography
    reason: Typography is owned by VS Code native controls.
  - section: spacing
    reason: Layout and popup geometry are owned by VS Code.
  - section: rounded
    reason: Shapes are owned by VS Code native controls.
components:
  status-bar: {}
  server-actions: {}
---

# Copilot Token Bridge Design System

## Overview

The audience is developers using local tools alongside desktop VS Code. Preserve the familiar VS Code utility interface, with the existing English action labels. The HTTP server starts only after a user requests it. The persistent `Copilot Token :<port>` entry is the primary control.

VS Code owns theme colors, typography, spacing, popup layout, hover, focus, keyboard navigation, and reduced-motion treatment. This file records intent; it generates no CSS or theme tokens. `src/extension.ts` implements the native controls.

## Layout

Keep one status bar item on the right, at priority 100. It remains visible in stopped, starting, running, shared, and failed-start states.

## Components

Use `StatusBarItem` for the entry, `showQuickPick` for actions, `showInputBox` for the port, and VS Code notifications for errors. The command palette and status bar use the same handlers.

Create the Output channel for on-demand diagnostics. Extension activation records logs without revealing the Output panel.

Use VS Code Codicons: `circle-outline` for stopped, `loading~spin` for starting, `key` for running, and `link` for shared. Provide a tooltip and accessible text with the state and port.

Offer Start server while stopped and Stop server while owning a server. Shared mode offers Start server to retry ownership and Leave shared mode to disconnect this window. It cannot stop a server owned by another window. Changing the port while stopped updates the entry without starting the service.

Ignore callbacks from superseded or stopped startup attempts. Failed starts return to a visible, retryable stopped state. Dismissing the action picker leaves the service state unchanged.

## Do's and Don'ts

- Keep the entry available after stopping or a failed start.
- Reuse VS Code controls and native accessibility behavior.
- Do not start the service during extension activation or a stopped-state port change.
- Do not label leaving shared mode as stopping another window's server.
