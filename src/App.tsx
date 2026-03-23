import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import BitLab from "./pages/BitLab";

const App = () => {
  const [started, setStarted] = useState(false);

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
