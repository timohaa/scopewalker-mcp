import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

/** Per-connection state that tool handlers read. */
export interface ToolContext {
  /** Local directories the client shared as roots, or undefined when it shared none. */
  getClientRoots(): Promise<string[] | undefined>;
}

/** Context for handlers that run without a connected client, such as unit tests. */
export const NO_CLIENT_ROOTS: ToolContext = {
  getClientRoots: () => Promise.resolve(undefined),
};

/** Converts root URIs to paths. The SDK rejects any roots/list result whose URIs are not file://. */
function toLocalPaths(roots: { uri: string }[]): string[] | undefined {
  const paths = roots.map((root) => fileURLToPath(root.uri));
  return paths.length > 0 ? paths : undefined;
}

/**
 * Tracks the roots a client shares, if it declares the roots capability.
 * The list is fetched after initialization and again on every
 * roots/list_changed notification. Handlers await an in-flight fetch, so a
 * tool call made right after the handshake still sees the client's roots.
 */
export function trackClientRoots(server: McpServer): ToolContext {
  let current: Promise<string[] | undefined> = Promise.resolve(undefined);

  const refresh = (): void => {
    current = server.server.listRoots().then(
      ({ roots }) => toLocalPaths(roots),
      (error: unknown) => {
        console.error("Could not list client roots; using the default roots:", error);
        return undefined;
      }
    );
  };

  server.server.oninitialized = (): void => {
    if (server.server.getClientCapabilities()?.roots !== undefined) {
      refresh();
    }
  };
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    refresh();
  });

  return { getClientRoots: () => current };
}
