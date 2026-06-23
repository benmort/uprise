import React from "react";
import DocumentationLayout from "@/components/DocumentationLayout";

export default function DevelopersPage() {
  return (
    <DocumentationLayout
      title="Developers"
      description="Developer resources and architecture documentation for Foment"
    >
      <div className="max-w-4xl mx-auto">
        <div className="max-w-none">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Welcome to the Foment Developer Hub
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Everything you need to integrate with Foment and build powerful
            applications on top of the platform.
          </p>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-xl font-semibold mb-4">🚀 Getting Started</h3>
              <p className="text-gray-600 mb-4">
                New to Foment? Start here to understand our architecture and get
                your first integration running.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• Quick start guides</li>
                <li>• Authentication setup</li>
                <li>• Basic API usage</li>
                <li>• Best practices</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-xl font-semibold mb-4">📚 Architecture</h3>
              <p className="text-gray-600 mb-4">
                Dive into how Foment is built, from the high-level overview to
                security and scalability.
              </p>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>• System overview</li>
                <li>• Component descriptions</li>
                <li>• Data flow & lifecycle</li>
                <li>• Security architecture</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DocumentationLayout>
  );
}
