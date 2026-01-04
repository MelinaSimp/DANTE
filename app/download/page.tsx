import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download Drift AI Desktop App",
  description: "Download the native desktop app for macOS, Windows, and Linux",
};

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#242423] to-[#1a1a19] flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white/5 backdrop-blur-sm rounded-3xl p-12 border border-white/10 shadow-2xl">
        {/* Logo and Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <span className="text-4xl">🚀</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Download Drift AI</h1>
          <p className="text-xl text-white/70">
            Native desktop app for macOS, Windows, and Linux
          </p>
        </div>

        {/* Download Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* macOS */}
          <a
            href="/downloads/Drift-AI-1.0.0.dmg"
            download
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 rounded-2xl p-8 text-center transition-all duration-300 hover:scale-105 cursor-pointer"
          >
            <div className="text-6xl mb-4">🍎</div>
            <h3 className="text-xl font-semibold text-white mb-2">macOS</h3>
            <p className="text-sm text-white/60 mb-4">.dmg installer</p>
            <div className="text-orange-500 font-medium group-hover:text-orange-400">
              Download →
            </div>
          </a>

          {/* Windows */}
          <a
            href="/downloads/Drift-AI-Setup-1.0.0.exe"
            download
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 rounded-2xl p-8 text-center transition-all duration-300 hover:scale-105 cursor-pointer"
          >
            <div className="text-6xl mb-4">🪟</div>
            <h3 className="text-xl font-semibold text-white mb-2">Windows</h3>
            <p className="text-sm text-white/60 mb-4">.exe installer</p>
            <div className="text-orange-500 font-medium group-hover:text-orange-400">
              Download →
            </div>
          </a>

          {/* Linux */}
          <a
            href="/downloads/Drift-AI-1.0.0.AppImage"
            download
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 rounded-2xl p-8 text-center transition-all duration-300 hover:scale-105 cursor-pointer"
          >
            <div className="text-6xl mb-4">🐧</div>
            <h3 className="text-xl font-semibold text-white mb-2">Linux</h3>
            <p className="text-sm text-white/60 mb-4">.AppImage</p>
            <div className="text-orange-500 font-medium group-hover:text-orange-400">
              Download →
            </div>
          </a>
        </div>

        {/* System Requirements */}
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2">
            <span>ℹ️</span> System Requirements
          </h3>
          <ul className="space-y-2 text-white/80">
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">✓</span>
              <span>Internet connection required</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">✓</span>
              <span>macOS 10.13+ / Windows 10+ / Linux (Ubuntu 18.04+)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">✓</span>
              <span>100MB free disk space</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">✓</span>
              <span>Latest version automatically connects to our servers</span>
            </li>
          </ul>
        </div>

        {/* Installation Instructions */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Installation Instructions</h3>
          <div className="space-y-4 text-white/70 text-sm">
            <div>
              <strong className="text-white">macOS:</strong> Open the .dmg file, drag Drift AI to your Applications folder
            </div>
            <div>
              <strong className="text-white">Windows:</strong> Run the .exe installer and follow the setup wizard
            </div>
            <div>
              <strong className="text-white">Linux:</strong> Make the file executable (<code className="bg-white/10 px-2 py-1 rounded">chmod +x</code>) and double-click to run
            </div>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Link
            href="/"
            className="text-orange-500 hover:text-orange-400 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

