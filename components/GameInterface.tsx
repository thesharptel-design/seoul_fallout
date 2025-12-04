import React, { useState, useEffect, useRef } from 'react';
import { GeminiService } from '../services/geminiService';
import { GameState, Message } from '../types';
import { parseGameResponse, parseHudToState } from '../utils/parser';
import { STORAGE_KEY_SETTINGS, STORAGE_KEY_LEGACY } from '../constants';

interface GameInterfaceProps {
  apiKey: string;
}

interface VisualSettings {
  fontStyle: 'style-digital' | 'style-clean' | 'style-retro';
  fontFamily: 'font-sans' | 'font-serif' | 'font-mono';
  fontSize: 'text-sm' | 'text-base' | 'text-lg' | 'text-xl';
}

type GamePhase = 'intro' | 'selection' | 'perk-selection' | 'job-selection' | 'playing';

interface JobOption {
  id: string;
  name: string;
  desc: string;
  tags: string[];
}

const JOBS: JobOption[] = [
  { id: 'Mercenary', name: '용병 (MERCENARY)', desc: '전투 전문가. 높은 체력과 무기 숙련도.', tags: ['[전투]', '[화기]'] },
  { id: 'Technician', name: '기술자 (TECHNICIAN)', desc: '기계와 해킹의 마스터. 폐허 속 장비 제어.', tags: ['[공학]', '[해킹]'] },
  { id: 'Doctor', name: '의사 (DOCTOR)', desc: '생존을 위한 의료 지식과 화학물질 제조.', tags: ['[의학]', '[화학]'] },
  { id: 'Scavenger', name: '스캐빈저 (SCAVENGER)', desc: '은신과 탐색에 특화된 생존 전문가.', tags: ['[은신]', '[탐색]'] },
];

