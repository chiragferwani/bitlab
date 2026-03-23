import { useEffect, useRef, useState } from "react";
import bitlabLogo from "@/assets/bitlab_light.png";

interface LandingPageProps {
  onEnter: () => void;
}

const BinaryRain = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const fontSize = 14;
    const cols = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(cols).fill(0).map(() => Math.random() * -50);

    const draw = () => {
      ctx.fillStyle = "rgba(13, 17, 23, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "hsla(36, 91%, 55%, 0.07)";
      ctx.font = `${fontSize}px JetBrains Mono, monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = Math.random() > 0.5 ? "1" : "0";
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += 0.3;
      }
    };

    const interval = setInterval(draw, 80);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
};

const GhostPreview = () => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.04 }}>
    <div className="w-[700px] h-[400px] border border-foreground flex">
      <div className="w-[140px] border-r border-foreground flex flex-col p-2 gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-foreground/30 rounded-sm" style={{ width: `${50 + i * 15}%` }} />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-3 space-y-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-2.5 bg-foreground/20 rounded-sm" style={{ width: `${30 + i * 12}%` }} />
          ))}
        </div>
        <div className="h-5 border-t border-foreground" />
      </div>
      <div className="w-[200px] border-l border-foreground p-2 space-y-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-2 bg-foreground/15 rounded-sm" style={{ width: `${40 + i * 10}%` }} />
        ))}
      </div>
    </div>
  </div>
);

const LandingPage = ({ onEnter }: LandingPageProps) => {
  const [exiting, setExiting] = useState(false);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onEnter, 500);
  };

  return (
    <div
      className={`fixed inset-0 bg-background flex flex-col items-center justify-center overflow-hidden z-50 transition-all duration-500 ${
        exiting ? "opacity-0 translate-y-[-20px]" : "opacity-100 translate-y-0"
      }`}
    >
      <BinaryRain />
      <GhostPreview />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl">
        {/* Logo + Wordmark */}
        <div className="flex items-center gap-3 mb-14">
          <img src={bitlabLogo} alt="BitLab logo" className="w-12 h-12" />
          <span className="font-mono-code font-bold text-lg tracking-[0.3em] text-accent uppercase">
            BitLab
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-mono-code text-4xl md:text-6xl font-bold leading-tight mb-8 text-foreground">
          Write <span className="text-accent">SQL</span>. Run instantly.
          <br />
          <span className="text-accent">No servers</span>. No setup.
        </h1>

        {/* Subtext */}
        <p className="font-ui text-lg md:text-xl text-muted-foreground mb-12 max-w-lg">
          An offline SQL & PL/SQL compiler built for labs, learning, and speed.
        </p>

        {/* CTA */}
        <button
          onClick={handleEnter}
          className="font-mono-code text-base font-semibold px-8 py-4 border-2 border-accent text-accent hover:bg-accent hover:text-accent-foreground transition-all duration-200 tracking-wide"
        >
          Get Started →
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
