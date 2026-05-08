"use client"

import AppLayout from "@/components/AppLayout"
import CreateInvoice from "@/views/CreateInvoice"

export default function ClientHome() {
	return (
		<AppLayout>
			<CreateInvoice />
		</AppLayout>
	)
}