const GameInterface: React.FC<GameInterfaceProps> = ({ apiKey }) => {
  // Game Logic State
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [unlockedPerks, setUnlockedPerks] = useState<string[]>([]);
  const [selectedPerk, setSelectedPerk] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gameState, setGameState] = useState<Partial<GameState>>({});
  const [gemini, setGemini] = useState<GeminiService | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  
  // UI State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visualSettings, setVisualSettings] = useState<VisualSettings>({
    fontStyle: 'style-digital',
    fontFamily: 'font-sans',
    fontSize: 'text-lg'
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load Settings and Legacy Perks
  useEffect(() => {
    const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            setVisualSettings(prev => ({ ...prev, ...parsed }));
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    const savedPerks = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (savedPerks) {
        try {
            const parsed = JSON.parse(savedPerks);
            if (Array.isArray(parsed)) {
                setUnlockedPerks(parsed);
            }
        } catch (e) {
            console.error("Failed to load legacy perks", e);
        }
    }
  }, []);

  // Initialize Service
  useEffect(() => {
    const service = new GeminiService(apiKey);
    setGemini(service);
  }, [apiKey]);

  // Save Settings
  const updateSettings = (newSettings: Partial<VisualSettings>) => {
      const updated = { ...visualSettings, ...newSettings };
      setVisualSettings(updated);
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
  };

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // --- Handlers ---

  const handleModeSelect = (legacy: boolean) => {
    if (legacy) {
        if (unlockedPerks.length === 0) {
            setFlashMsg("획득한 특전이 없습니다. (No Legacy Data)");
            setTimeout(() => setFlashMsg(null), 2500);
            return;
        }
        setPhase('perk-selection');
    } else {
        setSelectedPerk(null);
        setPhase('job-selection');
    }
  };

  const handlePerkSelect = (perk: string) => {
      setSelectedPerk(perk);
      setPhase('job-selection');
  };

  const handleJobSelect = async (jobName: string) => {
      if (!gemini) return;
      setPhase('playing');
      setIsLoading(true);
      try {
          // Pass the selected job and the specific perk string
          const response = await gemini.startGame(jobName, selectedPerk);
          handleModelResponse(response);
      } catch (e) {
          console.error(e);
          setMessages(prev => [...prev, { role: 'system', content: '[ERROR] SYSTEM FAILURE during initialization.' }]);
      } finally {
          setIsLoading(false);
      }
  };

  const handleModelResponse = (text: string) => {
    // Check for System Reset signal from AI
    if (text.includes('[SYSTEM_RESET]')) {
        setPhase('selection');
        setMessages([]);
        setGameState({});
        setSelectedPerk(null);
        // Force new session to clear context
        const newService = new GeminiService(apiKey);
        setGemini(newService);
        return;
    }

    // Check for Perk Acquisition: [PERK_ACQUIRED: Perk Name]
    const perkRegex = /\[PERK_ACQUIRED:\s*(.*?)\]/;
    const perkMatch = text.match(perkRegex);
    if (perkMatch) {
        const newPerk = perkMatch[1].trim();
        if (newPerk && !unlockedPerks.includes(newPerk)) {
            const updatedPerks = [...unlockedPerks, newPerk];
            setUnlockedPerks(updatedPerks);
            localStorage.setItem(STORAGE_KEY_LEGACY, JSON.stringify(updatedPerks));
            setFlashMsg(`[SYSTEM] NEW LEGACY ACQUIRED: ${newPerk}`);
            setTimeout(() => setFlashMsg(null), 4000);
        }
    }

    const parsed = parseGameResponse(text);
    setMessages(prev => [...prev, { role: 'model', content: parsed.narrative }]);
    if (parsed.hudRaw) {
        const newState = parseHudToState(parsed.hudRaw);
        setGameState(newState);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !gemini || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
        const response = await gemini.sendMessage(userMsg);
        handleModelResponse(response);
    } catch (e) {
        console.error(e);
        setMessages(prev => [...prev, { role: 'system', content: '[ERROR] Connection lost. Retrying data packet...' }]);
    } finally {
        setIsLoading(false);
    }
  };

  // --- Styles ---

  const getContainerClasses = () => {
      switch (visualSettings.fontStyle) {
          case 'style-clean': return 'bg-[#111] text-gray-100';
          case 'style-retro': return 'bg-[#1a1200] text-[#ffb000] theme-retro';
          case 'style-digital': default: return 'bg-black text-gray-200';
      }
  };

  const getButtonClass = (isActive: boolean) => {
      const isRetro = visualSettings.fontStyle === 'style-retro';
      const activeBase = isRetro 
        ? 'border-[#ffb000] text-[#ffb000] bg-[#ffb000]/20' 
        : 'border-green-600 text-green-400 bg-green-900/20';
      const inactiveBase = 'border-gray-700 text-gray-500 hover:border-gray-500';
      return `flex-1 py-1 text-xs border transition-colors ${isActive ? activeBase : inactiveBase}`;
  };

  const isRetro = visualSettings.fontStyle === 'style-retro';
  const accentColor = isRetro ? 'text-[#ffb000]' : 'text-green-500';
  const borderColor = isRetro ? 'border-[#553b00]' : 'border-green-900';

  // --- Renders ---

  // 1. Intro Screen
  if (phase === 'intro') {
      return (
        <div className={`h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden ${getContainerClasses()}`}>
             {visualSettings.fontStyle === 'style-digital' && (
                <div className="fixed inset-0 crt-overlay pointer-events-none z-10"></div>
            )}
            <div className={`max-w-2xl w-full border-2 p-8 text-center relative z-20 ${borderColor}`}>
                <h1 className={`text-4xl md:text-6xl font-black tracking-tighter mb-4 glitch-text ${isRetro ? 'text-[#ffb000]' : 'text-red-600'}`}>
                    SEOUL FALLOUT
                </h1>
                <p className={`font-mono text-sm md:text-base mb-8 opacity-80 ${isRetro ? 'text-[#cc8800]' : 'text-gray-400'}`}>
                    Post-Apocalyptic Survival Simulation<br/>
                    Seoul, 2045. No Plot Armor. No Mercy.
                </p>
                <div className="space-y-4 font-mono text-xs text-left mb-8 opacity-70 p-4 border border-dashed border-gray-800">
                    <p>SYSTEM WARNING:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>This simulation contains graphical descriptions of violence and trauma.</li>
                        <li>RNG is absolute. Death is permanent.</li>
                        <li>Your choices determine your survival.</li>
                    </ul>
                </div>
                <button 
                    onClick={() => setPhase('selection')}
                    className={`w-full py-4 font-mono font-bold text-lg tracking-widest border transition-all hover:bg-opacity-20 ${
                        isRetro 
                        ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]' 
                        : 'border-green-600 text-green-500 hover:bg-green-500'
                    }`}
                >
                    CONNECT TO SERVER
                </button>
            </div>
        </div>
      );
  }

  // 2. Selection Screen
  if (phase === 'selection') {
      return (
        <div className={`h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden ${getContainerClasses()}`}>
             {visualSettings.fontStyle === 'style-digital' && (
                <div className="fixed inset-0 crt-overlay pointer-events-none z-10"></div>
            )}
            <div className={`max-w-md w-full relative z-20`}>
                <h2 className={`text-2xl font-mono mb-8 text-center border-b pb-4 ${borderColor} ${accentColor}`}>
                    INITIALIZATION SEQUENCE
                </h2>
                
                {flashMsg && (
                    <div className="mb-6 p-3 bg-red-900/20 border border-red-500 text-red-500 font-mono text-xs text-center animate-pulse">
                        {flashMsg}
                    </div>
                )}

                <div className="space-y-4">
                    <button 
                        onClick={() => handleModeSelect(false)}
                        className={`w-full p-6 text-left border group transition-all relative overflow-hidden ${
                            isRetro 
                            ? 'border-[#ffb000] hover:bg-[#ffb000]/10' 
                            : 'border-gray-700 hover:border-green-500 hover:bg-gray-900'
                        }`}
                    >
                        <div className={`font-bold font-mono text-xl mb-1 group-hover:pl-2 transition-all ${isRetro ? 'text-[#ffb000]' : 'text-white'}`}>
                            ZERO HOUR
                        </div>
                        <div className="text-xs font-mono opacity-50">
                            Start a new timeline. Random start. High morality risk.
                        </div>
                    </button>

                    <button 
                        onClick={() => handleModeSelect(true)}
                        className={`w-full p-6 text-left border group transition-all relative overflow-hidden ${
                            isRetro 
                            ? 'border-[#553b00] text-[#886600] hover:border-[#ffb000] hover:text-[#ffb000]' 
                            : 'border-gray-800 text-gray-500 hover:border-blue-500 hover:text-blue-400'
                        }`}
                    >
                        <div className="flex justify-between items-center mb-1">
                            <div className="font-bold font-mono text-xl group-hover:pl-2 transition-all">
                                LEGACY ACCESS
                            </div>
                            <div className="text-xs border px-2 py-0.5 opacity-70">
                                {unlockedPerks.length} PERKS
                            </div>
                        </div>
                        <div className="text-xs font-mono opacity-50">
                            Apply Perks from previous survival records.
                        </div>
                    </button>
                </div>
                
                <button 
                    onClick={() => setPhase('intro')}
                    className="mt-8 w-full text-center text-xs font-mono opacity-30 hover:opacity-100 transition-opacity"
                >
                    [ RETURN TO TITLE ]
                </button>
            </div>
        </div>
      );
  }

  // 3. Perk Selection Screen
  if (phase === 'perk-selection') {
      return (
        <div className={`h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden ${getContainerClasses()}`}>
             {visualSettings.fontStyle === 'style-digital' && (
                <div className="fixed inset-0 crt-overlay pointer-events-none z-10"></div>
            )}
            <div className={`max-w-2xl w-full relative z-20`}>
                <h2 className={`text-2xl font-mono mb-2 text-center ${accentColor}`}>
                    LEGACY DATABASE
                </h2>
                <div className="text-center text-xs opacity-50 mb-8 font-mono">
                    Select one perk to initialize this timeline.
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {unlockedPerks.map((perk, idx) => (
                        <button
                            key={idx}
                            onClick={() => handlePerkSelect(perk)}
                            className={`p-4 border text-left font-mono text-sm transition-all hover:pl-6 ${
                                isRetro 
                                ? 'border-[#553b00] hover:border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000]/10' 
                                : 'border-gray-800 hover:border-green-500 text-gray-300 hover:bg-gray-900'
                            }`}
                        >
                            {perk}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => setPhase('selection')}
                    className="mt-8 w-full text-center text-xs font-mono opacity-30 hover:opacity-100 transition-opacity"
                >
                    [ 뒤로 가기 ]
                </button>
            </div>
        </div>
      );
  }

  // 4. Job Selection Screen
  if (phase === 'job-selection') {
      return (
        <div className={`h-screen w-full flex flex-col items-center justify-center p-6 relative overflow-hidden ${getContainerClasses()}`}>
             {visualSettings.fontStyle === 'style-digital' && (
                <div className="fixed inset-0 crt-overlay pointer-events-none z-10"></div>
            )}
            <div className={`max-w-4xl w-full relative z-20`}>
                <h2 className={`text-xl font-mono mb-2 text-center ${accentColor}`}>
                    직업 선택 (SELECT CLASS)
                </h2>
                <div className="text-center text-xs opacity-50 mb-8 font-mono">
                    모드: {selectedPerk ? `계승 적용 [${selectedPerk}]` : '제로 아워 (초기화)'}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {JOBS.map((job) => (
                        <button 
                            key={job.id}
                            onClick={() => handleJobSelect(job.name)}
                            className={`p-6 border text-left group transition-all relative overflow-hidden flex flex-col justify-between h-32 ${
                                isRetro 
                                ? 'border-[#553b00] hover:border-[#ffb000] hover:bg-[#ffb000]/10' 
                                : 'border-gray-800 hover:border-green-500 hover:bg-gray-900'
                            }`}
                        >
                            <div>
                                <div className={`font-bold font-mono text-lg mb-1 group-hover:text-white transition-colors ${isRetro ? 'text-[#ffb000]' : 'text-gray-200'}`}>
                                    {job.name}
                                </div>
                                <div className="text-xs opacity-60 font-sans">
                                    {job.desc}
                                </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                {job.tags.map(tag => (
                                    <span key={tag} className="text-[10px] uppercase border border-opacity-30 px-1 opacity-70">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => setPhase('selection')}
                    className="mt-8 w-full text-center text-xs font-mono opacity-30 hover:opacity-100 transition-opacity"
                >
                    [ 뒤로 가기 ]
                </button>
            </div>
        </div>
      );
  }

  // 5. Playing Phase (Main Game UI)
  return (
    <div className={`flex flex-col md:flex-row h-screen w-full overflow-hidden relative transition-colors duration-300 ${getContainerClasses()}`}>
      
      {visualSettings.fontStyle === 'style-digital' && (
          <div className="fixed inset-0 crt-overlay pointer-events-none z-10"></div>
      )}

      {/* MOBILE HEADER ICON / TOGGLE */}
      <div className="md:hidden absolute top-4 right-4 z-50">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`p-2 border backdrop-blur-sm shadow-lg ${
                isRetro 
                ? 'bg-[#1a1000]/80 border-[#ffb000] text-[#ffb000]' 
                : 'bg-black/80 border-green-600 text-green-500'
            }`}
          >
              {isMobileMenuOpen ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
          </button>
      </div>

      {/* FLASH MESSAGE OVERLAY (Game Phase) */}
      {flashMsg && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-6 py-2 bg-black border border-green-500 text-green-500 font-mono shadow-[0_0_20px_rgba(0,255,0,0.3)] animate-pulse">
            {flashMsg}
        </div>
      )}
      
      {/* SIDEBAR (HUD) */}
      <div className={`
          flex-shrink-0 border-r flex flex-col p-4 overflow-y-auto transition-all duration-300
          ${isRetro ? 'bg-[#120c00] border-[#332200]' : 'bg-[#0a0a0a] border-[#1a1a1a]'}
          
          /* Mobile: Fixed overlay behavior */
          ${isMobileMenuOpen 
             ? 'fixed inset-0 z-40 w-full h-full' // Open: Full screen overlay
             : 'hidden' // Closed: Hidden
          }
          
          /* Desktop: Always visible as a sidebar */
          md:relative md:block md:w-80 md:h-full md:flex
      `}>
        <h1 className={`text-2xl font-black tracking-tighter mb-6 border-b pb-2 flex justify-between items-center ${
            isRetro ? 'text-[#ffb000] border-[#553b00]' : 'text-red-600 border-red-900'
        }`}>
            <span>SEOUL FALLOUT</span>
            <span className="text-[10px] font-mono opacity-60">ACTIVE</span>
        </h1>

        <div className="flex-1 space-y-6 font-mono text-sm flex flex-col">
            {/* HP / Mental */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="opacity-60">HP</span>
                    <span className={`font-bold ${isRetro ? '' : 'text-red-400'}`}>{gameState.hp || '---'}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="opacity-60">MENTAL</span>
                    <span className={`font-bold ${isRetro ? '' : 'text-blue-400'}`}>{gameState.mental || '---'}</span>
                </div>
            </div>

            {/* Stats */}
            <div className={`p-3 border rounded ${isRetro ? 'bg-[#221500] border-[#442b00]' : 'bg-gray-900 border-gray-800'}`}>
                <div className={`text-xs uppercase mb-2 ${accentColor}`}>Parameters</div>
                <div className="opacity-80 whitespace-pre-wrap">{gameState.stats || 'Analyzing subject...'}</div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
                <div className={`text-xs uppercase ${accentColor}`}>Tags</div>
                <div className="flex flex-wrap gap-2">
                    {gameState.tags && gameState.tags.length > 0 ? (
                        gameState.tags.map((tag, i) => (
                            <span key={i} className={`px-2 py-1 border text-xs rounded-sm ${
                                isRetro 
                                ? 'bg-[#332200] border-[#553b00] text-[#ffb000]' 
                                : 'bg-green-900/20 border-green-800 text-green-400'
                            }`}>
                                {tag}
                            </span>
                        ))
                    ) : (
                        <span className="opacity-50 italic">None</span>
                    )}
                </div>
            </div>

            {/* Equipment */}
            <div className="space-y-1">
                 <div className={`text-xs uppercase ${accentColor}`}>Equipment</div>
                 <div className={`text-xs leading-relaxed border-l-2 pl-2 opacity-80 ${isRetro ? 'border-[#553b00]' : 'border-gray-800'}`}>
                    {gameState.equipment || 'Empty'}
                 </div>
            </div>

             {/* Notes */}
             <div className={`pt-4 border-t mt-auto ${isRetro ? 'border-[#332200]' : 'border-gray-800'}`}>
                 <div className={`text-xs uppercase mb-1 ${isRetro ? 'text-[#cc8800]' : 'text-yellow-700'}`}>Log Data</div>
                 <div className={`text-xs italic opacity-80 ${isRetro ? 'text-[#ffb000]' : 'text-yellow-500'}`}>
                    {gameState.notes || 'No critical updates.'}
                 </div>
            </div>

            {/* Visual Settings */}
            <div className={`pt-4 border-t ${isRetro ? 'border-[#332200]' : 'border-gray-800'}`}>
                <div className="text-xs opacity-60 uppercase mb-3">System Config</div>
                
                {/* Font Style */}
                <div className="mb-4">
                    <div className="text-[10px] opacity-50 mb-1 uppercase tracking-wider">Visual Mode</div>
                    <div className="flex gap-1">
                        <button onClick={() => updateSettings({ fontStyle: 'style-digital' })} className={getButtonClass(visualSettings.fontStyle === 'style-digital')}>Digital</button>
                        <button onClick={() => updateSettings({ fontStyle: 'style-clean' })} className={getButtonClass(visualSettings.fontStyle === 'style-clean')}>Clean</button>
                        <button onClick={() => updateSettings({ fontStyle: 'style-retro' })} className={getButtonClass(visualSettings.fontStyle === 'style-retro')}>Retro</button>
                    </div>
                </div>

                {/* Font Face */}
                <div className="mb-4">
                    <div className="text-[10px] opacity-50 mb-1 uppercase tracking-wider">Typeface</div>
                    <div className="flex gap-1">
                        <button onClick={() => updateSettings({ fontFamily: 'font-sans' })} className={getButtonClass(visualSettings.fontFamily === 'font-sans')}>Sans</button>
                        <button onClick={() => updateSettings({ fontFamily: 'font-serif' })} className={getButtonClass(visualSettings.fontFamily === 'font-serif')}>Serif</button>
                        <button onClick={() => updateSettings({ fontFamily: 'font-mono' })} className={getButtonClass(visualSettings.fontFamily === 'font-mono')}>Mono</button>
                    </div>
                </div>

                {/* Font Size */}
                <div>
                    <div className="text-[10px] opacity-50 mb-1 uppercase tracking-wider">Text Size</div>
                    <div className="flex gap-1">
                        <button onClick={() => updateSettings({ fontSize: 'text-sm' })} className={getButtonClass(visualSettings.fontSize === 'text-sm')}>S</button>
                        <button onClick={() => updateSettings({ fontSize: 'text-base' })} className={getButtonClass(visualSettings.fontSize === 'text-base')}>M</button>
                        <button onClick={() => updateSettings({ fontSize: 'text-lg' })} className={getButtonClass(visualSettings.fontSize === 'text-lg')}>L</button>
                        <button onClick={() => updateSettings({ fontSize: 'text-xl' })} className={getButtonClass(visualSettings.fontSize === 'text-xl')}>XL</button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* MAIN TERMINAL */}
      <div className={`flex-1 flex flex-col h-full relative z-0 ${isRetro ? 'bg-[#1a1000]' : 'bg-transparent'}`}>
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            {messages.map((msg, idx) => (
                <div key={idx} className={`max-w-3xl mx-auto ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    {msg.role === 'model' && (
                        <div className={`prose prose-invert max-w-none ${
                            isRetro 
                                ? 'prose-p:text-[#ffb000] prose-headings:text-[#ffb000] prose-strong:text-[#ffcc00]' 
                                : 'prose-p:text-gray-300 prose-headings:text-red-500 prose-strong:text-white'
                        }`}>
                            <div className={`whitespace-pre-wrap leading-relaxed ${visualSettings.fontFamily} ${visualSettings.fontSize}`}>
                                {msg.content}
                            </div>
                        </div>
                    )}
                    {msg.role === 'user' && (
                        <div className={`inline-block border px-4 py-2 rounded-sm font-mono text-sm ${
                            isRetro
                                ? 'bg-[#332200] border-[#553b00] text-[#ffb000]'
                                : 'bg-gray-900 border-gray-700 text-gray-200'
                        }`}>
                            {`> ${msg.content}`}
                        </div>
                    )}
                     {msg.role === 'system' && (
                        <div className={`text-center font-mono text-xs animate-pulse ${
                            isRetro ? 'text-[#ffb000]' : 'text-red-500'
                        }`}>
                            {msg.content}
                        </div>
                    )}
                </div>
            ))}
            {isLoading && (
                <div className="max-w-3xl mx-auto">
                    <span className="inline-flex gap-1">
                        <span className={`w-2 h-2 animate-bounce ${isRetro ? 'bg-[#ffb000]' : 'bg-green-500'}`}></span>
                        <span className={`w-2 h-2 animate-bounce delay-100 ${isRetro ? 'bg-[#ffb000]' : 'bg-green-500'}`}></span>
                        <span className={`w-2 h-2 animate-bounce delay-200 ${isRetro ? 'bg-[#ffb000]' : 'bg-green-500'}`}></span>
                    </span>
                </div>
            )}
            <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className={`p-4 border-t z-20 ${
            isRetro ? 'bg-[#1a1000] border-[#332200]' : 'bg-black border-gray-800'
        }`}>
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-2">
                <div className="relative flex-1 group">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-mono text-lg animate-pulse ${accentColor}`}>{'>'}</span>
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="What do you do?"
                        className={`w-full py-3 pl-8 pr-4 font-mono focus:outline-none focus:ring-1 transition-all ${
                            isRetro
                                ? 'bg-[#221500] border border-[#442b00] text-[#ffb000] placeholder-[#cc8800] focus:border-[#ffb000] focus:ring-[#ffb000]/50'
                                : 'bg-[#050505] border border-gray-800 text-gray-200 focus:border-green-600 focus:ring-green-900'
                        }`}
                        disabled={isLoading}
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={isLoading || !input.trim()}
                    className={`px-6 py-2 font-mono disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase text-sm tracking-widest border ${
                        isRetro
                            ? 'bg-[#332200] border-[#553b00] text-[#ffb000] hover:bg-[#ffb000]/20 hover:border-[#ffb000]'
                            : 'bg-gray-900 border-gray-700 text-green-500 hover:bg-green-900/20 hover:border-green-500'
                    }`}
                >
                    Act
                </button>
            </form>
            <div className="max-w-3xl mx-auto mt-2 text-center text-xs opacity-50 font-mono">
                PROJECT: SEOUL FALLOUT | PROTOTYPE BUILD
            </div>
        </div>
      </div>
    </div>
  );
};

export default GameInterface;