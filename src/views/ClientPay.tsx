"use client"

import AppLayout from "@/components/AppLayout"
import PayInvoice from "@/views/PayInvoice"

export default function ClientPay({ id }: { id: string }) {
	return (
		<AppLayout>
			<PayInvoice id={id} />
		</AppLayout>
	)
}
