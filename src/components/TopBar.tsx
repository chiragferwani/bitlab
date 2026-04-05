import { useState, useEffect } from "react";
import bitlabLogoDark from "@/assets/logo.png";
import bitlabLogoLight from "@/assets/bitlab_light.png";

interface TopBarProps {
  onDelete: () => void;
  canDelete: boolean;
  bootVisible: boolean;
  mode: "SQL" | "PL/SQL" | "MONGODB";
  onModeChange: (mode: "SQL" | "PL/SQL" | "MONGODB") => void;
}

const TopBar = ({ onDelete, canDelete, bootVisible, mode, onModeChange }: TopBarProps) => {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Set dark on mount
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="h-14 flex items-center justify-between px-4 bg-card border-b border-border flex-shrink-0">
      <div className="flex items-center gap-3">
        <img src={isDark ? bitlabLogoDark : bitlabLogoLight} alt="BitLab logo" className="w-10 h-10" />
        <span className="font-bold text-base tracking-wider text-accent">
          BitLab
        </span>
        {bootVisible && (
          <span className="text-xs text-muted-foreground boot-message inline-block">
            v1.1 · SQL/PL·SQL Engine ready ✓
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex bg-muted rounded-md p-1 items-center">
            <button
                onClick={() => onModeChange("SQL")}
                className={`text-[10px] px-3 py-1 rounded-sm transition-all ${mode !== "MONGODB" ? "bg-accent/60 text-accent-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
            >
                SQL / PL·SQL
            </button>
            <button
                onClick={() => onModeChange("MONGODB")}
                className={`text-[10px] px-3 py-1 rounded-sm transition-all ${mode === "MONGODB" ? "bg-accent/60 text-accent-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
            >
                MongoDB
            </button>
        </div>
        <button
          onClick={() => setIsDark(!isDark)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          {isDark ? "☀ Light" : "● Dark"}
        </button>
        {canDelete && (
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
          >
            ✕ Delete Session
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Ctrl+Enter to run
        </span>
      </div>
    </div>
  );
};

export default TopBar;
