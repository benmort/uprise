import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi, PolicyA } from "@/components/PolicyProse";

export default function DonationsPolicyPage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl mb-8">
              Donations Policy
            </h1>
            <PolicyProse>
              <PolicyP><strong className="font-semibold">Last updated: 17 July 2026</strong></PolicyP>

              <PolicyH2>Overview</PolicyH2>
              <PolicyP>
                This Donations Policy outlines how Uprise handles donations, contributions, and financial support for our platform and services.
              </PolicyP>

              <PolicyH2>Types of Donations</PolicyH2>
              <PolicyH3>Platform Donations</PolicyH3>
              <PolicyP>We accept donations to support the development and maintenance of our platform:</PolicyP>
              <PolicyUl>
                <PolicyLi>One-time donations</PolicyLi>
                <PolicyLi>Recurring monthly donations</PolicyLi>
                <PolicyLi>Annual contributions</PolicyLi>
                <PolicyLi>Corporate sponsorships</PolicyLi>
              </PolicyUl>
              <PolicyH3>Campaign Support</PolicyH3>
              <PolicyP>Organisations may receive donations through our platform:</PolicyP>
              <PolicyUl>
                <PolicyLi>Direct campaign contributions</PolicyLi>
                <PolicyLi>Fundraising event support</PolicyLi>
                <PolicyLi>Matching gift programs</PolicyLi>
                <PolicyLi>Corporate partnerships</PolicyLi>
              </PolicyUl>
              <blockquote className="border-l-4 border-gray-200 pl-4 italic text-gray-700 mb-4">
                <strong className="font-semibold">Note:</strong> For political donations and campaign finance compliance information, including gift caps, disclosure requirements, and regulatory compliance, please see our{" "}
                <PolicyA href="/compliance">Compliance Policy</PolicyA>.
              </blockquote>

              <PolicyH2>Donation Processing</PolicyH2>
              <PolicyH3>Payment Methods</PolicyH3>
              <PolicyP>We accept donations through various payment methods:</PolicyP>
              <PolicyUl>
                <PolicyLi>Credit and debit cards</PolicyLi>
                <PolicyLi>Bank transfers</PolicyLi>
                <PolicyLi>Digital wallets</PolicyLi>
                <PolicyLi>Cryptocurrency (where applicable)</PolicyLi>
              </PolicyUl>
              <PolicyH3>Processing Fees</PolicyH3>
              <PolicyUl>
                <PolicyLi>Standard payment processing fees apply</PolicyLi>
                <PolicyLi>Platform fees may be deducted from donations</PolicyLi>
                <PolicyLi>Transparent fee structure is provided before donation</PolicyLi>
              </PolicyUl>

              <PolicyH2>Tax Information</PolicyH2>
              <PolicyH3>Tax Deductibility</PolicyH3>
              <PolicyUl>
                <PolicyLi>Donations to Uprise may be tax-deductible</PolicyLi>
                <PolicyLi>Consult with your tax advisor for specific guidance</PolicyLi>
                <PolicyLi>We provide donation receipts for tax purposes</PolicyLi>
              </PolicyUl>
              <PolicyH3>Receipts and Documentation</PolicyH3>
              <PolicyUl>
                <PolicyLi>Automatic receipts are sent via email</PolicyLi>
                <PolicyLi>Annual donation summaries are available</PolicyLi>
                <PolicyLi>Detailed records are maintained for tax purposes</PolicyLi>
              </PolicyUl>

              <PolicyH2>Use of Donations</PolicyH2>
              <PolicyH3>Platform Development</PolicyH3>
              <PolicyP>Donations support:</PolicyP>
              <PolicyUl>
                <PolicyLi>Platform maintenance and updates</PolicyLi>
                <PolicyLi>Feature development and improvements</PolicyLi>
                <PolicyLi>Security enhancements</PolicyLi>
                <PolicyLi>Infrastructure costs</PolicyLi>
              </PolicyUl>
              <PolicyH3>Community Support</PolicyH3>
              <PolicyP>Funds may be used for:</PolicyP>
              <PolicyUl>
                <PolicyLi>Educational programs and resources</PolicyLi>
                <PolicyLi>Community outreach initiatives</PolicyLi>
                <PolicyLi>Support for smaller organisations</PolicyLi>
                <PolicyLi>Emergency assistance programs</PolicyLi>
              </PolicyUl>

              <PolicyH2>Transparency and Accountability</PolicyH2>
              <PolicyH3>Financial Reporting</PolicyH3>
              <PolicyUl>
                <PolicyLi>Annual financial reports are published</PolicyLi>
                <PolicyLi>Donation allocation is transparent</PolicyLi>
                <PolicyLi>Regular updates on fund usage</PolicyLi>
                <PolicyLi>Independent audits when required</PolicyLi>
              </PolicyUl>
              <PolicyH3>Donor Privacy</PolicyH3>
              <PolicyUl>
                <PolicyLi>Donor information is kept confidential</PolicyLi>
                <PolicyLi>We do not sell or share donor lists</PolicyLi>
                <PolicyLi>Opt-out options for communications</PolicyLi>
                <PolicyLi>Respect for donor preferences</PolicyLi>
              </PolicyUl>

              <PolicyH2>Refund Policy</PolicyH2>
              <PolicyH3>Refund Requests</PolicyH3>
              <PolicyUl>
                <PolicyLi>Refund requests are reviewed on a case-by-case basis</PolicyLi>
                <PolicyLi>
                  Valid reasons for refunds include:
                  <PolicyUl>
                    <PolicyLi>Processing errors</PolicyLi>
                    <PolicyLi>Duplicate donations</PolicyLi>
                    <PolicyLi>Fraudulent transactions</PolicyLi>
                  </PolicyUl>
                </PolicyLi>
                <PolicyLi>Refunds are processed within 30 days</PolicyLi>
              </PolicyUl>
              <PolicyH3>Processing Time</PolicyH3>
              <PolicyUl>
                <PolicyLi>Refunds are processed to the original payment method</PolicyLi>
                <PolicyLi>Processing time depends on the payment provider</PolicyLi>
                <PolicyLi>Donors are notified when refunds are processed</PolicyLi>
              </PolicyUl>

              <PolicyH2>Corporate Donations</PolicyH2>
              <PolicyH3>Corporate Sponsorship</PolicyH3>
              <PolicyUl>
                <PolicyLi>Corporate sponsorships are available</PolicyLi>
                <PolicyLi>Custom sponsorship packages</PolicyLi>
                <PolicyLi>Brand recognition opportunities</PolicyLi>
                <PolicyLi>Partnership benefits</PolicyLi>
              </PolicyUl>
              <PolicyH3>Matching Gifts</PolicyH3>
              <PolicyUl>
                <PolicyLi>Many employers offer matching gift programs</PolicyLi>
                <PolicyLi>We work with corporate matching programs</PolicyLi>
                <PolicyLi>Documentation provided for matching requests</PolicyLi>
              </PolicyUl>

              <PolicyH2>International Donations</PolicyH2>
              <PolicyH3>Currency Support</PolicyH3>
              <PolicyUl>
                <PolicyLi>Multiple currencies are supported</PolicyLi>
                <PolicyLi>Exchange rates are clearly displayed</PolicyLi>
                <PolicyLi>International payment methods accepted</PolicyLi>
              </PolicyUl>
              <PolicyH3>Compliance</PolicyH3>
              <PolicyUl>
                <PolicyLi>We comply with international donation regulations</PolicyLi>
                <PolicyLi>Tax implications vary by country</PolicyLi>
                <PolicyLi>Local legal requirements are followed</PolicyLi>
              </PolicyUl>

              <PolicyH2>Contact Information</PolicyH2>
              <PolicyP>For questions about donations, contact us at:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@uprise.org.au</PolicyLi>
              </PolicyUl>

              <PolicyH2>Updates to Policy</PolicyH2>
              <PolicyP>
                This policy may be updated periodically. Significant changes will be communicated to donors and posted on our website.
              </PolicyP>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
