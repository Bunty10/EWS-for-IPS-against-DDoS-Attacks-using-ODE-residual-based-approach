import { useNavigate } from 'react-router-dom';
import { ShieldExclamationIcon } from '@heroicons/react/24/solid';
import cyberBackground from '../images/network-bckg.jpg';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center text-white relative overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.6)), url(${cyberBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Subtle grid overlay for tech feel */}
      <div className="absolute inset-0 pointer-events-none opacity-60 bg-grid"></div>
      
      <div className="relative z-10 w-full max-w-4xl px-6 py-16">
        <div className="text-center space-y-12">
          {/* Logo/Header */}
          <div className="flex flex-col items-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 rounded-2xl bg-primary blur-2xl opacity-20"></div>
              <div className="relative flex items-center justify-center h-24 w-24 bg-white/5 backdrop-blur-sm border border-white/15 rounded-2xl shadow-elev">
                <ShieldExclamationIcon className="h-12 w-12 text-primary drop-shadow-neon" />
              </div>
            </div>
            <span className="mb-5 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-200 backdrop-blur-sm">
              Network defense
            </span>
            <h1 className="font-display text-4xl md:text-6xl font-semibold text-white tracking-tightest leading-[1.05]">
              Early Warning Systems
              <span className="block text-primary">for DDoS protection</span>
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-xl mx-auto leading-relaxed text-pretty">
            Engineered to prevent DDoS attacks before they reach your network — with predictive monitoring, early warning alerts, and real-time response mechanisms that ensure uninterrupted protection.
            </p>
          </div>

          {/* CTA Button */}
          <div className="mt-16">
            <button
              onClick={() => navigate('/prevention')}
              className="group inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-background transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-110 hover:shadow-neon active:scale-[0.98]"
            >
              <span>Start prevention</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background/15 transition-transform duration-300 group-hover:translate-x-0.5">
                <ShieldExclamationIcon className="h-5 w-5" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;