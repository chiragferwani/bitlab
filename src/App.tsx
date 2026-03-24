import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import BitLab from "./pages/BitLab";
import VideoLoader from "./components/VideoLoader";

const App = () => {
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  if (loading) {
    return <VideoLoader onComplete={() => setLoading(false)} />;
  }

  return (
    <>
      {!started && <LandingPage onEnter={() => setStarted(true)} />}
      {started && (
        <div className="animate-[fadeSlideIn_0.5s_ease-out]">
          <BitLab />
        </div>
      )}
    </>
  );
};

export default App;
