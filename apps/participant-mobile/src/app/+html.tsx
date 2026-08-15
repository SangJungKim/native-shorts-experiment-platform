import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        <meta content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" name="viewport" />
        <meta content="#111111" name="theme-color" />
        <meta content="yes" name="mobile-web-app-capable" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="black-translucent" name="apple-mobile-web-app-status-bar-style" />
        <meta content="Native Shorts Participant" name="apple-mobile-web-app-title" />
        <title>Native Shorts Participant</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `html, body, #root { background: #111; height: 100%; margin: 0; overflow: hidden; }` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
