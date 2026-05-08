"use client"

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"

const ClientPay = dynamic<{ id: string }>(
	() => import("@/views/ClientPay").then((m) => m.default),
	{ ssr: false },
)

export default function PayPage() {
	const params = useParams<{ id: string }>()
	const id = params?.id ?? ""
	return <ClientPay id={id} />
}
