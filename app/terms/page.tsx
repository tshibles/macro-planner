import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalH2 } from "@/app/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Campus Macros",
  description: "The terms that govern your use of Campus Macros.",
};

const CONTACT_EMAIL = "campusmacros@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="June 12, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of Campus Macros
        (&quot;the Service&quot;), a meal-planning service operated by an individual sole
        proprietor in the United States (&quot;we,&quot; &quot;us&quot;). By creating an
        account or using the Service you agree to these Terms and to our{" "}
        <Link href="/privacy" className="text-brand-700 font-semibold hover:underline">Privacy Policy</Link>.
        If you do not agree, do not use the Service. Contact: <strong>{CONTACT_EMAIL}</strong>.
      </p>

      <LegalH2>1. The Service</LegalH2>
      <p>
        Campus Macros generates personalized meal plans, calorie/macro targets, meal-prep
        guides, and grocery lists based on the budget, body metrics, goals, and dietary
        preferences you provide. Grocery prices are estimates based on regional averages
        and real prices at your store will differ. The Service is provided{" "}
        <strong>&quot;as is&quot; and &quot;as available,&quot;</strong> without warranties
        of any kind, express or implied, including fitness for a particular purpose,
        accuracy, or uninterrupted availability.
      </p>

      <LegalH2>2. Not medical, dietary, or health advice</LegalH2>
      <p>
        <strong>
          Campus Macros provides general nutritional and meal-planning information for
          convenience and educational purposes only. It is not medical advice, dietary
          advice, or health advice, and it is not a substitute for guidance from a
          physician, registered dietitian, or other qualified healthcare professional.
        </strong>{" "}
        Calorie targets, macro targets, and weight-change estimates are computed from
        general formulas and may not be appropriate for your individual circumstances.
        Consult a healthcare professional before starting any diet, changing your caloric
        intake, or acting on any information from the Service — especially if you are under
        18, pregnant or nursing, have an eating disorder or history of one, have a medical
        condition, or take medication. Recipes may contain or contact allergens; always
        verify ingredients yourself. You use the Service&apos;s nutritional information at
        your own risk.
      </p>

      <LegalH2>3. Accounts and eligibility</LegalH2>
      <p>
        You must be at least 13 years old and located in the United States to use the
        Service. You are responsible for your account credentials and for all activity
        under your account. Provide accurate information — plans generated from inaccurate
        metrics will be inaccurate.
      </p>

      <LegalH2>4. Plans, billing, and refunds</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Free trial:</strong> one 7-day trial per account, no payment method
          required.
        </li>
        <li>
          <strong>Paid plans:</strong> Monthly ($8 for 30 days of access) and Annual ($60
          for 365 days of access), billed via Stripe.{" "}
          <strong>Payments are one-time purchases, not auto-renewing subscriptions</strong> —
          your access simply expires at the end of the period unless you choose to purchase
          again, so there is nothing to cancel.
        </li>
        <li>
          <strong>Refunds:</strong> if you&apos;re unhappy with a purchase, email{" "}
          <strong>{CONTACT_EMAIL}</strong> within 7 days of payment and we will refund it in
          full. After 7 days, purchases are non-refundable except where required by law.
          Refunds are returned to the original payment method via Stripe.
        </li>
        <li>Prices may change; changes never affect access you have already purchased.</li>
      </ul>

      <LegalH2>5. Acceptable use</LegalH2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>share accounts or resell access to the Service;</li>
        <li>scrape, crawl, or bulk-extract recipes, plans, or other content, or access the Service with automated tools beyond normal personal use;</li>
        <li>probe, overload, disrupt, or attempt to bypass security or rate limits;</li>
        <li>misuse the support chat (abuse, attempts to extract unrelated AI output, or submitting others&apos; personal data);</li>
        <li>use the Service for any unlawful purpose or to infringe others&apos; rights.</li>
      </ul>

      <LegalH2>6. Termination</LegalH2>
      <p>
        You may stop using the Service and request account deletion at any time. We may
        suspend or terminate accounts that violate these Terms, abuse the Service, or
        create risk for us or other users — with a refund of unused paid access unless the
        termination is for a material violation. Sections that by their nature should
        survive termination (disclaimers, liability limits, indemnification) survive.
      </p>

      <LegalH2>7. Intellectual property</LegalH2>
      <p>
        The Service, including its recipes, plans, design, and software, is owned by us or
        our licensors. We grant you a personal, non-exclusive, non-transferable license to
        use generated plans and grocery lists for your own household&apos;s personal use.
      </p>

      <LegalH2>8. Limitation of liability</LegalH2>
      <p>
        To the maximum extent permitted by law: (a) we are not liable for indirect,
        incidental, special, consequential, or punitive damages, or for lost profits, data,
        or goodwill; (b) we are not liable for personal injury, health outcomes, or
        allergic reactions arising from your dietary choices, which remain your
        responsibility (see Section 2); and (c){" "}
        <strong>
          our total liability for all claims arising out of or relating to the Service is
          limited to the amount you paid us in the 12 months before the claim arose
        </strong>{" "}
        (or $10 if you paid nothing). Some jurisdictions do not allow certain limitations,
        so parts of this section may not apply to you.
      </p>

      <LegalH2>9. Indemnification</LegalH2>
      <p>
        You agree to indemnify and hold us harmless from claims, damages, and reasonable
        expenses (including attorneys&apos; fees) arising from your violation of these
        Terms, your misuse of the Service, or your violation of any law or third-party
        right.
      </p>

      <LegalH2>10. Changes to the Service or Terms</LegalH2>
      <p>
        We may modify or discontinue features at any time. We may update these Terms;
        material changes will be posted here with an updated &quot;Last updated&quot; date
        and may be announced by email. Continued use after changes take effect constitutes
        acceptance of the updated Terms.
      </p>

      <LegalH2>11. Governing law and disputes</LegalH2>
      <p>
        These Terms are governed by the laws of the United States and the State of
        Rhode Island, without regard to conflict-of-law rules. Disputes will be resolved in the
        state or federal courts located in Rhode Island, and you consent to their jurisdiction.
        Before filing any claim, you agree to contact <strong>{CONTACT_EMAIL}</strong> and
        attempt to resolve the dispute informally for 30 days.
      </p>

      <LegalH2>12. Contact</LegalH2>
      <p>
        Questions about these Terms: <strong>{CONTACT_EMAIL}</strong>.
      </p>
    </LegalPage>
  );
}
