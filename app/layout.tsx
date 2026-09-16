import type { Metadata } from 'next'
import React from 'react'
import './globals.css'
import { SolidSessionProvider } from '@/src/contexts/SolidSessionContext'

export const metadata: Metadata = {
    title: 'NetPod - Smart Movie Recommendation',
    description: 'Temukan film yang sesuai dengan selera Anda, didukung oleh AI dan Solid POD.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="id">
            <body className="bg-[#0f172a] text-white min-h-screen">
                <SolidSessionProvider>
                    {children}
                </SolidSessionProvider>
            </body>
        </html>
    )
}