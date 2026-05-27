import Link from 'next/link';
import { Linkedin, ArrowRight, CheckCircle, Lock, Calendar } from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { StatusBadge } from '@poukai-inc/ui/atoms/StatusBadge';
import { Heading } from '@poukai-inc/ui/atoms/Heading';
import { Text } from '@poukai-inc/ui/atoms/Text';
import { Eyebrow } from '@poukai-inc/ui/atoms/Eyebrow';
import { Hero } from '@poukai-inc/ui/molecules/Hero';
import { Section } from '@poukai-inc/ui/molecules/Section';
import { FeatureCard } from '@poukai-inc/ui/molecules/FeatureCard';
import { Statement } from '@poukai-inc/ui/molecules/Statement';

export const metadata = {
  title: 'Pricing — AutoPost',
  description: 'Free during beta. Pricing announced before general availability.',
};

export default function PricingPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <Hero
        entrance="stagger"
        status={<StatusBadge status="available">Free during beta.</StatusBadge>}
        title={<>Pricing, when there is some.</>}
        lede="AutoPost is free while we're in beta. We'll publish pricing before general availability, and everyone who joined the beta is grandfathered into a launch tier."
        cta={
          <Button asChild variant="primary">
            <Link href="/login">
              <Linkedin className="h-5 w-5" />
              Start using AutoPost
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        }
      />

      <Section
        eyebrow="What you get today"
        title="Everything is included while we're in beta."
        lede="No feature gates, no usage caps you'll trip over. Use it like it's already paid for."
      >
        <ul className="mt-12 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<CheckCircle size={24} aria-hidden />}
            title="All features"
            body="Scheduling, drafts, approvals, AI assist, multi-account — everything ships unlocked."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Calendar size={24} aria-hidden />}
            title="Unlimited posts"
            body="Schedule as many posts as LinkedIn's API limits will allow. We don't add caps on top."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Lock size={24} aria-hidden />}
            title="Grandfathered pricing"
            body="When pricing turns on, beta users keep a launch-tier rate. 30-day notice before any change."
          />
        </ul>
      </Section>

      <Section size="tight">
        <Statement
          hairline
          statement="We didn't build this to charge fast. We built it because the LinkedIn scheduling category is full of bloat and we wanted something honest."
          supporting="Pricing will reflect actual cost-to-serve and a small margin on top — not what the category charges for the same plumbing."
        />
      </Section>

      <Section eyebrow="FAQ" title="Pricing, in plain English.">
        <dl className="mt-12 flex flex-col gap-10">
          <div>
            <dt><Heading as="h3" size="h4">When does pricing start?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">We&apos;ll publish tiers and turn on billing before general availability. You&apos;ll get 30 days notice and a one-click choice to stay on the launch tier or downgrade.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">Will there be a free tier after launch?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">Probably — capped at one connected account and a small monthly post quota. Beta users get something better than that.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">What does &quot;grandfathered&quot; actually mean?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">If you signed up during beta and stay on AutoPost continuously, your launch rate is locked in. We won&apos;t raise your price unilaterally to match a future paid tier.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">Can I get a refund if I don&apos;t like the pricing?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">You don&apos;t pay anything in beta, so there&apos;s nothing to refund. After launch, billing is monthly with a no-questions-asked first-month refund window.</Text></dd>
          </div>
        </dl>
      </Section>

      <Section size="tight">
        <div className="flex flex-col items-center gap-6 text-center">
          <Eyebrow>Get started</Eyebrow>
          <Heading as="h2">Try it now while it&apos;s free.</Heading>
          <Text size="lede" tone="muted">
            Connect your LinkedIn account and start scheduling posts in minutes.
          </Text>
          <Button asChild variant="primary">
            <Link href="/login">
              <Linkedin className="h-5 w-5" />
              Connect LinkedIn
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </Section>

    </div>
  );
}
