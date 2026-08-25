import { CheckCircle, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { env } from '@/lib/env'
import { resolveReturnUrl } from '@/lib/return-url'
import { useForceTheme } from 'providers/ThemeProvider'

export const PortalCheckoutSuccess = () => {
  useForceTheme('light')
  const [searchParams] = useSearchParams()
  const rawReturnUrl = searchParams.get('return_url')
  const [countdown, setCountdown] = useState(3)

  // This page is unauthenticated, so an unvalidated target would make the
  // billing domain an open redirect. `null` means no redirect at all.
  const returnUrl = useMemo(
    () => resolveReturnUrl(rawReturnUrl, env.portalReturnUrlAllowlist),
    [rawReturnUrl]
  )

  useEffect(() => {
    if (!returnUrl) return

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.href = returnUrl
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [returnUrl])

  return (
    <div className="h-full w-full bg-[#00000002]">
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto px-6 py-12 text-center">
        <CheckCircle className="h-12 w-12 text-success mb-4 " />
        <h2 className="text-md font-semibold text-gray-800 mb-2">Payment Successful!</h2>
        {returnUrl ? (
          <div className="text-gray-800 text-sm">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Redirecting in {countdown}...</span>
            </div>
            <a href={returnUrl} className="text-blue-600 hover:underline mt-2 block">
              Click here if not redirected
            </a>
          </div>
        ) : (
          <p className="text-gray-800 text-sm">
            Thank you for your payment. You can now safely close this tab.
          </p>
        )}
      </div>
    </div>
  )
}
