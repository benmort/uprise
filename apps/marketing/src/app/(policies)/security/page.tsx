import React from "react";
import { PolicyProse, PolicyH2, PolicyH3, PolicyP, PolicyUl, PolicyLi } from "@/components/PolicyProse";

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

export default function SecurityPage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl mb-8">
              Security
            </h1>
            <PolicyProse>
              <PolicyP><B>Last updated: January 2025</B></PolicyP>

              <PolicyH2>Overview</PolicyH2>
              <PolicyP>
                At Uprise, security is fundamental to everything we do. We implement industry-leading security measures to protect our platform, our customers&apos; data, and ensure the highest levels of trust and reliability.
              </PolicyP>

              <PolicyH2>Security Framework</PolicyH2>
              <PolicyH3>Defense in Depth</PolicyH3>
              <PolicyP>We employ a multi-layered security approach:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Network Security</B>: Advanced network protection and monitoring</PolicyLi>
                <PolicyLi><B>Application Security</B>: Secure coding practices and regular testing</PolicyLi>
                <PolicyLi><B>Data Security</B>: Encryption and access controls</PolicyLi>
                <PolicyLi><B>Infrastructure Security</B>: Secure cloud infrastructure</PolicyLi>
                <PolicyLi><B>Operational Security</B>: Security policies and procedures</PolicyLi>
              </PolicyUl>
              <PolicyH3>Security by Design</PolicyH3>
              <PolicyP>Security is built into every aspect of our platform:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Secure Development Lifecycle</B>: Security integrated into development</PolicyLi>
                <PolicyLi><B>Threat Modeling</B>: Regular threat modeling and risk assessment</PolicyLi>
                <PolicyLi><B>Security Architecture</B>: Secure architectural patterns</PolicyLi>
                <PolicyLi><B>Continuous Security</B>: Ongoing security improvement</PolicyLi>
              </PolicyUl>

              <PolicyH2>Data Protection</PolicyH2>
              <PolicyH3>Encryption</PolicyH3>
              <PolicyP>We use strong encryption to protect data:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Data at Rest</B>: AES-256 encryption for stored data</PolicyLi>
                <PolicyLi><B>Data in Transit</B>: TLS 1.3 encryption for data transmission</PolicyLi>
                <PolicyLi><B>Database Encryption</B>: Encrypted database storage</PolicyLi>
                <PolicyLi><B>Backup Encryption</B>: Encrypted backup systems</PolicyLi>
              </PolicyUl>
              <PolicyH3>Access Controls</PolicyH3>
              <PolicyP>We implement strict access controls:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Multi-Factor Authentication</B>: MFA for all user accounts</PolicyLi>
                <PolicyLi><B>Role-Based Access Control</B>: Granular permission systems</PolicyLi>
                <PolicyLi><B>Principle of Least Privilege</B>: Minimal necessary access</PolicyLi>
                <PolicyLi><B>Session Management</B>: Secure session handling</PolicyLi>
              </PolicyUl>

              <PolicyH2>Infrastructure Security</PolicyH2>
              <PolicyH3>Cloud Security</PolicyH3>
              <PolicyP>We leverage secure cloud infrastructure:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>AWS Security</B>: Amazon Web Services security features</PolicyLi>
                <PolicyLi><B>VPC Configuration</B>: Secure virtual private clouds</PolicyLi>
                <PolicyLi><B>Security Groups</B>: Network access controls</PolicyLi>
                <PolicyLi><B>CloudTrail</B>: Comprehensive audit logging</PolicyLi>
              </PolicyUl>
              <PolicyH3>Network Security</PolicyH3>
              <PolicyP>We maintain secure network architecture:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Firewalls</B>: Advanced firewall protection</PolicyLi>
                <PolicyLi><B>DDoS Protection</B>: Distributed denial-of-service protection</PolicyLi>
                <PolicyLi><B>Intrusion Detection</B>: Real-time threat detection</PolicyLi>
                <PolicyLi><B>Network Monitoring</B>: Continuous network monitoring</PolicyLi>
              </PolicyUl>

              <PolicyH2>Application Security</PolicyH2>
              <PolicyH3>Secure Development</PolicyH3>
              <PolicyP>We follow secure development practices:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Code Reviews</B>: Security-focused code reviews</PolicyLi>
                <PolicyLi><B>Static Analysis</B>: Automated security scanning</PolicyLi>
                <PolicyLi><B>Dependency Management</B>: Secure dependency management</PolicyLi>
                <PolicyLi><B>Security Testing</B>: Regular security testing</PolicyLi>
              </PolicyUl>
              <PolicyH3>Vulnerability Management</PolicyH3>
              <PolicyP>We maintain robust vulnerability management:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Regular Scanning</B>: Automated vulnerability scanning</PolicyLi>
                <PolicyLi><B>Penetration Testing</B>: Regular penetration testing</PolicyLi>
                <PolicyLi><B>Bug Bounty Program</B>: Security researcher engagement</PolicyLi>
                <PolicyLi><B>Patch Management</B>: Timely security updates</PolicyLi>
              </PolicyUl>

              <PolicyH2>Authentication and Authorization</PolicyH2>
              <PolicyH3>User Authentication</PolicyH3>
              <PolicyP>We provide secure user authentication:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Password Policies</B>: Strong password requirements</PolicyLi>
                <PolicyLi><B>Account Lockout</B>: Protection against brute force attacks</PolicyLi>
                <PolicyLi><B>Session Timeout</B>: Automatic session expiration</PolicyLi>
                <PolicyLi><B>Login Monitoring</B>: Suspicious activity detection</PolicyLi>
              </PolicyUl>
              <PolicyH3>Multi-Factor Authentication</PolicyH3>
              <PolicyP>We support multiple MFA options:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>TOTP</B>: Time-based one-time passwords</PolicyLi>
                <PolicyLi><B>SMS Authentication</B>: SMS-based verification</PolicyLi>
                <PolicyLi><B>Hardware Tokens</B>: Hardware security keys</PolicyLi>
                <PolicyLi><B>Biometric Authentication</B>: Biometric verification</PolicyLi>
              </PolicyUl>

              <PolicyH2>Monitoring and Incident Response</PolicyH2>
              <PolicyH3>Security Monitoring</PolicyH3>
              <PolicyP>We maintain comprehensive security monitoring:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>SIEM Integration</B>: Security information and event management</PolicyLi>
                <PolicyLi><B>Real-Time Alerts</B>: Immediate security notifications</PolicyLi>
                <PolicyLi><B>Behavioral Analysis</B>: User behavior monitoring</PolicyLi>
                <PolicyLi><B>Threat Intelligence</B>: External threat intelligence feeds</PolicyLi>
              </PolicyUl>
              <PolicyH3>Incident Response</PolicyH3>
              <PolicyP>We have robust incident response procedures:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>24/7 Monitoring</B>: Round-the-clock security monitoring</PolicyLi>
                <PolicyLi><B>Incident Classification</B>: Rapid incident classification</PolicyLi>
                <PolicyLi><B>Response Procedures</B>: Documented response procedures</PolicyLi>
                <PolicyLi><B>Communication Plans</B>: Stakeholder communication plans</PolicyLi>
              </PolicyUl>

              <PolicyH2>Compliance and Certifications</PolicyH2>
              <PolicyH3>Security Certifications</PolicyH3>
              <PolicyP>We maintain industry certifications:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>SOC 2 Type II</B>: Service Organisation Control compliance</PolicyLi>
                <PolicyLi><B>ISO 27001</B>: Information security management</PolicyLi>
                <PolicyLi><B>PCI DSS</B>: Payment card industry compliance</PolicyLi>
                <PolicyLi><B>FedRAMP</B>: Federal risk and authorization management</PolicyLi>
              </PolicyUl>
              <PolicyH3>Regular Audits</PolicyH3>
              <PolicyP>We undergo regular security audits:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Third-Party Audits</B>: Independent security assessments</PolicyLi>
                <PolicyLi><B>Penetration Testing</B>: Regular penetration testing</PolicyLi>
                <PolicyLi><B>Vulnerability Assessments</B>: Comprehensive vulnerability scanning</PolicyLi>
                <PolicyLi><B>Compliance Reviews</B>: Regular compliance assessments</PolicyLi>
              </PolicyUl>

              <PolicyH2>Privacy and Data Protection</PolicyH2>
              <PolicyH3>Data Privacy</PolicyH3>
              <PolicyP>We protect user privacy:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Privacy by Design</B>: Privacy integrated into design</PolicyLi>
                <PolicyLi><B>Data Minimization</B>: Minimal data collection</PolicyLi>
                <PolicyLi><B>User Consent</B>: Clear consent mechanisms</PolicyLi>
                <PolicyLi><B>Data Rights</B>: User data rights support</PolicyLi>
              </PolicyUl>
              <PolicyH3>Data Governance</PolicyH3>
              <PolicyP>We maintain strong data governance:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Data Classification</B>: Data sensitivity classification</PolicyLi>
                <PolicyLi><B>Data Retention</B>: Appropriate data retention policies</PolicyLi>
                <PolicyLi><B>Data Disposal</B>: Secure data disposal procedures</PolicyLi>
                <PolicyLi><B>Data Inventory</B>: Comprehensive data inventory</PolicyLi>
              </PolicyUl>

              <PolicyH2>Business Continuity</PolicyH2>
              <PolicyH3>Disaster Recovery</PolicyH3>
              <PolicyP>We maintain robust disaster recovery:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Backup Systems</B>: Comprehensive backup systems</PolicyLi>
                <PolicyLi><B>Recovery Procedures</B>: Documented recovery procedures</PolicyLi>
                <PolicyLi><B>Testing</B>: Regular disaster recovery testing</PolicyLi>
                <PolicyLi><B>Geographic Redundancy</B>: Multi-region redundancy</PolicyLi>
              </PolicyUl>
              <PolicyH3>High Availability</PolicyH3>
              <PolicyP>We ensure high availability:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>99.9% Uptime</B>: High availability commitment</PolicyLi>
                <PolicyLi><B>Load Balancing</B>: Intelligent load balancing</PolicyLi>
                <PolicyLi><B>Auto-scaling</B>: Automatic scaling capabilities</PolicyLi>
                <PolicyLi><B>Health Monitoring</B>: Continuous health monitoring</PolicyLi>
              </PolicyUl>

              <PolicyH2>Security Awareness</PolicyH2>
              <PolicyH3>Employee Training</PolicyH3>
              <PolicyP>We maintain security awareness:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Security Training</B>: Regular security training</PolicyLi>
                <PolicyLi><B>Phishing Awareness</B>: Phishing awareness programs</PolicyLi>
                <PolicyLi><B>Best Practices</B>: Security best practice training</PolicyLi>
                <PolicyLi><B>Incident Reporting</B>: Security incident reporting</PolicyLi>
              </PolicyUl>
              <PolicyH3>Customer Education</PolicyH3>
              <PolicyP>We educate our customers:</PolicyP>
              <PolicyUl>
                <PolicyLi><B>Security Guides</B>: Comprehensive security guides</PolicyLi>
                <PolicyLi><B>Best Practices</B>: Security best practice documentation</PolicyLi>
                <PolicyLi><B>Security Updates</B>: Regular security updates</PolicyLi>
                <PolicyLi><B>Support</B>: Security support and guidance</PolicyLi>
              </PolicyUl>

              <PolicyH2>Contact Information</PolicyH2>
              <PolicyP>For security-related questions or to report security issues:</PolicyP>
              <PolicyUl>
                <PolicyLi>Email: contact@yarns.org.au</PolicyLi>
              </PolicyUl>

              <PolicyH2>Security Updates</PolicyH2>
              <PolicyP>
                We regularly update our security measures and communicate important security updates to our customers. For the latest security information, please check our security blog or contact our security team.
              </PolicyP>
            </PolicyProse>
          </div>
        </div>
      </section>
    </main>
  );
}
