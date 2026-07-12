'use client'

import Nav from '@/components/site/Nav'
import Footer from '@/components/site/Footer'
import MaturityBand from '@/components/site/MaturityBand'

/** Dark marketing chrome for the Dante site, scoped under .site-root. */
export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-root min-h-screen bg-black text-white">
      <Nav />
      {children}
      <MaturityBand />
      <Footer />
    </div>
  )
}
