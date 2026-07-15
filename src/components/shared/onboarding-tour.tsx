import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { X, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuthContext } from '@/app/auth-context'

interface TourStep {
  target: string
  title: string
  description: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

export function OnboardingTour() {
  const { profile, isOrganizer } = useAuthContext()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [coords, setCoords] = useState<{
    top: number
    left: number
    width: number
    height: number
    isCenteredFallback?: boolean
  } | null>(null)
  const resizeRef = useRef<number | null>(null)

  const steps: TourStep[] = isOrganizer
    ? [
      {
        target: '#tour-wallet-button',
        title: 'Step 1: Link Solana Wallet 💳',
        description: 'Connect your wallet to authenticate payouts, deploy escrow vaults, and receive entry fees in SOL/USDC.',
        position: 'bottom',
      },
      {
        target: '#tour-create-tournament-link',
        title: 'Step 2: Host Tournaments 🏆',
        description: 'Design new gaming tournaments! Set entry rules, select team sizes, and customize token rewards.',
        position: 'right',
      },
      {
        target: '#tour-my-tournaments-link',
        title: 'Step 3: Manage Escrow & Disputes ⚖️',
        description: 'Control match scheduling, verify scores, resolve player disputes, and authorize trustless payouts.',
        position: 'right',
      },
    ]
    : [
      {
        target: '#tour-wallet-button',
        title: 'Step 1: Connect Phantom Wallet 💳',
        description: 'Connect your wallet to verify registration slots, pay entry fees, and receive cash payouts.',
        position: 'bottom',
      },
      {
        target: '#tour-teams-link',
        title: 'Step 2: Recruit Squads 👥',
        description: 'Form a gaming team, search and recruit free agent players, and manage roster invites.',
        position: 'right',
      },
      {
        target: '#tour-tournaments-link',
        title: 'Step 3: Enter Tournaments 🎮',
        description: 'Browse all open brackets, complete payments, and join map-based or 1v1 formats.',
        position: 'right',
      },
    ]

  useEffect(() => {
    if (profile?.id) {
      // Show tour if they haven't finished it yet for their specific profile
      const completed = localStorage.getItem(`nexbase_tour_completed_${profile.id}`)
      if (!completed) {
        setIsOpen(true)
      }
    }
  }, [profile])

  // Recalculate target positions
  const updateSpotlight = () => {
    if (!isOpen || steps.length === 0) return
    const step = steps[currentStep]
    const el = document.querySelector(step.target)
    if (el) {
      const rect = el.getBoundingClientRect()
      // Make sure the element is visible on the current screen size
      if (rect.width > 0 && rect.height > 0) {
        setCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
          isCenteredFallback: false,
        })
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    // Fallback: Center of the screen (e.g. if sidebar link is hidden inside mobile hamburger menu)
    setCoords({
      top: window.innerHeight / 2 - 100,
      left: window.innerWidth / 2 - 160,
      width: 0,
      height: 0,
      isCenteredFallback: true,
    })
  }

  useEffect(() => {
    updateSpotlight()

    const handleResize = () => {
      if (resizeRef.current) window.cancelAnimationFrame(resizeRef.current)
      resizeRef.current = window.requestAnimationFrame(() => updateSpotlight())
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize)
    }
  }, [currentStep, isOpen, location.pathname])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      handleClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleClose = () => {
    setIsOpen(false)
    if (profile?.id) {
      localStorage.setItem(`nexbase_tour_completed_${profile.id}`, 'true')
    }
  }

  const handleStartTour = () => {
    setCurrentStep(0)
    setIsOpen(true)
  }

  if (!profile) return null

  return (
    <>
      {/* Floating help toggle icon */}
      <button
        onClick={handleStartTour}
        className="fixed bottom-5 right-5 z-40 bg-brand text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:bg-brand/90 transition-all hover:scale-105"
        title="Start Platform Walkthrough Tour"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {isOpen && coords && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Spotlight mask overlay */}
          <div className="absolute inset-0 transition-all duration-300 pointer-events-auto">
            {/* Hidden SVG that only defines the mask shape - not rendered visibly itself */}
            <svg width="0" height="0" className="absolute">
              <defs>
                <mask
                  id="spotlight-mask"
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                >
                  <rect width="100%" height="100%" fill="white" />
                  {!coords.isCenteredFallback && (
                    <rect
                      x={coords.left - 6}
                      y={coords.top - 6}
                      width={coords.width + 12}
                      height={coords.height + 12}
                      rx="8"
                      ry="8"
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
            </svg>

            {/*
              Dim + blur layer. Both the tint and the blur live on this single
              masked div, so the cutout area (the spotlighted element) is
              excluded from BOTH effects - it stays fully sharp and unblurred,
              while everything else is dimmed and blurred.
            */}
            <div
              className="absolute inset-0 bg-[#09090b]/70 backdrop-blur-[2px]"
              style={{
                WebkitMaskImage: 'url(#spotlight-mask)',
                maskImage: 'url(#spotlight-mask)',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%',
              }}
            />
          </div>

          {/* Interactive Tooltip popup card */}
          <Card
            className="absolute z-50 w-80 bg-background/95 border-brand/20 shadow-2xl p-5 select-none pointer-events-auto transition-all duration-300 flex flex-col gap-3 rounded-xl border"
            style={coords.isCenteredFallback ? {
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              position: 'fixed'
            } : {
              top:
                steps[currentStep].position === 'bottom'
                  ? coords.top + coords.height + 16
                  : steps[currentStep].position === 'top'
                    ? coords.top - 200
                    : coords.top + (coords.height / 2) - 100,
              left:
                steps[currentStep].position === 'right'
                  ? coords.left + coords.width + 16
                  : steps[currentStep].position === 'left'
                    ? coords.left - 336
                    : coords.left + (coords.width / 2) - 160,
              position: 'absolute'
            }}
          >
            {/* Header info */}
            <div className="flex justify-between items-start gap-2">
              <h4 className="font-bold text-sm text-foreground tracking-tight">
                {steps[currentStep].title}
              </h4>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              {steps[currentStep].description}
            </p>

            {/* Nav actions */}
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-border">
              <span className="text-[10px] text-muted-foreground font-semibold">
                {currentStep + 1} of {steps.length} Steps
              </span>
              <div className="flex gap-1.5">
                {currentStep > 0 && (
                  <Button variant="outline" size="xs" onClick={handlePrev} className="h-7 text-xs px-2.5">
                    <ChevronLeft className="w-3 h-3 mr-0.5" /> Back
                  </Button>
                )}
                <Button size="xs" onClick={handleNext} className="h-7 text-xs bg-brand text-white px-3 hover:bg-brand/90">
                  {currentStep === steps.length - 1 ? 'Finish' : 'Next'} <ChevronRight className="w-3 h-3 ml-0.5" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}