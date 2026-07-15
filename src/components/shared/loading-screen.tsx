import logoImg from '@/assets/NexBaseLogo.png'

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          {/* Pulsing ring animation */}
          <div className="absolute -inset-2 rounded-2xl bg-brand/20 animate-ping" />
          {/* Logo container */}
          <div className="relative w-14 h-14 rounded-2xl bg-card border flex items-center justify-center shadow-lg p-2.5">
            <img src={logoImg} alt="NexBase Logo" className="w-full h-full object-contain animate-pulse" />
          </div>
        </div>
        <div className="flex gap-1.5 pt-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-brand animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
