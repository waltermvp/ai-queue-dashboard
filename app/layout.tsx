import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Issue Queue Dashboard',
  description: 'Monitor and control AI-powered GitHub issue processing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <h1 className="text-xl font-semibold text-gray-900">
                      🤖 AI Issue Queue Dashboard
                    </h1>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">Walter's Mac Mini</span>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-600">Online</span>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}