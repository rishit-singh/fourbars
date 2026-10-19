import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import "./editor.css";
export const metadata: Metadata = {
  title: "Fourbars — short melodies",
  description: "Make and share four-bar musical ideas.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Shell>{children}</Shell>
        <Toaster />
      </body>
    </html>
  );
}
