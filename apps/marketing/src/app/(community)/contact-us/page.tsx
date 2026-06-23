import React from "react";
import ContactForm from "@/components/ContactForm";

export default function ContactUsPage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] text-center lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
              Contact Us
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Get in touch with our team.
              <br />
              We&apos;d love to hear from you and answer any questions you may have.
              <br />
              We&apos;ll get back to you as soon as possible.
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
