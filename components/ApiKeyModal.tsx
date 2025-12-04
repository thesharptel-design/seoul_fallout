import React, { useState, useEffect } from 'react';
import { GeminiService } from '../services/geminiService';
import { encryptKey } from '../utils/parser';
import { STORAGE_KEY_API } from '../constants';

interface ApiKeyModalProps {
  onKeySet: (key: string) => void;
  savedKey?: string;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySet, savedKey }) => {
  const [inputKey, setInputKey] = useState(savedKey || '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'error' | 'success'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (savedKey) {
        setInputKey(savedKey);
    }
  }, [savedKey]);

  const handleTestAndSave = async () => {
    const cleanKey = inputKey.trim();
    
    if (!cleanKey) {
        setErrorMsg("API Key cannot be empty.");
        setStatus('error');
        return;
    }

    setStatus('testing');
    setErrorMsg(''); 

    try {
      const service = new GeminiService(cleanKey);
      // validateConnection will now throw if the API call fails
      const isValid = await service.validateConnection();

      if (isValid) {
        setStatus('success');
        // Encrypt and save
        const encrypted = encryptKey(cleanKey);
        localStorage.setItem(STORAGE_KEY_API, encrypted);
        
        // Small delay for user to see success
        setTimeout(() => {
            onKeySet(cleanKey);
        }, 800);
      } else {
        setStatus('error');
        setErrorMsg("Connection verified but returned empty response.");
      }
    } catch (e: any) {
      setStatus('error');
      // Display the actual error message from the SDK (e.g., "Invalid API Key", "Quota exceeded")
      // We strip the "GoogleGenAIError:" prefix if present for cleaner UI
      const msg = e.message || "Error connecting to Gemini API.";
      setErrorMsg(msg.replace('GoogleGenAIError:', '').trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-green-900 shadow-[0_0_20px_rgba(0,255,0,0.1)] rounded-sm p-6 max-w-md w-full relative overflow-hidden">
        {/* Decorative Scanline */}
        <div className="absolute top-0 left-0 w-full h-1 bg-green-600 opacity-50"></div>
        
        <h2 className="text-xl font-mono text-green-500 mb-4 tracking-wider glitch-text">
          SYSTEM ACCESS REQUIRED
        </h2>
        
        <p className="text-gray-400 text-sm mb-6 font-sans">
          To initialize <span className="text-red-500 font-bold">PROJECT: SEOUL FALLOUT</span>, a valid Gemini API key is required. The key will be encrypted and stored locally on your terminal.
        </p>

        <div className="mb-4">
          <label className="block text-xs text-green-700 mb-1 font-mono uppercase">Enter API Key</label>
          <input 
            type="password"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            className="w-full bg-black border border-gray-700 text-green-500 p-2 font-mono text-sm focus:border-green-500 focus:outline-none transition-colors"
            placeholder="AIza..."
          />
        </div>

        {status === 'error' && (
          <div className="mb-4 text-red-500 text-xs font-mono border-l-2 border-red-500 pl-2 break-all">
            [ERROR] {errorMsg}
          </div>
        )}

        {status === 'success' && (
          <div className="mb-4 text-green-400 text-xs font-mono border-l-2 border-green-500 pl-2">
            [SUCCESS] Connection Established. Decrypting protocol...
          </div>
        )}

        <div className="flex justify-end gap-3">
            <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2 text-xs text-gray-500 hover:text-gray-300 font-mono flex items-center"
            >
                Get Key
            </a>
            <button
                onClick={handleTestAndSave}
                disabled={status === 'testing' || status === 'success'}
                className={`px-6 py-2 font-mono text-sm font-bold transition-all ${
                status === 'testing' 
                    ? 'bg-gray-800 text-gray-500 cursor-wait' 
                    : 'bg-green-900 text-green-100 hover:bg-green-700 hover:shadow-[0_0_10px_rgba(0,255,0,0.3)]'
                }`}
            >
                {status === 'testing' ? 'VERIFYING...' : (savedKey ? 'RE-CONNECT' : 'INITIALIZE')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;