import type { Metadata } from "next";
import "@poukai-inc/ui/tokens.css";
import "@poukai-inc/ui/styles.css";
import "./dark-tokens.css";
import "./brand-override.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

const BRAND_NAME = process.env.BRAND_NAME ?? "AutoPost";
const BRAND_FAVICON_URL = process.env.BRAND_FAVICON_URL;
const BRAND_PRIMARY = process.env.BRAND_PRIMARY;

export const metadata: Metadata = {
  title: `${BRAND_NAME} - LinkedIn Scheduler`,
  description: `Schedule and automate your LinkedIn posts`,
  icons: BRAND_FAVICON_URL ? { icon: BRAND_FAVICON_URL } : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {BRAND_PRIMARY && (
          <style
            dangerouslySetInnerHTML={{
              __html: `:root{--brand-primary:${BRAND_PRIMARY};}`,
            }}
          />
        )}
      </head>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
