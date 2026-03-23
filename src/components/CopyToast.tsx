import { useEffect } from "react";

interface CopyToastProps {
  visible: boolean;
  onDone: () => void;
}

const CopyToast = ({ visible, onDone }: CopyToastProps) => {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [visible, onDone]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 bg-card border border-border rounded-full font-mono-code text-xs text-foreground shadow-lg flex items-center gap-2 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <span className="w-1 h-4 bg-accent rounded-full" />
      Output copied to clipboard ✓
    </div>
  );
};

export default CopyToast;
