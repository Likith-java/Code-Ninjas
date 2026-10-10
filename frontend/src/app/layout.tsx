import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Code-Ninjas — Textile Manufacturing Intelligence Platform',
  description: 'Everest Textile Mills - Production Scheduler with CP-SAT Optimization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body bg-[#F5F0E3] text-[#181816] antialiased min-w-0 h-screen overflow-hidden">
        {children}
      </body>
    </html>
  )
}