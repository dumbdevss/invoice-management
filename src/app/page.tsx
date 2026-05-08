"use client"

import dynamic from "next/dynamic"

const ClientHome = dynamic(() => import("@/views/ClientHome"), { ssr: false })

export default function HomePage() {
	return <ClientHome />
}
