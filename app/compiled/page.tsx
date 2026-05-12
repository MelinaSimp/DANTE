// app/compiled/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function CompiledPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <Image
            src="/brand/logo.png"
            alt="Drift AI Receptionist"
            width={200}
            height={200}
            className="mx-auto mb-8"
          />
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            How It Works
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See how our AI receptionist seamlessly handles your calls and manages customer interactions.
          </p>
        </div>

        {/* How It Works Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-semibold">Tel</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">1. Call Comes In</h3>
            <p className="text-gray-600">
              Your business phone rings, and our AI receptionist answers professionally with your custom greeting.
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-semibold">AI</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">2. AI Handles Conversation</h3>
            <p className="text-gray-600">
              The AI asks questions, collects information, and understands what the caller needs using natural conversation.
            </p>
          </div>

          <div className="bg-white rounded-lg p-8 text-center shadow-sm">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl font-semibold">Log</span>
            </div>
            <h3 className="text-xl font-semibold mb-3">3. Information Captured</h3>
            <p className="text-gray-600">
              Contact details, appointment requests, and call notes are automatically saved to your dashboard.
            </p>
          </div>
        </div>

        {/* Features Overview */}
        <div className="bg-white rounded-lg p-8 shadow-sm mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">What You Get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">Complete Dashboard</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• View all calls and recordings</li>
                <li>• Manage contacts and appointments</li>
                <li>• Track call analytics and insights</li>
                <li>• Update your business information</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-4">Smart Features</h3>
              <ul className="space-y-2 text-gray-600">
                <li>• Natural conversation flow</li>
                <li>• Appointment scheduling</li>
                <li>• Call transcription and notes</li>
                <li>• Custom business hours and policies</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl text-gray-600 mb-8">
            Join hundreds of businesses already using AI receptionists to never miss a call.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="/"
              className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
