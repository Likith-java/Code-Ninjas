'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthPage } from '@/components/ui/animated-characters-login-page'
import { getToken } from '@/lib/auth-storage'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard')
    }
  }, [router])

  return <AuthPage isStandalone={true} />
}