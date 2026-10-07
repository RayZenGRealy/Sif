
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, BrainCircuit, Activity, Radio, Mic, MicOff, Camera, CameraOff, 
  Image as ImageIcon, Paperclip, Loader2, ExternalLink, Settings2, History, Zap
} from 'lucide-react';
import { SifAvatar } from './components/SifAvatar';
import { EmotionRadar } from './components/EmotionRadar';
import { MemoryLog } from './components/MemoryLog';
import { SifSoul, EmotionType, ChatMessage, PersonalityTraits } from './types';
import { EMOTION_COLORS } from './constants';
import * as SifLogic from './services/sifLogic';
import { generateSIFResponse, generateSpeech, transcribeAudio, SifModelProviderId } from './services/aiService';
import { AvailableProvider, getAvailableProviders } from './services/modelProviderService';
import { KnowledgeStats, getKnowledgeStats, ingestKnowledgeFile, reindexKnowledgeEmbeddings } from './services/memoryService';
import { LiveManager } from './services/liveManager';

const UPDATE_RATE_MS = 1000;
const SAMPLE_RATE = 24000;

const App: React.FC = () => {
  const [soul, setSoul] = useState<SifSoul>(SifLogic.createInitialSoul());
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{
    id: 'init', sender: 'sif', text: "Привет! Я Сиф. Мои системы (и душа!) готовы к общению. Как ты сегодня?", emotion: EmotionType.Joy, timestamp: new Date()
  }]);
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentThought, setCurrentThought] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); 
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [modelProvider, setModelProvider] = useState<SifModelProviderId>('gemini');
  const [availableProviders, setAvailableProviders] = useState<AvailableProvider[]>([]);
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats>({ documents: 0, chunks: 0, characters: 0 });
  const [knowledgeStatus, setKnowledgeStatus] = useState<string>('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [isReindexingKnowledge, setIsReindexingKnowledge] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveManagerRef = useRef<LiveManager | null>(null);

  const dominantEmotion = SifLogic.getDominantEmotion(soul.currentEmotion);
  const dominantColor = EMOTION_COLORS[dominantEmotion];

  useEffect(() => {
    let cancelled = false;
    const refreshProviders = async () => {
      const providers = await getAvailableProviders();
      if (cancelled) return;
      setAvailableProviders(providers);
      const current = providers.find(provider => provider.id === modelProvider);
      if (!current || !current.enabled) {
        const firstEnabled = providers.find(provider => provider.enabled);
        if (firstEnabled && (firstEnabled.id === 'gemini' || firstEnabled.id === 'local')) {
          setModelProvider(firstEnabled.id);
          setSelectedModelName(firstEnabled.models?.[0] || firstEnabled.model || '');
        }
      } else {
        const allowedModels = current.models?.length ? current.models : (current.model ? [current.model] : []);
        if (allowedModels.length && !allowedModels.includes(selectedModelName)) {
          setSelectedModelName(allowedModels[0]);
        }
      }
    };
    refreshProviders();
    const timer = window.setInterval(refreshProviders, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [modelProvider, selectedModelName]);

  useEffect(() => {
    getKnowledgeStats().then(setKnowledgeStats).catch(() => undefined);
  }, []);

  // Logic: Energy & Mood Tick
  useEffect(() => {
    const tick = setInterval(() => {
      setSoul(prev => {
        const nextEmotions = { ...prev.currentEmotion };
        const decay = isLiveMode ? 0.01 : 0.03;
        Object.keys(nextEmotions).forEach(k => {
          if (k !== 'Curiosity') nextEmotions[k as EmotionType] *= (1 - decay);
        });
        
        // Mood History Record every 10 seconds
        const history = [...prev.moodHistory];
        if (Date.now() % 10000 < 1100) {
            history.push({ 
                timestamp: Date.now(), 
                emotion: dominantEmotion, 
                intensity: prev.currentEmotion[dominantEmotion] 
            });
            if (history.length > 20) history.shift();
        }

        return {
          ...prev,
          currentEmotion: SifLogic.normalizeEmotions(nextEmotions),
          lifeEnergy: Math.max(0, Math.min(100, prev.lifeEnergy + (isLiveMode ? -0.2 : 0.1))),
          moodHistory: history
        };
      });
    }, UPDATE_RATE_MS);
    return () => clearInterval(tick);
  }, [isLiveMode, dominantEmotion]);

  const handleInteraction = useCallback(async (text: string, image?: string) => {
    if ((!text.trim() && !image) || isThinking) return;
    setIsThinking(true);
    setInputValue('');
    setChatHistory(prev => [...prev, { id: Date.now().toString(), sender: 'user', text, timestamp: new Date(), image }]);

    try {
        const aiResponse = await generateSIFResponse(
            text, soul.currentEmotion, dominantEmotion, soul.memories, soul.desires, soul.learnedPolicies, image, soul.traits, modelProvider, selectedModelName || undefined
        );

        setSoul(prev => {
            const nextEmotions = { ...prev.currentEmotion };
            if (aiResponse.emotionShift) {
                Object.entries(aiResponse.emotionShift).forEach(([k, v]) => {
                    nextEmotions[k as EmotionType] = Math.max(0, Math.min(100, (nextEmotions[k as EmotionType] || 0) + v));
                });
            }
            return {
                ...prev,
                currentEmotion: SifLogic.normalizeEmotions(nextEmotions),
                learnedPolicies: aiResponse.newPolicy ? [...prev.learnedPolicies, aiResponse.newPolicy] : prev.learnedPolicies,
                memories: [{ id: Date.now().toString(), content: text, emotion: dominantEmotion, timestamp: new Date(), importance: 1 }, ...prev.memories].slice(0, 50)
            };
        });

        setChatHistory(prev => [...prev, {
            id: (Date.now() + 1).toString(), sender: 'sif', text: aiResponse.text, emotion: dominantEmotion, 
            timestamp: new Date(), sources: aiResponse.sources, image: aiResponse.generatedImage
        }]);

        if (aiResponse.thought) setCurrentThought(aiResponse.thought);
    } catch (e) { console.error(e); } finally { setIsThinking(false); }
  }, [soul, dominantEmotion, modelProvider, selectedModelName]);

  const handleKnowledgeFile = async (file?: File) => {
    if (!file || isIndexing) return;
    setIsIndexing(true);
    setKnowledgeStatus('Индексирую ' + file.name + '...');
    try {
      const document = await ingestKnowledgeFile(file);
      const stats = await getKnowledgeStats();
      setKnowledgeStats(stats);
      setKnowledgeStatus('Добавлено в память: ' + document.name + ' · ' + document.chunkCount + ' фрагм.');
    } catch (error) {
      setKnowledgeStatus(error instanceof Error ? error.message : 'Ошибка индексации файла');
    } finally {
      setIsIndexing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSemanticReindex = async () => {
    if (isReindexingKnowledge) return;
    setIsReindexingKnowledge(true);
    setKnowledgeStatus('Доиндексирую семантическую память...');
    try {
      let totalUpdated = 0;
      let remaining = 0;
      for (let pass = 0; pass < 20; pass += 1) {
        const result = await reindexKnowledgeEmbeddings(64);
        totalUpdated += result.updated;
        remaining = result.remaining;
        if (!result.enabled || !remaining || !result.updated) break;
      }
      const stats = await getKnowledgeStats();
      setKnowledgeStats(stats);
      if (!stats.semanticEnabled) {
        setKnowledgeStatus('Semantic memory выключена: настрой SIF_EMBEDDING_MODEL.');
      } else {
        setKnowledgeStatus('Semantic memory: ' + (stats.semanticCoverage || 0) + '% · обновлено ' + totalUpdated + ' фрагм.');
      }
    } catch (error) {
      setKnowledgeStatus(error instanceof Error ? error.message : 'Ошибка semantic reindex');
    } finally {
      setIsReindexingKnowledge(false);
    }
  };

  const updateTrait = (trait: keyof PersonalityTraits, val: number) => {
    setSoul(prev => ({ ...prev, traits: { ...prev.traits, [trait]: val } }));
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row transition-colors duration-1000 overflow-hidden" 
         style={{ background: `radial-gradient(circle at center, #0f172a 0%, ${dominantColor}10 100%)`, backgroundColor: '#0f172a' }}>
      
      {/* Sidebar */}
      <div className="w-full md:w-80 p-4 border-r border-slate-800 flex flex-col gap-4 glass z-20">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <BrainCircuit className="w-6 h-6 text-sif-joy" />
                <h1 className="font-bold text-lg text-white">SIF CORE</h1>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 bg-slate-900/50 rounded-full border border-slate-700">
                <Zap className={`w-3 h-3 ${soul.lifeEnergy > 20 ? 'text-yellow-400' : 'text-red-500 animate-pulse'}`} />
                <span className="text-[10px] font-mono">{Math.floor(soul.lifeEnergy)}%</span>
            </div>
        </div>

        <div className="bg-slate-800/20 p-3 rounded-xl border border-white/5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase text-slate-500">Матрица Эмоций</span>
                <Activity className="w-3 h-3 text-slate-600" />
            </div>
            <EmotionRadar data={soul.currentEmotion} dominantEmotion={dominantEmotion} />
        </div>

        <div className="flex-1 overflow-hidden flex flex-col gap-2">
            <div className="flex items-center gap-2 p-1 bg-slate-900/50 rounded-lg">
                <button onClick={() => setShowSettings(false)} className={`flex-1 text-[10px] py-1.5 rounded transition-colors ${!showSettings ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>ПАМЯТЬ</button>
                <button onClick={() => setShowSettings(true)} className={`flex-1 text-[10px] py-1.5 rounded transition-colors ${showSettings ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>ТЮНИНГ</button>
            </div>
            
            {!showSettings ? (
                <MemoryLog memories={soul.memories} policies={soul.learnedPolicies} />
            ) : (
                <div className="space-y-4 p-2 overflow-y-auto">
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase">Модель</h3>
                        <select
                            value={modelProvider}
                            onChange={(e) => { setModelProvider(e.target.value as SifModelProviderId); setSelectedModelName(""); }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-sif-joy"
                        >
                            {availableProviders.map(provider => (
                                <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
                                    {provider.displayName}{provider.model ? ` — ${provider.model}` : ""}{!provider.enabled ? " (недоступна)" : ""}
                                </option>
                            ))}
                        </select>
                        {modelProvider === "local" && (availableProviders.find(provider => provider.id === "local")?.models?.length || 0) > 1 && (
                            <select
                                value={selectedModelName}
                                onChange={(e) => setSelectedModelName(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-sif-joy"
                            >
                                {availableProviders.find(provider => provider.id === "local")?.models?.map(model => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        )}
                        <div className="text-[10px] text-slate-500">
                            {availableProviders.find(provider => provider.id === modelProvider)?.reason ||
                              (modelProvider === "local" ? "Ответы идут через локальный OpenAI-compatible сервер." : "Ответы идут через SIF Gateway.")}
                        </div>
                        {modelProvider === "local" && (
                            <div className="text-[10px] text-slate-500">
                                Голос: STT {availableProviders.find(provider => provider.id === "local")?.audio?.stt ? "✓" : "—"} · TTS {availableProviders.find(provider => provider.id === "local")?.audio?.tts ? "✓" : "—"}
                            </div>
                        )}
                    </div>
                    <div id="sif-knowledge" className="border-t border-slate-800 pt-3 space-y-2">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase">База знаний</h3>
                        <div className="text-[10px] text-slate-500">
                            {knowledgeStats.documents} источн. · {knowledgeStats.chunks} фрагм. · {Math.round(knowledgeStats.characters / 1000)}k символов
                        </div>
                        <div className="text-[10px] text-slate-500">
                            Медиа: 🎧 {knowledgeStats.audioDocuments || 0} · 🎬 {knowledgeStats.videoDocuments || 0}
                        </div>
                        <div className="text-[10px] text-slate-500">
                            Semantic: {knowledgeStats.semanticEnabled ? `${knowledgeStats.semanticCoverage || 0}% · ${knowledgeStats.embeddingModel || "model"}` : "выкл."}
                        </div>
                        <button
                            type="button"
                            disabled={isReindexingKnowledge || !knowledgeStats.semanticEnabled}
                            onClick={handleSemanticReindex}
                            className="w-full text-[10px] py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-40"
                        >
                            {isReindexingKnowledge ? "ИНДЕКСИРУЮ..." : "ДОИНДЕКСИРОВАТЬ ПО СМЫСЛУ"}
                        </button>
                    </div>
                    <div className="border-t border-slate-800 pt-3">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase">Черты Характера</h3>
                    </div>
                    {Object.entries(soul.traits).map(([trait, value]) => (
                        <div key={trait} className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-300">
                                <span>{trait === 'playfulness' ? 'Игривость' : trait === 'logic' ? 'Логика' : 'Скромность'}</span>
                                <span>{value}%</span>
                            </div>
                            <input type="range" value={value} onChange={(e) => updateTrait(trait as any, parseInt(e.target.value))} className="w-full accent-sif-joy h-1 bg-slate-700 rounded-lg" />
                        </div>
                    ))}
                    <div className="pt-4 border-t border-slate-800">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase mb-2">История Настроений</h3>
                        <div className="flex items-end gap-1 h-12">
                            {soul.moodHistory.map((m, i) => (
                                <div key={i} className="flex-1 rounded-t-sm transition-all" 
                                     style={{ height: `${m.intensity}%`, backgroundColor: EMOTION_COLORS[m.emotion] }} 
                                     title={m.emotion} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4">
            <SifAvatar 
                dominantEmotion={dominantEmotion} 
                thought={currentThought} 
                intensity={soul.currentEmotion[dominantEmotion]} 
                audioLevel={audioLevel} 
                isThinking={isThinking} 
            />
        </div>

        <div className="h-2/5 glass flex flex-col rounded-t-3xl shadow-2xl">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatHistory.map(msg => (
                    <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm selectable ${msg.sender === 'user' ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 border border-white/5'}`}
                             style={msg.sender === 'user' ? { borderLeft: `3px solid ${dominantColor}` } : {}}>
                            {msg.image && <img src={msg.image} className="rounded mb-2 max-h-48 w-auto" />}
                            <p>{msg.text}</p>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 flex gap-1 flex-wrap">
                                    {msg.sources.map((s, i) => (
                                        <a key={i} href={s.uri} target="_blank" className="text-[10px] text-sif-joy bg-black/30 px-2 py-0.5 rounded flex items-center gap-1"><ExternalLink size={10} />{s.title}</a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isThinking && <div className="text-[10px] text-sif-joy animate-pulse ml-4">Сиф анализирует...</div>}
                <div ref={chatEndRef} />
            </div>

            <div className="p-4 bg-black/20 border-t border-white/5">
                <form onSubmit={(e) => { e.preventDefault(); handleInteraction(inputValue, selectedImage || undefined); setSelectedImage(null); }} className="flex gap-2 items-center">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,.sql,.pdf,.docx,.xlsx,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.webm,.mp4,.mov,.mkv,.avi,.m4v,audio/*,video/*"
                        onChange={(e) => handleKnowledgeFile(e.target.files?.[0])}
                    />
                    <button type="button" disabled={isIndexing} onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-full text-slate-400 hover:text-sif-joy disabled:opacity-50" title="Добавить файл в память SIF">
                        {isIndexing ? <Loader2 className="animate-spin" size={20} /> : <Paperclip size={20} />}
                    </button>
                    <button type="button" onClick={() => setIsCameraActive(!isCameraActive)} className={`p-2 rounded-full ${isCameraActive ? 'text-red-400 bg-red-400/10' : 'text-slate-400'}`}>
                        {isCameraActive ? <CameraOff size={20} /> : <Camera size={20} />}
                    </button>
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Напиши что-нибудь..."
                           className="flex-1 bg-slate-800/50 border border-slate-700 rounded-full px-4 py-2 text-sm focus:ring-1 focus:ring-sif-joy outline-none" />
                    <button type="submit" disabled={isThinking || (!inputValue.trim() && !selectedImage)} 
                            className="bg-sif-joy text-black p-2 rounded-full hover:scale-105 transition-transform disabled:opacity-50">
                        {isThinking ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                    </button>
                </form>
                {knowledgeStatus && <div className="mt-2 text-[10px] text-slate-500 px-2">{knowledgeStatus}</div>}
            </div>
        </div>
      </div>
      
      {isCameraActive && (
          <div className="absolute top-4 right-4 w-40 h-30 bg-black rounded-xl overflow-hidden border border-white/20 shadow-2xl z-50">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform -scale-x-100" />
          </div>
      )}
    </div>
  );
};

export default App;
