// app/resources/page.tsx
import Link from "next/link";

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Resources & Support
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Everything you need to get the most out of your AI receptionist and grow your business.
          </p>
        </div>

        {/* Resource Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* Getting Started */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">Go</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Getting Started</h3>
            <p className="text-gray-600 mb-4">
              Learn how to set up and configure your AI receptionist for maximum effectiveness.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">Quick Start Guide</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Account Setup</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Phone Number Setup</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">First Call Configuration</a></li>
            </ul>
          </div>

          {/* Best Practices */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">BP</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Best Practices</h3>
            <p className="text-gray-600 mb-4">
              Proven strategies to optimize your AI receptionist and improve customer experience.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">Writing Effective Greetings</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Handling Common Questions</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Appointment Booking Tips</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Customer Service Excellence</a></li>
            </ul>
          </div>

          {/* Troubleshooting */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">Fix</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Troubleshooting</h3>
            <p className="text-gray-600 mb-4">
              Find solutions to common issues and get your AI receptionist back on track.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">Common Issues</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Call Quality Problems</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Integration Issues</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Performance Optimization</a></li>
            </ul>
          </div>

          {/* API Documentation */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">API</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">API & Integrations</h3>
            <p className="text-gray-600 mb-4">
              Connect your AI receptionist with your existing business tools and workflows.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">API Documentation</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Webhook Setup</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">CRM Integration</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Calendar Sync</a></li>
            </ul>
          </div>

          {/* Video Tutorials */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">Vid</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Video Tutorials</h3>
            <p className="text-gray-600 mb-4">
              Watch step-by-step video guides to master every feature of your AI receptionist.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">Setup Walkthrough</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Customization Guide</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Analytics Overview</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Advanced Features</a></li>
            </ul>
          </div>

          {/* Community */}
          <div className="bg-white rounded-lg p-8 shadow-sm">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
              <span className="text-2xl font-semibold">Grp</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">Community & Support</h3>
            <p className="text-gray-600 mb-4">
              Connect with other users, share tips, and get help from our community and support team.
            </p>
            <ul className="space-y-2">
              <li><a href="#" className="text-blue-600 hover:underline">User Forum</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Feature Requests</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Contact Support</a></li>
              <li><a href="#" className="text-blue-600 hover:underline">Success Stories</a></li>
            </ul>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-lg p-8 shadow-sm mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">How does the AI receptionist work?</h3>
              <p className="text-gray-600">
                Our AI receptionist uses advanced natural language processing to understand caller requests, 
                answer questions about your business, and capture important information automatically.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Can I customize the AI responses?</h3>
              <p className="text-gray-600">
                Yes! You can customize greetings, business information, hours, services, and policies 
                through our easy-to-use dashboard.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">What phone numbers can I use?</h3>
              <p className="text-gray-600">
                You can use any existing business phone number or get a new number through our platform. 
                We support both local and toll-free numbers.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">How accurate is the call transcription?</h3>
              <p className="text-gray-600">
                Our transcription accuracy is over 95% for clear calls. All transcriptions are reviewed 
                and can be edited if needed.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Support */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Need More Help?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Our support team is here to help you succeed with your AI receptionist.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Contact Support
            </Link>
            <Link
              href="/features"
              className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              View Features
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
