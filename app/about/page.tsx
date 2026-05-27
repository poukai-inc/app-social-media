import Link from 'next/link';
import { Linkedin, ArrowRight } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { Heading } from '@poukai-inc/ui/atoms/Heading';
import { Text } from '@poukai-inc/ui/atoms/Text';
import { Eyebrow } from '@poukai-inc/ui/atoms/Eyebrow';
import { Hero } from '@poukai-inc/ui/molecules/Hero';
import { Section } from '@poukai-inc/ui/molecules/Section';
import { Statement } from '@poukai-inc/ui/molecules/Statement';
import { Principle } from '@poukai-inc/ui/molecules/Principle';
import { Pull } from '@poukai-inc/ui/molecules/Pull';
import { Footer } from '@poukai-inc/ui/organisms/Footer';

export const metadata = {
  title: 'About — AutoPost',
  description: 'Why we built AutoPost — and what it is not.',
};

export default function AboutPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <Hero
        variant="no-title"
        entrance="stagger"
        eyebrow="About"
        lede="AutoPost is a LinkedIn scheduler built by people who hated using LinkedIn schedulers."
      />

      <Section size="tight">
        <Heading as="h1" size="h1">Why this exists.</Heading>
        <div className="mt-6 max-w-2xl">
          <Text size="lede" tone="muted">
            The LinkedIn scheduling category is a soup of dashboards built for agencies running a hundred accounts. If you're a founder, an operator, or a small team posting from one or two profiles, those tools are noise. Most of what they do is sell you on what they do.
          </Text>
        </div>
      </Section>

      <Section
        eyebrow="What we believe"
        title="The rules we ship by."
        lede="Three things that shape every decision we make about AutoPost."
      >
        <div className="mt-12 flex flex-col gap-12">
          <Principle numeral="i." title="The official API only.">
            <Text tone="muted">
              No scraping. No headless browsers pretending to be you. No "growth hacks" that get accounts flagged. We use LinkedIn's documented endpoints and we wait when LinkedIn says wait.
            </Text>
          </Principle>
          <Principle numeral="ii." title="Default to the smaller screen.">
            <Text tone="muted">
              Most posting happens from a phone or a quick desktop tab between meetings. We don't ship features that only work in a 1600-pixel dashboard. If it doesn't work on a 12-inch laptop on a plane, we ship something else.
            </Text>
          </Principle>
          <Principle numeral="iii." title="Quiet by default.">
            <Text tone="muted">
              No upsell modals. No "Pro feature" badges on the buttons. No notification spam. The job is to get your post live — not to keep you in the app.
            </Text>
          </Principle>
        </div>
      </Section>

      <Section size="tight">
        <Statement
          hairline
          statement="There are dozens of LinkedIn schedulers. Most of them sell you on what they do. We'd rather sell you on what we won't do."
          supporting="No scraping. No agency dashboards you'll never use. No pricing that punishes you for posting more."
        />
      </Section>

      <Section eyebrow="From the founder" title="On consistency.">
        <div className="mt-12 max-w-2xl">
          <Pull
            variant="serif"
            attribution={<>— Founder, <cite>AutoPost</cite></>}
          >
            The compounding stuff happens to people who show up every week for two years. The tool that makes that possible is worth more than the tool that makes one post look perfect.
          </Pull>
        </div>
      </Section>

      <Section size="tight">
        <div className="flex flex-col items-center gap-6 text-center">
          <Eyebrow>Try it</Eyebrow>
          <Heading as="h2">Free during beta. No card required.</Heading>
          <Text size="lede" tone="muted">
            Connect your LinkedIn account and start scheduling posts in minutes.
          </Text>
          <Button asChild variant="primary">
            <Link href="/login">
              <Linkedin className="h-5 w-5" />
              Get started
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </Section>

      <Footer
        as="footer"
        copyright="© 2026 AutoPost"
        email="hello@autopost.app"
        links={[
          { href: '/', label: 'Home' },
          { href: '/pricing', label: 'Pricing' },
          { href: '/login', label: 'Sign in' },
        ]}
      />
    </div>
  );
}
