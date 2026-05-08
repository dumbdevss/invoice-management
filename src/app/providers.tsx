"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NotificationProvider } from "@/providers/NotificationProvider"
import { WalletProvider } from "@/providers/WalletProvider"

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: false,
		},
	},
})

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<NotificationProvider>
			<QueryClientProvider client={queryClient}>
				<WalletProvider>{children}</WalletProvider>
			</QueryClientProvider>
		</NotificationProvider>
	)
}
