import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi } from "@/components/PolicyProse";

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
              <PolicyP><strong className="font-semibold">Last updated: January 2025</strong></PolicyP>

              <PolicyH2>Introduction</PolicyH2>
              <PolicyP>
                Yarns (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.
              </PolicyP>

              <PolicyH2>Information We Collect</PolicyH2>
              <PolicyH3>Personal Information</PolicyH3>
              <PolicyP>We may collect personal information that you provide directly to us, including:</PolicyP>
              <PolicyUl>
                <PolicyLi>Name and contact information</PolicyLi>
                <PolicyLi>Email address and phone number</PolicyLi>
                <PolicyLi>Organisation details</PolicyLi>
                <PolicyLi>Payment information</PolicyLi>
                <PolicyLi>Account credentials</PolicyLi>
              </PolicyUl>
              <PolicyH3>Usage Information</PolicyH3>
              <PolicyP>We automatically collect certain information about your use of our services:</PolicyP>
              <PolicyUl>
                <PolicyLi>Log data and device information</PolicyLi>
                <PolicyLi>Usage patterns and preferences</PolicyLi>
                <PolicyLi>IP address and location data</PolicyLi>
                <PolicyLi>Browser type and version</PolicyLi>
              </PolicyUl>

              <PolicyH2>How We Use Your Information</PolicyH2>
              <PolicyP>We use the information we collect to:</PolicyP>
              <PolicyUl>
                <PolicyLi>Provide and maintain our services</PolicyLi>
                <PolicyLi>Process transactions and payments</PolicyLi>
                <PolicyLi>Send important updates and notifications</PolicyLi>
                <PolicyLi>Improve our platform and user experience</PolicyLi>
                <PolicyLi>Comply with legal obligations</PolicyLi>
              </PolicyUl>

              <PolicyH2>Information Sharing</PolicyH2>
              <PolicyP>We do not sell, trade, or otherwise transfer your personal information to third parties except:</PolicyP>
              <PolicyUl>
                <PolicyLi>With your explicit consent</PolicyLi>
                <PolicyLi>To comply with legal requirements</PolicyLi>
                <PolicyLi>To protect our rights and safety</PolicyLi>
                <PolicyLi>With trusted service providers who assist in our operations</PolicyLi>
              </PolicyUl>

              <PolicyH2>Data Security</PolicyH2>
              <PolicyP>We implement appropriate security measures to protect your personal information:</PolicyP>
              <PolicyUl>
                <PolicyLi>Encryption of sensitive data</PolicyLi>
                <PolicyLi>Regular security assessments</PolicyLi>
                <PolicyLi>Access controls and authentication</PolicyLi>
                <PolicyLi>Secure data transmission</PolicyLi>
              </PolicyUl>

              <PolicyH2>Your Rights</PolicyH2>
              <PolicyP>You have the right to:</PolicyP>
              <PolicyUl>
                <PolicyLi>Access your personal information</PolicyLi>
                <PolicyLi>Correct inaccurate data</PolicyLi>
                <PolicyLi>Request deletion of your data</PolicyLi>
                <PolicyLi>Opt-out of marketing communications</PolicyLi>
                <PolicyLi>Export your data</PolicyLi>
              </PolicyUl>

              <PolicyH2>Contact Us</PolicyH2>
              <PolicyP>If you have questions about this Privacy Policy, please contact us at:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@yarns.org.au</PolicyLi>
              </PolicyUl>

              <PolicyH2>Changes to This Policy</PolicyH2>
              <PolicyP>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              </PolicyP>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
