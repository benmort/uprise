import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi, PolicyA } from "@/components/PolicyProse";

export const metadata = {
  title: "Privacy Policy | Uprise",
  description:
    "How Uprise collects, uses, discloses and protects personal information under the Australian Privacy Act 1988 (Cth) and the Australian Privacy Principles.",
};

export default function PrivacyPolicyPage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl mb-8">
              Privacy Policy
            </h1>
            <PolicyProse>
              <PolicyP><strong className="font-semibold">Last updated: 17 July 2026</strong></PolicyP>

              <PolicyH2>Introduction</PolicyH2>
              <PolicyP>
                Uprise Labs Pty Ltd (&quot;Uprise&quot;, &quot;we&quot;, &quot;our&quot; or &quot;us&quot;) is
                committed to protecting your privacy. This Privacy Policy explains how we handle personal
                information in accordance with the <strong className="font-semibold">Privacy Act 1988
                (Cth)</strong> and the <strong className="font-semibold">Australian Privacy Principles
                (APPs)</strong>. It applies to the Uprise platform, websites and related services.
              </PolicyP>
              <PolicyP>
                Uprise is a platform used by organisations (our customers) to run campaigns. Where an
                organisation uses Uprise to manage their supporters&apos; information, that organisation is
                responsible for how they collect and use it; we handle that information on their behalf and
                on their instructions. This policy describes our own handling of personal information.
              </PolicyP>

              <PolicyH2>Information we collect</PolicyH2>
              <PolicyH3>Information you provide</PolicyH3>
              <PolicyP>We may collect personal information you give us directly, including:</PolicyP>
              <PolicyUl>
                <PolicyLi>Name and contact details</PolicyLi>
                <PolicyLi>Email address and mobile number</PolicyLi>
                <PolicyLi>Organisation details</PolicyLi>
                <PolicyLi>Billing information (payments are processed by our payment provider; we do not store full card numbers)</PolicyLi>
                <PolicyLi>Account credentials</PolicyLi>
              </PolicyUl>
              <PolicyH3>Information we collect automatically</PolicyH3>
              <PolicyP>When you use our services we collect certain technical information:</PolicyP>
              <PolicyUl>
                <PolicyLi>Log data and device information</PolicyLi>
                <PolicyLi>Usage patterns and preferences</PolicyLi>
                <PolicyLi>IP address and approximate location</PolicyLi>
                <PolicyLi>Browser type and version</PolicyLi>
              </PolicyUl>
              <PolicyH3>Supporter information handled for our customers</PolicyH3>
              <PolicyP>
                On behalf of our customers we process information about their supporters and contacts (such
                as names, contact details, addresses and engagement history) so those organisations can run
                their campaigns. We handle this information under our customer agreements and only as
                instructed.
              </PolicyP>

              <PolicyH2>How we use your information</PolicyH2>
              <PolicyP>We use personal information to:</PolicyP>
              <PolicyUl>
                <PolicyLi>Provide, maintain and secure our services</PolicyLi>
                <PolicyLi>Process transactions and payments</PolicyLi>
                <PolicyLi>Send service updates and important notifications</PolicyLi>
                <PolicyLi>Improve our platform and user experience</PolicyLi>
                <PolicyLi>Comply with our legal obligations</PolicyLi>
              </PolicyUl>
              <PolicyP>
                We only use personal information for the purposes for which it was collected, for directly
                related purposes you would reasonably expect, or where you have consented or the law
                permits or requires it (APP 6).
              </PolicyP>

              <PolicyH2>Direct marketing</PolicyH2>
              <PolicyP>
                Any marketing communications we send you will include a simple way to opt out, and we will
                stop sending them on request (APP 7). Marketing campaigns run by our customers through
                Uprise are subject to the customer&apos;s own obligations under the Privacy Act, the Spam Act
                2003 (Cth) and the Do Not Call Register Act 2006 (Cth); Uprise honours opt-outs across
                sends made through the platform.
              </PolicyP>

              <PolicyH2>Disclosure of information</PolicyH2>
              <PolicyP>We do not sell your personal information. We may disclose it:</PolicyP>
              <PolicyUl>
                <PolicyLi>With your consent</PolicyLi>
                <PolicyLi>To trusted service providers who help us operate the platform (such as hosting, messaging and payments), under contract</PolicyLi>
                <PolicyLi>Where required or authorised by law</PolicyLi>
                <PolicyLi>To protect the rights, property or safety of Uprise, our customers or others</PolicyLi>
              </PolicyUl>

              <PolicyH2>Overseas disclosure</PolicyH2>
              <PolicyP>
                Some of our service providers may store or process data outside Australia. Where we disclose
                personal information overseas we take reasonable steps to ensure it is handled consistently
                with the APPs (APP 8). We will tell you the countries involved where practicable.
              </PolicyP>

              <PolicyH2>Data security</PolicyH2>
              <PolicyP>We take reasonable steps to protect personal information, including:</PolicyP>
              <PolicyUl>
                <PolicyLi>Encryption of data in transit and at rest</PolicyLi>
                <PolicyLi>Per-organisation data isolation</PolicyLi>
                <PolicyLi>Access controls and authentication</PolicyLi>
                <PolicyLi>Ongoing security review</PolicyLi>
              </PolicyUl>
              <PolicyP>
                If a data breach likely to result in serious harm occurs, we will respond in line with the
                Notifiable Data Breaches scheme under the Privacy Act, including notifying affected
                individuals and the Office of the Australian Information Commissioner (OAIC) where required.
              </PolicyP>

              <PolicyH2>Your rights</PolicyH2>
              <PolicyP>Under the Privacy Act you may:</PolicyP>
              <PolicyUl>
                <PolicyLi>Request access to the personal information we hold about you (APP 12)</PolicyLi>
                <PolicyLi>Ask us to correct information that is inaccurate or out of date (APP 13)</PolicyLi>
                <PolicyLi>Ask us to delete your information, where we are able to</PolicyLi>
                <PolicyLi>Opt out of marketing communications</PolicyLi>
                <PolicyLi>Make a complaint about how we handle your information</PolicyLi>
              </PolicyUl>
              <PolicyP>
                If your information is held by Uprise on behalf of one of our customers, we will refer your
                request to that organisation.
              </PolicyP>

              <PolicyH2>Complaints</PolicyH2>
              <PolicyP>
                If you have a privacy concern, contact us using the details below and we will respond within
                a reasonable time. If you are not satisfied with our response, you can contact the Office of
                the Australian Information Commissioner at{" "}
                <PolicyA href="https://www.oaic.gov.au">oaic.gov.au</PolicyA>.
              </PolicyP>

              <PolicyH2>Contact us</PolicyH2>
              <PolicyP>For questions or requests about this Privacy Policy, contact us at:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@uprise.org.au</PolicyLi>
              </PolicyUl>

              <PolicyH2>Changes to this policy</PolicyH2>
              <PolicyP>
                We may update this Privacy Policy from time to time. We will post the updated policy on this
                page and revise the &quot;Last updated&quot; date above.
              </PolicyP>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
