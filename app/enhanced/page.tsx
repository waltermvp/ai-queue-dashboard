import EnhancedDashboard from '../components/EnhancedDashboard'

export default function EnhancedPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-6">
        <EnhancedDashboard />
      </div>
    </div>
  )
}

export const metadata = {
  title: 'Enhanced AI Queue Dashboard - Three Pillar System',
  description: 'Advanced AI queue management with label-based routing for Feature, Content, and E2E processing',
}