import { useState } from "react";
import Grainient from "@/components/Grainient";

interface LandingPageProps {
  onEnter: () => void;
}

const LandingPage = ({ onEnter }: LandingPageProps) => {
  const [exiting, setExiting] = useState(false);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onEnter, 500);
  };

  return (
    <div
      className={`fixed inset-0 bg-[#020202] flex flex-col items-center justify-center overflow-hidden z-50 transition-all duration-500 ${
        exiting ? "opacity-0 translate-y-[-20px]" : "opacity-100 translate-y-0"
      }`}
    >
      {/* Grainient Background */}
      <div className="absolute inset-0 z-0 opacity-40">
        <Grainient
          color1="#34b27b"
          color2="#11181c"
          color3="#202020"
          timeSpeed={0.25}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={2}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.1}
          grainScale={2}
          grainAnimated={false}
          contrast={1.5}
          gamma={1}
          saturation={1}
          centerX={0}
          centerY={0}
          zoom={0.9}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 w-full max-w-[1200px]">
        {/* Logo + Wordmark */}
        <div className="flex items-center gap-0 mb-14">
          <img src="/logo.png" alt="BitLab logo" className="w-32 h-32" />
          <span className="font-bold text-3xl tracking-[0.2em] text-white uppercase">
            BitLab
          </span>
        </div>

        {/* Headline */}
        <div className="mb-10 text-[#e6edf3]">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight whitespace-nowrap overflow-visible">
            Write <span className="text-accent">SQL</span>. Run instantly.
          </h1>
          <p className="text-2xl md:text-3xl font-bold text-[#e6edf3]/80 tracking-tight mt-4">
            <span className="text-accent">No servers</span>. No setup.
          </p>
        </div>

        {/* Subtext */}
        <p className="font-ui text-lg md:text-xl text-[#8b949e] mb-16 whitespace-nowrap overflow-visible">
          An offline SQL & PL/SQL compiler built for labs, learning, and speed.
        </p>

        {/* CTA */}
        <div className="flex flex-col items-center gap-20">
          <button
            onClick={handleEnter}
            className="text-base font-semibold px-10 py-4 border-2 border-accent text-accent hover:bg-accent hover:text-accent-foreground transition-all duration-300 tracking-wide rounded-sm"
          >
            Get Started →
          </button>

          {/* Developer Credit */}
          <div className="text-center animate-fade-in">
            <p className="text-[#8b949e] text-sm tracking-wide">
              Developed by{" "}
              <a
                href="https://chiragferwani.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent/80 hover:text-accent transition-colors duration-200 border-b border-accent/20 hover:border-accent/60"
              >
                ~chiragferwani
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
