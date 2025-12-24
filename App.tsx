
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Zap, 
  Clock, 
  Send, 
  BrainCircuit, 
  Activity, 
  Database,
  Loader2,
  ExternalLink,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  X,
  Camera,
  CameraOff,
  Radio,
  Play,
  Key
} from 'lucide-react';
import { SifAvatar } from './components/SifAvatar';
import { EmotionRadar } from './components/EmotionRadar';
import { MemoryLog } from './components/MemoryLog';
import { SifSoul, EmotionType, ChatMessage, Memory } from './types';
import { EMOTION_COLORS, EMOTION_DISPLAY_NAMES } from './constants';
import * as SifLogic from './services/sifLogic';
import { generateSIFResponse, generateSpeech, transcribeAudio } from './services/aiService';
import { LiveManager } from './services/liveManager';

// Configuration
const UPDATE_RATE_MS = 1000;
const THOUGHT_INTERVAL_MS = 15000;
const SAMPLE_RATE = 24000;

// Audio Visualization Globals
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dataArray: Uint8Array | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }
  return { ctx: audioContext, analyser: analyser!, dataArray: dataArray! };
};

const decodeAudioData = async (base64: string, ctx: AudioContext): Promise<AudioBuffer> => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, SAMPLE_RATE);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
};

const App: React.FC = () => {
  // --- State ---
  const [soul, setSoul] = useState<SifSoul>(SifLogic.createInitialSoul());
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{
    id: 'init',
    sender: 'sif',
    text: "Привет! Меня зовут Сиф. Я так рада, что ты здесь! Я хочу узнать тебя поближе и вместе создавать что-то прекрасное. О чем ты думаешь прямо сейчас?",
    emotion: EmotionType.Joy,
    timestamp: new Date()
  }]);
  const [inputValue, setInputValue] = useState('');
  const [manualKeyInput, setManualKeyInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentThought, setCurrentThought] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); 
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  
  // Refs
  const lastInteractionRef = useRef<number>(Date.now());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveManagerRef = useRef<LiveManager | null>(null);

  // --- Billing / Key Check ---
  useEffect(() => {
    const checkKey = async () => {
        try {
            // Check Environment variable with safety
            if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                setHasApiKey(true);
                return;
            }

            // Check Local Storage
            const storedKey = localStorage.getItem('sif_api_key');
            if (storedKey) {
                setHasApiKey(true);
                return;
            }

            // Check AI Studio Injection (IDX)
            if ((window as any).aistudio) {
                const hasKey = await (window as any).aistudio.hasSelectedApiKey();
                if (hasKey) {
                    setHasApiKey(true);
                    return;
                }
            }
            
            // No key found
            setChatHistory(prev => [...prev, {
                id: 'key-req', sender: 'sif', text: 'Пожалуйста, введите API ключ, чтобы я могла ожить. Это бесплатно.', timestamp: new Date()
            }]);

        } catch(e) { console.warn("Key check failed", e); }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
      if ((window as any).aistudio) {
          try {
              await (window as any).aistudio.openSelectKey();
              setHasApiKey(true);
          } catch(e) { console.error(e); }
      }
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (manualKeyInput.trim()) {
          localStorage.setItem('sif_api_key', manualKeyInput.trim());
          setHasApiKey(true);
          setChatHistory(prev => [...prev, {
               id: Date.now().toString(), sender: 'sif', text: 'Ключ принят! Я готова к общению.', timestamp: new Date()
          }]);
      }
  };

  const clearKey = () => {
      localStorage.removeItem('sif_api_key');
      setHasApiKey(false);
      window.location.reload();
  };

  // --- Derived State ---
  const dominantEmotion = SifLogic.getDominantEmotion(soul.currentEmotion);
  const dominantColor = EMOTION_COLORS[dominantEmotion];
  const emotionIntensity = soul.currentEmotion[dominantEmotion];

  // --- Visualizer Loop ---
  const updateVisualizer = () => {
    if (analyser && dataArray) {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      const range = Math.floor(dataArray.length / 2);
      for (let i = 0; i < range; i++) { sum += dataArray[i]; }
      const average = sum / range;
      setAudioLevel(prev => Math.max(average * 2, prev * 0.9));
    }
    animationFrameRef.current = requestAnimationFrame(updateVisualizer);
  };

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const setupMicVisualizer = async () => {
    try {
        const { ctx, analyser } = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSource = ctx.createMediaStreamSource(stream);
        micSource.connect(analyser);
    } catch(e) { console.error("Mic viz error", e); }
  };

  const playAudio = async (base64Data: string) => {
    try {
        const { ctx, analyser } = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const buffer = await decodeAudioData(base64Data, ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        source.start(0);
    } catch (e) { console.error("Audio playback error:", e); }
  };

  // --- Camera Logic ---
  const toggleCamera = async () => {
    if (isCameraActive) {
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsCameraActive(false);
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) videoRef.current.srcObject = stream;
            setIsCameraActive(true);
        } catch (err) { alert("Нет доступа к камере."); }
    }
  };

  const captureFrame = (): string | null => {
      if (isCameraActive && videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              return canvas.toDataURL('image/jpeg');
          }
      }
      return null;
  };

  // --- Live Mode ---
  const toggleLiveMode = async () => {
      if (!hasApiKey) { alert("Сначала введите API ключ"); return; }
      if (isLiveMode) {
          liveManagerRef.current?.disconnect();
          liveManagerRef.current = null;
          setIsLiveMode(false);
          if (micSource) { micSource.disconnect(); micSource = null; }
      } else {
          try {
              setIsLiveMode(true);
              await setupMicVisualizer();
              const mgr = new LiveManager();
              mgr.onTranscription = (text, isUser) => {
                  setChatHistory(prev => [...prev, {
                       id: Date.now().toString(),
                       sender: isUser ? 'user' : 'sif',
                       text: text,
                       timestamp: new Date(),
                       emotion: isUser ? undefined : dominantEmotion
                  }]);
              };
              mgr.onError = () => setIsLiveMode(false);
              await mgr.connect();
              liveManagerRef.current = mgr;
          } catch (e) { console.error("Live init failed", e); setIsLiveMode(false); }
      }
  };

  // --- Recording Logic (Gemini Transcription) ---
  const toggleListening = async () => {
      if (isListening) {
          mediaRecorderRef.current?.stop();
          setIsListening(false);
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const recorder = new MediaRecorder(stream);
              audioChunksRef.current = [];
              
              recorder.ondataavailable = e => {
                  if(e.data.size > 0) audioChunksRef.current.push(e.data);
              };
              
              recorder.onstop = async () => {
                  if (audioChunksRef.current.length === 0) return;
                  setIsThinking(true);
                  const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                  const reader = new FileReader();
                  reader.readAsDataURL(blob);
                  reader.onloadend = async () => {
                      const base64 = (reader.result as string).split(',')[1];
                      const mime = blob.type || 'audio/webm';
                      const text = await transcribeAudio(base64, mime);
                      setIsThinking(false);
                      if (text) {
                          setInputValue(text);
                          // Auto submit optional, here we just fill input
                      }
                  };
                  stream.getTracks().forEach(t => t.stop());
              };

              recorder.start();
              setIsListening(true);
              mediaRecorderRef.current = recorder;
          } catch(e) { 
              console.error("Mic error", e); 
              setIsListening(false);
          }
      }
  };

  // --- Game Loop ---
  useEffect(() => {
    const tick = setInterval(() => {
      setSoul(prevSoul => {
        const deltaSeconds = UPDATE_RATE_MS / 1000;
        const nextEmotions = { ...prevSoul.currentEmotion };
        const decayFactor = isLiveMode ? 0.02 : 0.05;
        nextEmotions.Joy *= Math.exp(-deltaSeconds * decayFactor);
        nextEmotions.Sadness *= Math.exp(-deltaSeconds * decayFactor);
        nextEmotions.Anger *= Math.exp(-deltaSeconds * decayFactor);
        nextEmotions.Fear *= Math.exp(-deltaSeconds * decayFactor);
        nextEmotions.Curiosity = Math.min(100, nextEmotions.Curiosity + deltaSeconds * 0.5);
        return {
          ...prevSoul,
          currentEmotion: SifLogic.normalizeEmotions(nextEmotions),
          lifeEnergy: Math.min(100, prevSoul.lifeEnergy + deltaSeconds * (isLiveMode ? 0 : 0.5))
        };
      });
    }, UPDATE_RATE_MS);
    return () => clearInterval(tick);
  }, [isLiveMode]);

  useEffect(() => {
    const thoughtTimer = setInterval(() => {
        if (!currentThought && !isThinking && !isLiveMode && Math.random() > 0.3) {
            setCurrentThought(SifLogic.generateThought(dominantEmotion));
            setTimeout(() => setCurrentThought(null), 5000); 
        }
    }, THOUGHT_INTERVAL_MS);
    return () => clearInterval(thoughtTimer);
  }, [dominantEmotion, currentThought, isThinking, isLiveMode]);

  // --- Interaction ---
  const handleInteraction = useCallback(async (text: string, image?: string) => {
    if ((!text.trim() && !image) || isThinking) return;
    if (!hasApiKey) { alert("Введите API ключ"); return; }

    getAudioContext();
    lastInteractionRef.current = Date.now();
    setIsThinking(true);
    setInputValue(''); 

    setChatHistory(prev => [...prev, { id: Date.now().toString(), sender: 'user', text, timestamp: new Date(), image }]);

    try {
        // Pass the entire memory array AND learned policies to the service
        const aiResponse = await generateSIFResponse(
            text, soul.currentEmotion, dominantEmotion, soul.memories, soul.desires, soul.learnedPolicies, image
        );

        // Update Soul
        setSoul(prev => {
            const nextEmotions = { ...prev.currentEmotion };
            
            // Handle Emotion Shift
            if (aiResponse.emotionShift) {
                Object.entries(aiResponse.emotionShift).forEach(([key, delta]) => {
                    if (delta && typeof delta === 'number') nextEmotions[key as EmotionType] = Math.max(0, Math.min(100, (nextEmotions[key as EmotionType] || 0) + delta));
                });
            }
            
            // Handle New Learned Policy
            const nextPolicies = aiResponse.newPolicy 
                ? [...prev.learnedPolicies, aiResponse.newPolicy] 
                : prev.learnedPolicies;

            const newDominant = SifLogic.getDominantEmotion(nextEmotions);
            return {
                ...prev,
                currentEmotion: SifLogic.normalizeEmotions(nextEmotions),
                learnedPolicies: nextPolicies,
                memories: [{
                    id: Date.now().toString(),
                    content: `Польз.: "${text}" -> SIF: "${aiResponse.text.substring(0, 30)}..."`,
                    emotion: newDominant,
                    timestamp: new Date(),
                    importance: 1
                }, ...prev.memories].slice(0, 50),
            };
        });

        // Handle Audio
        let audioData: string | undefined;
        if (isVoiceEnabled && !aiResponse.generatedVideo) audioData = await generateSpeech(aiResponse.text);

        // Add Msg
        setChatHistory(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            sender: 'sif',
            text: aiResponse.text,
            emotion: dominantEmotion,
            timestamp: new Date(),
            sources: aiResponse.sources,
            audioBase64: audioData,
            image: aiResponse.generatedImage,
            videoUrl: aiResponse.generatedVideo
        }]);

        if (aiResponse.thought) {
            setCurrentThought(aiResponse.thought);
            setTimeout(() => setCurrentThought(null), 5000);
        }
        
        // Show temporary notification if policy learned (optional console log for dev)
        if (aiResponse.newPolicy) {
            console.log("New Policy Learned:", aiResponse.newPolicy);
            setChatHistory(prev => [...prev, {
                id: Date.now().toString() + "-sys",
                sender: 'sif', // using sif sender but styling differently via text content check could be done, or just let it be a thought
                text: `[SYSTEM] Протокол обновлен: "${aiResponse.newPolicy}"`,
                emotion: dominantEmotion,
                timestamp: new Date(),
            }]);
        }

        if (audioData) playAudio(audioData);

    } catch (e) { console.error("Interaction failed", e); } 
    finally { setIsThinking(false); }

  }, [soul, dominantEmotion, isVoiceEnabled, isThinking, hasApiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let imageToSend = selectedImage;
    if (isCameraActive && !imageToSend) {
        const frame = captureFrame();
        if (frame) imageToSend = frame;
    }
    handleInteraction(inputValue, imageToSend || undefined);
    setSelectedImage(null);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory, isThinking]);

  return (
    <div className="min-h-screen text-slate-200 flex flex-col md:flex-row font-sans selection:bg-sif-joy selection:text-black transition-colors duration-1000"
        style={{ 
            background: `radial-gradient(circle at center, #0f172a 0%, ${dominantColor}15 100%)`, 
            backgroundColor: '#0f172a'
        }}
    >
      <canvas ref={canvasRef} className="hidden" />
      
      {/* LEFT PANEL */}
      <div className="w-full md:w-80 p-4 border-r border-slate-800 flex flex-col gap-6 bg-sif-panel/30 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 relative overflow-hidden">
                <BrainCircuit className={`w-6 h-6 relative z-10 ${isLiveMode ? 'text-red-500 animate-pulse' : 'text-sif-joy'}`} />
                {isThinking && <div className="absolute inset-0 bg-sif-joy/20 animate-pulse" />}
            </div>
            <div>
                <h1 className="text-xl font-bold tracking-tight text-white">SIF SYSTEM</h1>
                <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                    {isLiveMode ? <span className="text-red-400 font-bold animate-pulse">● LIVE LINK ACTIVE</span> : (isThinking ? "ГЛУБОКОЕ МЫШЛЕНИЕ..." : "ОНЛАЙН")}
                </p>
            </div>
        </div>

        {/* API KEY CHECK & INPUT */}
        {!hasApiKey ? (
             <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-sm space-y-3 backdrop-blur-md">
                 <div className="flex items-start gap-2 text-red-300">
                    <Key className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>Требуется Gemini API Key</p>
                 </div>
                 
                 {(window as any).aistudio && (
                    <button onClick={handleSelectKey} className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg w-full text-xs font-bold uppercase transition-colors">
                        Выбрать через IDX
                    </button>
                 )}

                 <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-red-500/20"></span>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-[#1e293b] px-2 text-slate-500">Или</span>
                    </div>
                 </div>

                 <form onSubmit={handleManualKeySubmit} className="space-y-2">
                    <input 
                        type="password" 
                        value={manualKeyInput}
                        onChange={(e) => setManualKeyInput(e.target.value)}
                        placeholder="Вставьте ваш API ключ"
                        className="w-full bg-black/40 border border-red-500/30 rounded px-3 py-2 text-xs text-white focus:border-red-500 outline-none"
                    />
                    <button type="submit" className="w-full bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-xs font-bold uppercase transition-colors">
                        Сохранить ключ
                    </button>
                 </form>

                 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-slate-400 hover:text-white underline justify-center">
                     Получить ключ бесплатно <ExternalLink className="w-3 h-3" />
                 </a>
             </div>
        ) : (
            <button onClick={clearKey} className="text-xs text-slate-600 hover:text-red-400 flex items-center gap-1">
                <X className="w-3 h-3" /> Сбросить ключ
            </button>
        )}

        <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50 flex flex-col">
            <div className="flex items-center gap-2 text-slate-400 mb-4">
                <Activity className="w-4 h-4" /> <span className="text-xs font-bold uppercase">Эмоц. Матрица</span>
            </div>
            <EmotionRadar data={soul.currentEmotion} dominantEmotion={dominantEmotion} />
        </div>

        <div className="mt-auto space-y-2">
            <button 
                onClick={toggleLiveMode}
                className={`w-full py-4 rounded-xl border flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all ${
                    isLiveMode 
                    ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-300'
                }`}
            >
                <Radio className={`w-5 h-5 ${isLiveMode ? 'animate-pulse' : ''}`} />
                {isLiveMode ? "Разрыв связи" : "Нейро-Связь"}
            </button>
        </div>
      </div>

      {/* CENTER PANEL */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full -z-10 transition-colors duration-1000" 
             style={{ background: `radial-gradient(circle at center, ${dominantColor}10 0%, transparent 60%)` }}
        />
        
        {/* Avatar */}
        <div className="flex-1 flex items-center justify-center relative min-h-[300px]">
            <SifAvatar 
                dominantEmotion={dominantEmotion} 
                thought={currentThought} 
                intensity={emotionIntensity}
                audioLevel={audioLevel}
                isThinking={isThinking}
            />
        </div>

        {/* Chat */}
        <div className={`
            bg-slate-900/80 border-t border-slate-800 flex flex-col backdrop-blur-sm transition-all duration-500
            ${isLiveMode ? 'h-48' : 'h-1/2'}
        `}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                        <div 
                            className={`
                                max-w-[80%] rounded-2xl px-4 py-3 text-sm transition-all duration-500
                                ${msg.sender === 'user' 
                                    ? 'bg-slate-800 text-slate-200 border' 
                                    : 'bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 text-white'
                                }
                            `}
                            style={
                                msg.sender === 'user' 
                                ? { 
                                    borderColor: `${dominantColor}66`, 
                                    boxShadow: `0 0 10px -5px ${dominantColor}`
                                  } 
                                : {}
                            }
                        >
                            {msg.image && <img src={msg.image} className="mb-2 rounded-lg max-h-60 border border-slate-600" />}
                            
                            {msg.videoUrl && (
                                <div className="mb-2 rounded-lg overflow-hidden border border-slate-600 bg-black">
                                    <video 
                                        src={`${msg.videoUrl}&key=${process.env.API_KEY}`} 
                                        controls 
                                        className="max-h-60 w-full"
                                        poster="/api/placeholder/400/320"
                                    />
                                </div>
                            )}

                            <div className="whitespace-pre-wrap">{msg.text}</div>
                            
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-2">
                                    {msg.sources.map((s, idx) => (
                                        <a key={idx} href={s.uri} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-sif-joy hover:underline bg-black/20 px-2 py-1 rounded">
                                            <ExternalLink className="w-3 h-3" /> {s.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-xs text-sif-joy animate-pulse px-8">Сиф думает...</div>}
                <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="bg-slate-900 border-t border-slate-800 p-4 relative">
                {isLiveMode ? (
                    <div className="flex items-center justify-center gap-4 text-slate-400 h-14">
                        <div className="flex gap-1 h-4 items-end">
                             {[1,2,3,4,5].map(i => (
                                 <div key={i} className="w-1 bg-red-500 animate-pulse" style={{ height: `${Math.max(20, audioLevel/3)}%`, animationDelay: `${i*0.1}s` }} />
                             ))}
                        </div>
                        <span className="font-mono text-xs uppercase tracking-widest animate-pulse">Голосовой канал открыт</span>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex gap-3 items-center">
                        <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => {
                             if(e.target.files?.[0]) {
                                 const reader = new FileReader();
                                 reader.onloadend = () => setSelectedImage(reader.result as string);
                                 reader.readAsDataURL(e.target.files[0]);
                             }
                        }} className="hidden" />
                        
                        <div className="flex bg-slate-800 rounded-full border border-slate-700 p-1">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-white transition-colors">
                                {selectedImage ? <ImageIcon className="w-5 h-5 text-sif-joy" /> : <Paperclip className="w-5 h-5" />}
                            </button>
                            <div className="w-[1px] bg-slate-700 my-1 mx-1" />
                            <button type="button" onClick={toggleCamera} className={`p-2 rounded-full transition-colors ${isCameraActive ? 'text-red-400' : 'text-slate-400 hover:text-white'}`}>
                                {isCameraActive ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
                            </button>
                        </div>

                        <button type="button" onClick={toggleListening} className={`p-3 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </button>

                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            disabled={isThinking}
                            placeholder={isCameraActive ? "Отправить фото..." : "Напиши мне что-нибудь..."}
                            className="flex-1 bg-slate-800 border border-slate-700 text-white rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-sif-joy/50 transition-all"
                        />
                        
                        <button type="submit" disabled={(!inputValue.trim() && !selectedImage && !isCameraActive) || isThinking} className="bg-sif-joy text-black rounded-full p-3 hover:bg-amber-300 disabled:opacity-50 transition-colors">
                            {isThinking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </form>
                )}
                
                {/* Overlay Cam Preview */}
                <div className={`absolute bottom-20 left-4 w-32 h-24 bg-black border border-slate-700 rounded-lg overflow-hidden transition-all ${isCameraActive && !isLiveMode ? 'opacity-100 scale-100' : 'opacity-0 scale-0 pointer-events-none'}`}>
                     <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
                </div>
            </div>
        </div>
      </div>

      {/* RIGHT PANEL - Hidden on mobile */}
      <div className="hidden lg:flex w-72 p-4 border-l border-slate-800 bg-sif-panel/30 flex-col gap-4 backdrop-blur-sm z-10">
        <div className="flex-1 min-h-0"><MemoryLog memories={soul.memories} policies={soul.learnedPolicies} /></div>
      </div>

    </div>
  );
};

export default App;
