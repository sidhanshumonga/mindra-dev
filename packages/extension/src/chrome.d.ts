/**
 * The narrow slice of the DevTools extension API this panel uses.
 *
 * Declared locally rather than depending on @types/chrome: the panel touches
 * exactly one API, and keeping the surface this small makes it obvious that the
 * extension cannot reach tabs, storage, cookies or network.
 */
declare namespace chrome.devtools.inspectedWindow {
  function eval<T = unknown>(
    expression: string,
    callback: (result: T, exceptionInfo?: { isError?: boolean; value?: string; isException?: boolean }) => void
  ): void;
}
