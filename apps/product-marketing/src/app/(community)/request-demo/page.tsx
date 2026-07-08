import React from "react";
import DemoRequestForm from "@/components/DemoRequestForm";

export default function RequestDemoPage() {
  return (
    <main>
      <section className="pt-16 pb-12">
        <div className="container">
          <div className="mx-auto mb-12 w-full max-w-[810px] text-center lg:mb-12 pt-20">
            <h1 className="tracking-tight text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
              Request a Demo
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              See how our platform can help your organization achieve its goals.
              <br />
              Schedule a personalized demo with our team.
            </p>
          </div>

          <div className="mx-auto max-w-4xl">
            <DemoRequestForm />
          </div>
        </div>
      </section>
    </main>
  );
}
