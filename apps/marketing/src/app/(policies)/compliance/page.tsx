import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi } from "@/components/PolicyProse";

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

export default function CompliancePage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl mb-8">
              Compliance
            </h1>
            <PolicyProse>
              <PolicyP><B>Last updated: January 2025</B></PolicyP>

              <PolicyH2>Overview</PolicyH2>
              <PolicyP>
                Uprise is committed to maintaining the highest standards of compliance with applicable laws, regulations, and industry best practices. This page outlines our compliance framework and commitments.
              </PolicyP>

              <PolicyH2>Data Protection Compliance</PolicyH2>
              <PolicyH3>GDPR Compliance</PolicyH3>
              <PolicyP>We comply with the General Data Protection Regulation (GDPR):</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Data Processing</B>: We process personal data lawfully, fairly, and transparently</PolicyLi>
                <PolicyLi><B>Data Subject Rights</B>: We respect and facilitate data subject rights</PolicyLi>
                <PolicyLi><B>Data Breach Notification</B>: We have procedures for timely breach notification</PolicyLi>
                <PolicyLi><B>Data Protection Impact Assessments</B>: We conduct DPIAs where required</PolicyLi>
              </PolicyUl>
              <PolicyH3>CCPA Compliance</PolicyH3>
              <PolicyP>We comply with the California Consumer Privacy Act (CCPA):</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Consumer Rights</B>: We honor consumer rights to access, delete, and opt-out</PolicyLi>
                <PolicyLi><B>Privacy Notices</B>: We provide clear privacy notices</PolicyLi>
                <PolicyLi><B>Data Sales</B>: We do not sell personal information</PolicyLi>
                <PolicyLi><B>Verification</B>: We verify consumer requests appropriately</PolicyLi>
              </PolicyUl>

              <PolicyH2>Security Compliance</PolicyH2>
              <PolicyH3>SOC 2 Type II</PolicyH3>
              <PolicyP>We maintain SOC 2 Type II compliance:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Security Controls</B>: Comprehensive security measures</PolicyLi>
                <PolicyLi><B>Availability</B>: High availability and reliability</PolicyLi>
                <PolicyLi><B>Processing Integrity</B>: Accurate and complete processing</PolicyLi>
                <PolicyLi><B>Confidentiality</B>: Protection of sensitive information</PolicyLi>
                <PolicyLi><B>Privacy</B>: Protection of personal information</PolicyLi>
              </PolicyUl>
              <PolicyH3>ISO 27001</PolicyH3>
              <PolicyP>We follow ISO 27001 information security standards:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Information Security Management System</B></PolicyLi>
                <PolicyLi><B>Risk Assessment and Treatment</B></PolicyLi>
                <PolicyLi><B>Security Controls Implementation</B></PolicyLi>
                <PolicyLi><B>Continuous Monitoring and Improvement</B></PolicyLi>
              </PolicyUl>

              <PolicyH2>Financial Compliance</PolicyH2>
              <PolicyH3>PCI DSS</PolicyH3>
              <PolicyP>For payment processing, we maintain PCI DSS compliance:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Secure Network</B>: Protected network infrastructure</PolicyLi>
                <PolicyLi><B>Cardholder Data Protection</B>: Secure data storage and transmission</PolicyLi>
                <PolicyLi><B>Vulnerability Management</B>: Regular security updates</PolicyLi>
                <PolicyLi><B>Access Control</B>: Restricted access to cardholder data</PolicyLi>
                <PolicyLi><B>Monitoring and Testing</B>: Continuous security monitoring</PolicyLi>
                <PolicyLi><B>Security Policy</B>: Comprehensive security policies</PolicyLi>
              </PolicyUl>
              <PolicyH3>SOX Compliance</PolicyH3>
              <PolicyP>We maintain Sarbanes-Oxley Act compliance:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Financial Reporting</B>: Accurate financial reporting</PolicyLi>
                <PolicyLi><B>Internal Controls</B>: Strong internal control environment</PolicyLi>
                <PolicyLi><B>Audit Trails</B>: Comprehensive audit trails</PolicyLi>
                <PolicyLi><B>Documentation</B>: Proper documentation and record-keeping</PolicyLi>
              </PolicyUl>

              <PolicyH2>Industry-Specific Compliance</PolicyH2>
              <PolicyH3>Nonprofit Compliance</PolicyH3>
              <PolicyP>For nonprofit organisations using our platform:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>IRS Compliance</B>: Support for IRS reporting requirements</PolicyLi>
                <PolicyLi><B>Donor Privacy</B>: Protection of donor information</PolicyLi>
                <PolicyLi><B>Fundraising Regulations</B>: Compliance with fundraising laws</PolicyLi>
                <PolicyLi><B>Transparency Requirements</B>: Support for transparency reporting</PolicyLi>
              </PolicyUl>
              <PolicyH3>Political Campaign Compliance</PolicyH3>
              <PolicyP>For political campaigns and organisations:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>FEC Compliance</B>: Federal Election Commission requirements</PolicyLi>
                <PolicyLi><B>Campaign Finance</B>: Proper campaign finance reporting</PolicyLi>
                <PolicyLi><B>Voter Data Protection</B>: Secure handling of voter information</PolicyLi>
                <PolicyLi><B>Disclosure Requirements</B>: Support for disclosure obligations</PolicyLi>
              </PolicyUl>

              <PolicyH2>Political Donations Compliance</PolicyH2>
              <PolicyH3>Gift Caps</PolicyH3>
              <PolicyP>
                We enforce a $20,000 per donor per recipient per year cap, and a $640,000 aggregate cap, in line with the Electoral Legislation Amendment (Electoral Reform) Act 2025.
              </PolicyP>
              <PolicyH3>Disclosure Requirements</PolicyH3>
              <PolicyP>
                All donations above $5,000 (indexed) are disclosed to the AEC in real time, within 7 days, or 24 hours during election periods.
              </PolicyP>
              <PolicyH3>Foreign Donor Restrictions</PolicyH3>
              <PolicyP>
                We automatically block gifts over $1,000 from foreign donors to ensure compliance with Australian electoral laws.
              </PolicyP>
              <PolicyH3>Federal Account Usage</PolicyH3>
              <PolicyP>
                All donations are routed through mandatory federal accounts for eligible campaigns, ensuring proper regulatory oversight.
              </PolicyP>
              <PolicyH3>State-Level Compliance</PolicyH3>
              <PolicyP>
                We support state-level compliance requirements, including lower thresholds and donor bans where applicable in different jurisdictions.
              </PolicyP>
              <PolicyH3>Automatic Compliance</PolicyH3>
              <PolicyP>
                Donations breaching caps or legal requirements are automatically refunded or reversed to maintain regulatory compliance.
              </PolicyP>
              <PolicyH3>Transparency Features</PolicyH3>
              <PolicyUl>
                <PolicyLi>Donors receive real-time receipts and disclosure notes</PolicyLi>
                <PolicyLi>Campaigns can generate AEC-compliant reports at any time</PolicyLi>
                <PolicyLi>Full audit trail maintained for all transactions</PolicyLi>
              </PolicyUl>

              <PolicyH2>International Compliance</PolicyH2>
              <PolicyH3>Cross-Border Data Transfers</PolicyH3>
              <PolicyP>We ensure compliance with international data transfer requirements:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Adequacy Decisions</B>: We rely on adequacy decisions where available</PolicyLi>
                <PolicyLi><B>Standard Contractual Clauses</B>: We use SCCs for data transfers</PolicyLi>
                <PolicyLi><B>Binding Corporate Rules</B>: We implement BCRs where applicable</PolicyLi>
                <PolicyLi><B>Local Law Compliance</B>: We comply with local data protection laws</PolicyLi>
              </PolicyUl>
              <PolicyH3>Regional Requirements</PolicyH3>
              <PolicyP>We comply with regional requirements:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>EU Data Protection</B>: Full GDPR compliance</PolicyLi>
                <PolicyLi><B>UK Data Protection</B>: UK GDPR compliance</PolicyLi>
                <PolicyLi><B>Canadian Privacy</B>: PIPEDA compliance</PolicyLi>
                <PolicyLi><B>Australian Privacy</B>: Australian Privacy Principles</PolicyLi>
              </PolicyUl>

              <PolicyH2>Certifications and Audits</PolicyH2>
              <PolicyH3>Third-Party Audits</PolicyH3>
              <PolicyP>We undergo regular third-party audits:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Annual Security Audits</B>: Comprehensive security assessments</PolicyLi>
                <PolicyLi><B>Penetration Testing</B>: Regular penetration testing</PolicyLi>
                <PolicyLi><B>Vulnerability Assessments</B>: Ongoing vulnerability scanning</PolicyLi>
                <PolicyLi><B>Compliance Reviews</B>: Regular compliance assessments</PolicyLi>
              </PolicyUl>
              <PolicyH3>Certifications</PolicyH3>
              <PolicyP>We maintain relevant certifications:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Security Certifications</B>: Industry-recognized security certifications</PolicyLi>
                <PolicyLi><B>Privacy Certifications</B>: Privacy-focused certifications</PolicyLi>
                <PolicyLi><B>Quality Management</B>: ISO 9001 quality management</PolicyLi>
                <PolicyLi><B>Environmental Management</B>: ISO 14001 environmental management</PolicyLi>
              </PolicyUl>

              <PolicyH2>Compliance Monitoring</PolicyH2>
              <PolicyH3>Continuous Monitoring</PolicyH3>
              <PolicyP>We maintain continuous compliance monitoring:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Automated Monitoring</B>: Real-time compliance monitoring</PolicyLi>
                <PolicyLi><B>Regular Assessments</B>: Periodic compliance assessments</PolicyLi>
                <PolicyLi><B>Incident Response</B>: Rapid response to compliance incidents</PolicyLi>
                <PolicyLi><B>Documentation</B>: Comprehensive compliance documentation</PolicyLi>
              </PolicyUl>
              <PolicyH3>Training and Awareness</PolicyH3>
              <PolicyP>We ensure compliance awareness:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Employee Training</B>: Regular compliance training</PolicyLi>
                <PolicyLi><B>Policy Updates</B>: Timely policy updates and communication</PolicyLi>
                <PolicyLi><B>Best Practices</B>: Industry best practice implementation</PolicyLi>
                <PolicyLi><B>Continuous Improvement</B>: Ongoing compliance improvement</PolicyLi>
              </PolicyUl>

              <PolicyH2>Reporting and Transparency</PolicyH2>
              <PolicyH3>Compliance Reports</PolicyH3>
              <PolicyP>We provide compliance reporting:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Annual Reports</B>: Comprehensive annual compliance reports</PolicyLi>
                <PolicyLi><B>Incident Reports</B>: Timely incident reporting</PolicyLi>
                <PolicyLi><B>Audit Reports</B>: Third-party audit reports</PolicyLi>
                <PolicyLi><B>Transparency Reports</B>: Regular transparency reporting</PolicyLi>
              </PolicyUl>
              <PolicyH3>Stakeholder Communication</PolicyH3>
              <PolicyP>We maintain open communication:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Customer Updates</B>: Regular customer compliance updates</PolicyLi>
                <PolicyLi><B>Regulatory Communication</B>: Open communication with regulators</PolicyLi>
                <PolicyLi><B>Industry Participation</B>: Active participation in industry groups</PolicyLi>
                <PolicyLi><B>Public Disclosure</B>: Transparent public disclosure</PolicyLi>
              </PolicyUl>

              <PolicyH2>Contact Information</PolicyH2>
              <PolicyP>For compliance-related questions, contact us at:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@yarns.org.au</PolicyLi>
              </PolicyUl>

              <PolicyH2>Updates</PolicyH2>
              <PolicyP>
                This compliance information is updated regularly to reflect current requirements and our compliance status. Significant changes are communicated to stakeholders and posted on our website.
              </PolicyP>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
