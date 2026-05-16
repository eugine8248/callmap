// Inline HTML template for the callmap webview. Kept in TypeScript so
// we don't need a separate file watcher / bundler step for the shell.
//
// CSP notes:
//   * `${cspSource}` is VS Code's resolved webview origin — required
//     to load any media/ asset.
//   * inline script for the synchronous theme apply uses the nonce.
//   * `connect-src` is intentionally limited to the webview origin
//     because all GitHub traffic is proxied through the extension host.
//   * wasm-eval is required for web-tree-sitter's runtime; VS Code's
//     CSP grammar accepts `'wasm-unsafe-eval'` since 1.78.

export interface WebviewHtmlOptions {
  scriptUri: string;
  stylesUri: string;
  cspSource: string;
  nonce: string;
}

export function webviewHtml(opts: WebviewHtmlOptions): string {
  const { scriptUri, stylesUri, cspSource, nonce } = opts;
  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      img-src ${cspSource} data:;
      style-src ${cspSource} 'unsafe-inline';
      font-src ${cspSource};
      script-src 'nonce-${nonce}' ${cspSource} 'wasm-unsafe-eval';
      worker-src ${cspSource} blob:;
      connect-src ${cspSource};
    " />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>callmap</title>
    <link rel="stylesheet" href="${stylesUri}" />
    <script nonce="${nonce}">
      // Optimistic theme apply (overwritten when the extension sends 'init').
      // We start in dark to match the most common VS Code default; the
      // host will broadcast the resolved theme within the first tick.
      document.documentElement.setAttribute("data-theme", "dark");
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
