import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi } from "@/components/PolicyProse";

export default function TermsOfServicePage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl mb-8">
              Terms of Service
            </h1>
            <PolicyProse>
              <PolicyP><strong className="font-semibold">Last updated: January 2025</strong></PolicyP>

              <PolicyH2>Agreement to Terms</PolicyH2>
              <PolicyP>
                By accessing and using Yarns&apos;s platform and services, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you disagree with any part of these terms, you may not access our services.
              </PolicyP>

              <PolicyH2>Description of Service</PolicyH2>
              <PolicyP>
                Yarns provides an enterprise-grade multi-tenant SaaS platform for progressive organisations, including:
              </PolicyP>
              <PolicyUl>
                <PolicyLi>Campaign management tools</PolicyLi>
                <PolicyLi>User authentication and authorization</PolicyLi>
                <PolicyLi>Payment processing capabilities</PolicyLi>
                <PolicyLi>Analytics and reporting features</PolicyLi>
                <PolicyLi>API access and integrations</PolicyLi>
              </PolicyUl>

              <PolicyH2>User Accounts</PolicyH2>
              <PolicyH3>Account Creation</PolicyH3>
              <PolicyUl>
                <PolicyLi>You must provide accurate and complete information when creating an account</PolicyLi>
                <PolicyLi>You are responsible for maintaining the security of your account credentials</PolicyLi>
                <PolicyLi>You must be at least 18 years old to create an account</PolicyLi>
              </PolicyUl>
              <PolicyH3>Account Responsibilities</PolicyH3>
              <PolicyUl>
                <PolicyLi>You are responsible for all activities that occur under your account</PolicyLi>
                <PolicyLi>You must notify us immediately of any unauthorized use</PolicyLi>
                <PolicyLi>You may not share your account credentials with others</PolicyLi>
              </PolicyUl>

              <PolicyH2>Acceptable Use</PolicyH2>
              <PolicyH3>Permitted Uses</PolicyH3>
              <PolicyUl>
                <PolicyLi>Using the service for its intended purpose</PolicyLi>
                <PolicyLi>Complying with all applicable laws and regulations</PolicyLi>
                <PolicyLi>Respecting the rights of other users</PolicyLi>
              </PolicyUl>
              <PolicyH3>Prohibited Uses</PolicyH3>
              <PolicyUl>
                <PolicyLi>Violating any applicable laws or regulations</PolicyLi>
                <PolicyLi>Attempting to gain unauthorized access to our systems</PolicyLi>
                <PolicyLi>Interfering with the service or other users</PolicyLi>
                <PolicyLi>Using the service for illegal or harmful purposes</PolicyLi>
              </PolicyUl>

              <PolicyH2>Payment Terms</PolicyH2>
              <PolicyH3>Subscription Fees</PolicyH3>
              <PolicyUl>
                <PolicyLi>Subscription fees are billed in advance on a recurring basis</PolicyLi>
                <PolicyLi>All fees are non-refundable except as required by law</PolicyLi>
                <PolicyLi>We may change our pricing with 30 days&apos; notice</PolicyLi>
              </PolicyUl>
              <PolicyH3>Payment Processing</PolicyH3>
              <PolicyUl>
                <PolicyLi>Payments are processed through secure third-party providers</PolicyLi>
                <PolicyLi>You authorize us to charge your payment method for all fees</PolicyLi>
                <PolicyLi>Failed payments may result in service suspension</PolicyLi>
              </PolicyUl>

              <PolicyH2>Intellectual Property</PolicyH2>
              <PolicyH3>Our Rights</PolicyH3>
              <PolicyUl>
                <PolicyLi>The service and its content are owned by Yarns</PolicyLi>
                <PolicyLi>All trademarks, logos, and brand names are our property</PolicyLi>
                <PolicyLi>You may not use our intellectual property without permission</PolicyLi>
              </PolicyUl>
              <PolicyH3>Your Content</PolicyH3>
              <PolicyUl>
                <PolicyLi>You retain ownership of content you upload</PolicyLi>
                <PolicyLi>You grant us a license to use your content to provide the service</PolicyLi>
                <PolicyLi>You are responsible for ensuring you have rights to your content</PolicyLi>
              </PolicyUl>

              <PolicyH2>Limitation of Liability</PolicyH2>
              <PolicyP>To the maximum extent permitted by law:</PolicyP>
              <PolicyUl>
                <PolicyLi>We are not liable for indirect, incidental, or consequential damages</PolicyLi>
                <PolicyLi>Our total liability is limited to the amount you paid for the service</PolicyLi>
                <PolicyLi>We disclaim all warranties except as required by law</PolicyLi>
              </PolicyUl>

              <PolicyH2>Termination</PolicyH2>
              <PolicyH3>By You</PolicyH3>
              <PolicyUl>
                <PolicyLi>You may cancel your account at any time</PolicyLi>
                <PolicyLi>Cancellation takes effect at the end of your billing period</PolicyLi>
              </PolicyUl>
              <PolicyH3>By Us</PolicyH3>
              <PolicyUl>
                <PolicyLi>We may terminate your account for violations of these terms</PolicyLi>
                <PolicyLi>We will provide reasonable notice before termination</PolicyLi>
                <PolicyLi>Upon termination, your access to the service will cease</PolicyLi>
              </PolicyUl>

              <PolicyH2>Governing Law</PolicyH2>
              <PolicyP>
                These Terms are governed by the laws of New South Wales, Australia. Any disputes will be resolved in the courts of New South Wales, Australia.
              </PolicyP>

              <PolicyH2>Contact Information</PolicyH2>
              <PolicyP>For questions about these Terms, contact us at:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@yarns.org.au</PolicyLi>
              </PolicyUl>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
