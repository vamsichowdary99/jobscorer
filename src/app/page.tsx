import LandingNav from '@/components/landing/LandingNav'
import Hero from '@/components/landing/Hero'
import Journey from '@/components/landing/Journey'
import CompanyResearch from '@/components/landing/CompanyResearch'
import Features from '@/components/landing/Features'
import Testimonials from '@/components/landing/Testimonials'
import Pricing from '@/components/landing/Pricing'
import CTABanner from '@/components/landing/CTABanner'
import LandingFooter from '@/components/landing/LandingFooter'
import '@/components/landing/landing.css'

export default function LandingPage() {
  return (
    <div className="jobscorer-landing">
      <LandingNav />
      <main style={{ paddingTop: 64 }}>
        <Hero />
        <Journey />
        <CompanyResearch />
        <Features />
        <Testimonials />
        <Pricing />
        <CTABanner />
        <LandingFooter />
      </main>
    </div>
  )
}
