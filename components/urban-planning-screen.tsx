'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapPin, TrendingUp } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function UrbanPlanningScreen() {
  const [proposals, setProposals] = useState([
    {
      id: 1,
      title: 'Community Garden Initiative',
      district: 'Al-Naeem',
      votes: 450,
      cost: '$125,000',
      status: 'Under Review',
    },
    {
      id: 2,
      title: 'Bike Lane Network',
      district: 'Downtown',
      votes: 312,
      cost: '$85,000',
      status: 'Approved',
    },
    {
      id: 3,
      title: 'Street Lighting Upgrade',
      district: 'Al-Naeem',
      votes: 289,
      cost: '$200,000',
      status: 'Under Review',
    },
    {
      id: 4,
      title: 'Park Renovation',
      district: 'Westside',
      votes: 156,
      cost: '$75,000',
      status: 'Rejected',
    },
  ])

  const [selectedProposal, setSelectedProposal] = useState(null)

  const updateStatus = (id, newStatus) => {
    setProposals(proposals.map(p => p.id === id ? { ...p, status: newStatus } : p))
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-700'
      case 'Rejected':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  return (
    <div className="flex flex-col h-full p-6 bg-slate-50 gap-6">
      {/* Top Half - Heatmap */}
      <div className="flex-1 relative">
        <Card className="h-full bg-gradient-to-br from-purple-100 to-purple-50 border border-purple-200 overflow-hidden">
          <div className="w-full h-full relative flex items-center justify-center">
            {/* Heatmap visualization */}
            <div className="absolute inset-0 opacity-40">
              <svg className="w-full h-full">
                <defs>
                  <radialGradient id="heatmap1" cx="30%" cy="30%">
                    <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#E9D5FF" stopOpacity="0.1" />
                  </radialGradient>
                  <radialGradient id="heatmap2" cx="70%" cy="70%">
                    <stop offset="0%" stopColor="#C084FC" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#E9D5FF" stopOpacity="0.1" />
                  </radialGradient>
                </defs>
                <circle cx="30%" cy="30%" r="200" fill="url(#heatmap1)" />
                <circle cx="70%" cy="70%" r="180" fill="url(#heatmap2)" />
              </svg>
            </div>

            {/* Top District Badge */}
            <div className="absolute top-6 left-6 z-20 bg-white shadow-lg rounded-lg px-4 py-3 border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-semibold text-slate-600 uppercase">Top District</span>
              </div>
              <p className="text-lg font-bold text-purple-900">Al-Naeem</p>
              <p className="text-sm text-purple-700 font-semibold">450 votes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Half - Vetting Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Community Proposals Queue</h2>
        <Card className="flex-1 bg-white border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Proposal</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">District</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Votes</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Est. Cost</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {proposals.map((proposal) => (
                  <tr
                    key={proposal.id}
                    onClick={() => setSelectedProposal(proposal)}
                    className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                      selectedProposal?.id === proposal.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{proposal.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{proposal.district}</td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-purple-600">{proposal.votes}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{proposal.cost}</td>
                    <td className="px-6 py-4">
                      <Select value={proposal.status} onValueChange={(value) => updateStatus(proposal.id, value)}>
                        <SelectTrigger className={`w-32 text-xs font-semibold border-0 ${getStatusColor(proposal.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Under Review">Under Review</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
