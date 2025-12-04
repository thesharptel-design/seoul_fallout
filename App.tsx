import React, { useState, useEffect } from 'react';
import ApiKeyModal from './components/ApiKeyModal';
import GameInterface from './components/GameInterface';
import { STORAGE_KEY_API } from './constants';
import { decryptKey } from './utils/parser';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string>('');
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check local storage on mount
    const stored = localStorage.getItem(STORAGE_KEY_API);
    if (stored) {
      const decrypted = decryptKey(stored);
      if (decrypted) {
        setSavedKey(decrypted);
        // We do NOT setApiKey here automatically anymore.
        // This ensures the ApiKeyModal is always the first screen.
      }
    }
    setIsChecking(false);
  }, []);

  const handleKeySet = (key: string) => {
    setApiKey(key);
  };

  if (isChecking) {
    return <div className="h-screen w-full bg-black flex items-center justify-center text-green-500 font-mono">INITIALIZING CORE...</div>;
  }

  return (
    <div className="h-screen w-full bg-black text-white">
      {!apiKey ? (
        <ApiKeyModal onKeySet={handleKeySet} savedKey={savedKey} />
      ) : (
        <GameInterface apiKey={apiKey} />
      )}
    </div>
  );
};

export default App;