import type { Metadata } from 'next'
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import ChatPanel from '@/components/chat/ChatPanel'
import ConsentBanner from '@/components/legal/ConsentBanner'
import { AuthProvider } from '@/components/providers/AuthProvider'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-main',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-outfit',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'ResuScore — AI-Powered Job Matching & Resume Optimization',
  description: 'Upload your resume, discover jobs, and get AI-scored matches with optimization recommendations. Stop searching, start matching.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <ChatPanel />
          <ConsentBanner />
        </AuthProvider>
      </body>
    </html>
  )
}
