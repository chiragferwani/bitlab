import { useEffect, useRef, useState } from "react";
import loaderVideo from "@/assets/loader.mp4";

interface VideoLoaderProps {
  onComplete: () => void;
}

const VideoLoader = ({ onComplete }: VideoLoaderProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set a timer for the total duration (5s)
    const totalDuration = 5000;
    const fadeDuration = 500;

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onComplete, fadeDuration);
    }, totalDuration - fadeDuration);

    const handleLoadedMetadata = () => {
      // Calculate playback rate to fit 5 seconds
      const duration = video.duration;
      if (duration > 0) {
        video.playbackRate = duration / (totalDuration / 1000);
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 bg-[#ffffff] flex items-center justify-center z-[100] transition-opacity duration-500 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src={loaderVideo}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default VideoLoader;
