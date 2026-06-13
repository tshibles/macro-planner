import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalH2, LegalH3 } from "@/app/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — Campus Macros",
  description: "How Campus Macros collects, uses, and protects your data.",
};

const CONTACT_EMAIL = "campusmacros@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="June 12, 2026">
      <p>
        Campus Macros (&quot;we,&quot; &quot;us,&quot; or &quot;the Service&quot;) is a meal-planning
        service operated by an individual sole proprietor in the United States. This policy
        explains what information we collect, how we use it, who we share it with, and the
        choices you have. By using Campus Macros you agree to this policy. Questions or
        requests can be sent to <strong>{CONTACT_EMAIL}</strong>.
      </p>

      <LegalH2>1. Information we collect</LegalH2>
      <LegalH3>Account information</LegalH3>
      <p>
        Your email address and, if you sign in with Google, your name as provided by your
        Google account. Authentication is handled by Supabase; we never see or store your
        password in readable form, and Google sign-in is handled by Google.
      </p>
      <LegalH3>Health and fitness information</LegalH3>
      <p>
        To build your meal plan you may provide weight, height, age, biological sex,
        activity level, a goal weight and timeframe, dietary restrictions (e.g. vegetarian,
        vegan, gluten-free), and food allergies. We recognize this is{" "}
        <strong>sensitive, health-related information</strong> and we collect it only to
        compute your calorie and macro targets and generate meal plans you asked for. We do
        not sell it, use it for advertising, or share it except with the service providers
        listed below as needed to run the Service.
      </p>
      <LegalH3>Plan and preference data</LegalH3>
      <p>
        Your weekly grocery budget, household size, US state (used to estimate local
        grocery prices), generated plans and grocery lists, meal likes/dislikes, and meal
        swaps.
      </p>
      <LegalH3>Payment information</LegalH3>
      <p>
        Payments are processed entirely by Stripe. <strong>We never receive or store your
        card number.</strong> Our database stores only your plan tier, its expiration date,
        and a Stripe checkout-session reference ID.
      </p>
      <LegalH3>Support conversations</LegalH3>
      <p>
        If you use the in-app support chat, the messages you type are processed by
        Anthropic&apos;s AI API to understand your issue, and the conversation transcript
        (with your email and basic account info) is emailed to our support inbox so a human
        can follow up. Please don&apos;t type passwords or full card numbers into the chat —
        the assistant will never ask for them.
      </p>
      <LegalH3>Usage data and analytics</LegalH3>
      <p>
        We use PostHog to understand how the Service is used: page views, product events
        (e.g. signing up, generating a plan, starting checkout), and, once you have an
        account, an analytics profile identified by your account ID and email. We also
        process IP addresses transiently for security rate limiting.
      </p>

      <LegalH2>2. How we use your information</LegalH2>
      <p>
        We use your information to: (a) create and maintain your account; (b) compute
        calorie/macro targets and generate meal plans and grocery lists; (c) process
        payments and determine your access level; (d) send transactional and onboarding
        emails; (e) respond to support requests; (f) understand product usage and improve
        the Service; and (g) protect the Service from abuse. We do <strong>not</strong> sell
        your personal information, and we do not use your health information for
        advertising.
      </p>

      <LegalH2>3. Service providers we share data with</LegalH2>
      <p>
        We use a small set of service providers (&quot;sub-processors&quot;) to operate
        Campus Macros. Each receives only what it needs:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong>Supabase</strong> — database and authentication. Stores your account, health/preference data, plans, and subscription records.</li>
        <li><strong>Stripe</strong> — payment processing. Receives your payment details directly; we never see card numbers.</li>
        <li><strong>PostHog</strong> — product analytics, including profiles identified by your email and account ID, page views, and product events.</li>
        <li><strong>Loops</strong> — onboarding/marketing email. Receives your email address (and first name, if available) when you sign up.</li>
        <li><strong>Resend</strong> — transactional email delivery, including support-ticket emails containing your support conversation.</li>
        <li><strong>Anthropic</strong> — AI processing for the support chat. Your chat messages and basic account context are sent to Anthropic&apos;s API to generate responses.</li>
        <li><strong>USDA FoodData Central</strong> — public nutrition database. Receives only recipe-name search queries, never your personal data.</li>
        <li><strong>Upstash</strong> — security rate limiting. Processes IP addresses transiently.</li>
        <li><strong>Vercel</strong> — application hosting; processes requests (including IP addresses) to serve the site.</li>
      </ul>
      <p>
        We may also disclose information if required by law, or to protect the rights,
        safety, or property of users or the Service.
      </p>

      <LegalH2>4. Cookies and similar technologies</LegalH2>
      <p>
        We use essential cookies to keep you signed in (Supabase authentication), and
        PostHog uses cookies/local storage to recognize your browser for analytics. We do
        not use third-party advertising cookies. You can clear cookies in your browser at
        any time; doing so will sign you out.
      </p>

      <LegalH2>5. Data retention and deletion</LegalH2>
      <p>
        We keep your account and plan data for as long as your account exists so the
        Service works when you return. Support transcripts are retained in our support
        inbox. Analytics data is retained per PostHog&apos;s standard retention. You can
        request deletion of your account and associated personal data at any time by
        emailing <strong>{CONTACT_EMAIL}</strong> from your account email — we will delete
        your data from our systems and direct our service providers to do the same, except
        for records we must keep for legal, tax, or fraud-prevention purposes (e.g. Stripe
        payment records).
      </p>

      <LegalH2>6. Security</LegalH2>
      <p>
        Data is stored with Supabase using row-level security so each account can only
        access its own records; payment credentials never touch our systems; and access to
        production data is limited to the operator. No internet service can guarantee
        perfect security, but we work to protect your information with industry-standard
        practices.
      </p>

      <LegalH2>7. US-only service; children</LegalH2>
      <p>
        Campus Macros is offered to users in the United States only and is not directed at
        children. <strong>You must be at least 13 years old to use the Service</strong>, and
        we do not knowingly collect personal information from children under 13. If you
        believe a child under 13 has provided us personal information, contact{" "}
        <strong>{CONTACT_EMAIL}</strong> and we will delete it.
      </p>

      <LegalH2>8. Your choices</LegalH2>
      <p>
        You can update your preferences and health metrics on the Settings page, request a
        copy or deletion of your data via <strong>{CONTACT_EMAIL}</strong>, and opt out of
        non-essential emails using the unsubscribe link in any marketing email.
      </p>

      <LegalH2>9. Changes to this policy</LegalH2>
      <p>
        We may update this policy as the Service evolves. Material changes will be posted
        here with an updated &quot;Last updated&quot; date, and significant changes may also
        be announced by email. Continued use after changes take effect constitutes
        acceptance.
      </p>

      <p className="pt-6">
        See also our <Link href="/terms" className="text-brand-700 font-semibold hover:underline">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
