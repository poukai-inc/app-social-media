import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Linkedin,
  Calendar,
  Clock,
  Send,
  BarChart3,
  Shield,
  ArrowRight,
  Sparkles,
  Users,
  Briefcase,
  Megaphone,
} from 'lucide-react';
import { Button } from '@poukai-inc/ui/atoms/Button';
import { StatusBadge } from '@poukai-inc/ui/atoms/StatusBadge';
import { Heading } from '@poukai-inc/ui/atoms/Heading';
import { Text } from '@poukai-inc/ui/atoms/Text';
import { Eyebrow } from '@poukai-inc/ui/atoms/Eyebrow';
import { Hero } from '@poukai-inc/ui/molecules/Hero';
import { Section } from '@poukai-inc/ui/molecules/Section';
import { FeatureCard } from '@poukai-inc/ui/molecules/FeatureCard';
import { Statement } from '@poukai-inc/ui/molecules/Statement';
import { Quote } from '@poukai-inc/ui/molecules/Quote';
import { Pull } from '@poukai-inc/ui/molecules/Pull';
import { Principle } from '@poukai-inc/ui/molecules/Principle';
import { RoleCard } from '@poukai-inc/ui/molecules/RoleCard';
import { Footer } from '@poukai-inc/ui/organisms/Footer';

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <Hero
        entrance="stagger"
        status={<StatusBadge status="available">Now in beta · Free during launch.</StatusBadge>}
        title={
          <>
            Schedule &amp; automate your <em>LinkedIn</em> posts.
          </>
        }
        lede="Create, schedule, and auto-publish your LinkedIn content. Save hours each week, stay consistent, and grow your professional presence — without the manual grind."
        cta={
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="primary">
              <Link href="/login">
                <Linkedin className="h-5 w-5" />
                Get started free
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        }
      />

      <Section
        eyebrow="Features"
        title="Everything you need to run LinkedIn on autopilot."
        lede="Simple, powerful tools so you can stay active on LinkedIn without burning your week on it."
      >
        <ul className="mt-12 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Calendar size={24} aria-hidden />}
            title="Schedule posts"
            body="Plan content in advance. Drop posts into the time slots that actually convert for your audience."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Send size={24} aria-hidden />}
            title="Auto-publish"
            body="Set it and forget it. Your posts ship to LinkedIn at the scheduled time — no copy-paste."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Clock size={24} aria-hidden />}
            title="Drafts & approvals"
            body="Save drafts, share for review, and approve before they go live. Mistakes stay private."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<BarChart3 size={24} aria-hidden />}
            title="Track everything"
            body="Monitor scheduled, published, and failed posts in one place. Always know what's next on the queue."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Shield size={24} aria-hidden />}
            title="Secure by default"
            body="Official LinkedIn OAuth — we never see your password. Tokens encrypted at rest, revocable any time."
          />
          <FeatureCard
            as="li"
            variant="bordered"
            icon={<Sparkles size={24} aria-hidden />}
            title="LinkedIn-native"
            body="Built on the official LinkedIn API. Posts render natively — no third-party watermarks, no rate-limit games."
          />
        </ul>
      </Section>

      <Section
        id="how-it-works"
        eyebrow="How it works"
        title="Three steps from blank page to scheduled queue."
        lede="The fastest path between an idea and a live LinkedIn post."
      >
        <div className="mt-12 flex flex-col gap-12">
          <Principle numeral="i." title="Connect LinkedIn.">
            <Text tone="muted">
              One OAuth click. We never ask for your password — LinkedIn issues a scoped token we can revoke any time.
            </Text>
          </Principle>
          <Principle numeral="ii." title="Draft your post.">
            <Text tone="muted">
              Write in our composer or paste from your notes. Preview exactly how it will look on the LinkedIn feed before you commit.
            </Text>
          </Principle>
          <Principle numeral="iii." title="Schedule and walk away.">
            <Text tone="muted">
              Pick a slot — or let us suggest one based on your audience activity. Your post ships automatically, and you get a confirmation when it lands.
            </Text>
          </Principle>
        </div>
      </Section>

      <Section size="tight">
        <Statement
          hairline
          statement="LinkedIn rewards consistency. Most people lose to it because posting is a chore."
          supporting="AutoPost is the boring tool that makes the consistency happen — so the only thing left is what you actually want to say."
        />
      </Section>

      <Section
        eyebrow="Who it's for"
        title="Built for the people whose pipeline runs on LinkedIn."
        lede="Different roles, same problem: the post you didn't write is the lead you didn't get."
      >
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <RoleCard
            icon={<Briefcase size={28} aria-hidden />}
            eyebrow="Role 01"
            title="Founders"
            body="Build the personal brand that funnels intro requests, hires, and customers — without the 9pm scramble."
            hiredBy="Pre-seed · Seed · Series A"
          />
          <RoleCard
            icon={<Megaphone size={28} aria-hidden />}
            eyebrow="Role 02"
            title="Marketers"
            body="Manage executive ghostwriting and brand accounts from one queue. Approvals, history, attribution — all in one place."
            hiredBy="B2B SaaS · Agencies · Consultancies"
          />
          <RoleCard
            icon={<Users size={28} aria-hidden />}
            eyebrow="Role 03"
            title="Sales leaders"
            body="Turn outbound effort into inbound flow. Post the playbook, scale the rep behind it, watch the meetings fill."
            hiredBy="AE teams · BDR orgs · Solo founders"
          />
        </div>
      </Section>

      <Section eyebrow="Customers" title="What early users say.">
        <div className="mt-12 grid gap-12 md:grid-cols-2">
          <Quote
            quote="I used to spend Sunday nights writing the week's posts and forgetting half of them by Wednesday. AutoPost gave me Sundays back."
            name="Maya Okafor"
            role="Founder, Quartz Labs"
          />
          <Quote
            quote="We run three executive LinkedIn accounts off one queue now. Approvals don't slip through Slack anymore."
            name="Dan Reyes"
            role="Head of Marketing, Linecode"
          />
        </div>
        <div className="mt-16">
          <Pull
            variant="serif"
            attribution={<>— Ana Whitfield, <cite>Solo founder</cite></>}
          >
            The first scheduler I&apos;ve used that doesn&apos;t make my LinkedIn posts look like they came from a scheduler.
          </Pull>
        </div>
      </Section>

      <Section
        eyebrow="FAQ"
        title="Questions, answered."
      >
        <dl className="mt-12 flex flex-col gap-10">
          <div>
            <dt><Heading as="h3" size="h4">Is it really free during beta?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">Yes. No card required. We&apos;ll give 30 days notice before pricing turns on, and you&apos;ll be grandfathered into a launch tier.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">Do you use unofficial LinkedIn APIs?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">No. Everything runs through LinkedIn&apos;s official OAuth and posting API. Your account stays safe — no bans, no rate-limit roulette.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">Can I edit a scheduled post?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">Until it ships, yes — edit text, reschedule, or cancel from the queue. After it&apos;s live, you update it on LinkedIn directly.</Text></dd>
          </div>
          <div>
            <dt><Heading as="h3" size="h4">What if a post fails to publish?</Heading></dt>
            <dd className="mt-2"><Text tone="muted">We retry automatically, then surface a clear error with a one-click re-queue. You won&apos;t find out three days later that nothing went out.</Text></dd>
          </div>
        </dl>
      </Section>

      <Section size="tight">
        <div className="flex flex-col items-center gap-6 text-center">
          <Eyebrow>Get started</Eyebrow>
          <Heading as="h2">Ready to automate your LinkedIn presence?</Heading>
          <Text size="lede" tone="muted">
            Connect your LinkedIn account and start scheduling posts in minutes. Free during beta.
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

      <Footer
        as="footer"
        copyright="© 2026 AutoPost"
        email="hello@autopost.app"
        links={[
          { href: '/pricing', label: 'Pricing' },
          { href: '/about', label: 'About' },
          { href: '#how-it-works', label: 'How it works' },
          { href: '/login', label: 'Sign in' },
        ]}
      />
    </div>
  );
}
