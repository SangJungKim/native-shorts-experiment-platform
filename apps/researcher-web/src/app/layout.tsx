import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Native Shorts Exposure Experiment Platform",
  description: "Author controlled short-video attention experiments",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
