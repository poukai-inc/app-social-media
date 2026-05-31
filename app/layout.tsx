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

// BRAND_PRIMARY is interpolated into a <style> tag, so validate it against a
// strict CSS-color allowlist (hex / rgb[a] / hsl[a] / keyword). Anything else
// — including a CSS-injection payload — is rejected and the override is
// skipped. Currently a server env var, but this guards future tenant config. (issue #43)
const CSS_COLOR = /^#[0-9a-fA-F]{3,8}$|^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$|^[a-zA-Z]+$/;
const rawBrandPrimary = process.env.BRAND_PRIMARY?.trim();
const BRAND_PRIMARY = rawBrandPrimary && CSS_COLOR.test(rawBrandPrimary) ? rawBrandPrimary : undefined;

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
