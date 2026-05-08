"use client"

import dynamic from "next/dynamic"

const ClientDashboard = dynamic(() => import("@/views/ClientDashboard"), {
	ssr: false,
})

export default function DashboardPage() {
	return <ClientDashboard />
}
