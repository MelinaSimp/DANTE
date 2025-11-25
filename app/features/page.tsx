// app/features/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <Image
            src="/brand/logo.png"
            alt="Drift AI Receptionist"
            width={150}
            height={150}
            className="mx-auto mb-8"
          />
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Powerful Features
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to manage calls, contacts, and appointments with AI-powered automation.
          </p>
        </div>

        {/* Main Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* AI Receptionist */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">AI Receptionist</h3>
            <p className="text-gray-600 mb-4">
              Professional AI that answers calls 24/7 with natural conversation and your custom business information.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Natural conversation flow</li>
              <li>• Custom greetings and responses</li>
              <li>• Multi-language support</li>
              <li>• 24/7 availability</li>
            </ul>
          </div>

          {/* Call Management */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📞</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Call Management</h3>
            <p className="text-gray-600 mb-4">
              Track all incoming calls with detailed logs, recordings, and transcriptions for easy follow-up.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Call recordings and transcripts</li>
              <li>• Call duration and status tracking</li>
              <li>• Searchable call history</li>
              <li>• Call analytics and insights</li>
            </ul>
          </div>

          {/* Contact Management */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">👤</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Contact Management</h3>
            <p className="text-gray-600 mb-4">
              Automatically capture and organize caller information with smart contact management.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Automatic contact creation</li>
              <li>• Contact history and notes</li>
              <li>• Search and filter contacts</li>
              <li>• Export contact data</li>
            </ul>
          </div>

          {/* Appointment Scheduling */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📅</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Appointment Scheduling</h3>
            <p className="text-gray-600 mb-4">
              Let callers book appointments directly through your AI receptionist with calendar integration.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Real-time availability checking</li>
              <li>• Automated appointment booking</li>
              <li>• Calendar synchronization</li>
              <li>• Appointment reminders</li>
            </ul>
          </div>

          {/* Business Intelligence */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Analytics & Insights</h3>
            <p className="text-gray-600 mb-4">
              Get detailed insights into your call patterns, customer interactions, and business performance.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Call volume and timing analysis</li>
              <li>• Customer satisfaction metrics</li>
              <li>• Conversion tracking</li>
              <li>• Custom reporting</li>
            </ul>
          </div>

          {/* Customization */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl">⚙️</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Customization</h3>
            <p className="text-gray-600 mb-4">
              Tailor your AI receptionist to match your business with custom settings and knowledge base.
            </p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• Custom business information</li>
              <li>• Personalized greetings</li>
              <li>• Business hours and policies</li>
              <li>• Service descriptions</li>
            </ul>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="bg-white rounded-lg p-8 shadow-sm mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Simple Pricing</h2>
            <p className="text-xl text-gray-600">No hidden fees, no setup costs</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Starter</h3>
              <div className="text-3xl font-bold mb-4">$29<span className="text-lg text-gray-500">/month</span></div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Up to 100 calls/month</li>
                <li>• Basic AI receptionist</li>
                <li>• Contact management</li>
                <li>• Email support</li>
              </ul>
            </div>
            
            <div className="text-center p-6 border-2 border-blue-500 rounded-lg bg-blue-50">
              <h3 className="text-xl font-semibold mb-2">Professional</h3>
              <div className="text-3xl font-bold mb-4">$79<span className="text-lg text-gray-500">/month</span></div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Up to 500 calls/month</li>
                <li>• Advanced AI features</li>
                <li>• Appointment scheduling</li>
                <li>• Analytics dashboard</li>
                <li>• Priority support</li>
              </ul>
            </div>
            
            <div className="text-center p-6 border rounded-lg">
              <h3 className="text-xl font-semibold mb-2">Enterprise</h3>
              <div className="text-3xl font-bold mb-4">$199<span className="text-lg text-gray-500">/month</span></div>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Unlimited calls</li>
                <li>• Custom integrations</li>
                <li>• White-label options</li>
                <li>• Dedicated support</li>
                <li>• Custom training</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Business?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of businesses already using AI receptionists to never miss a call.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="/compiled"
              className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
