
import React, { useState } from 'react';
import { Memory } from '../types';
import { EMOTION_COLORS, EMOTION_DISPLAY_NAMES } from '../constants';
import { BookOpen, AlertTriangle } from 'lucide-react';

interface Props {
  memories: Memory[];
  policies?: string[];
}

export const MemoryLog: React.FC<Props> = ({ memories, policies = [] }) => {
  const [activeTab, setActiveTab] = useState<'log' | 'policies'>('log');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-4 border-b border-slate-700 pb-2 mb-2">
         <button 
           onClick={() => setActiveTab('log')}
           className={`text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'log' ? 'text-sif-joy' : 'text-slate-400 hover:text-white'}`}
         >
           Буфер Ядра
         </button>
         <button 
           onClick={() => setActiveTab('policies')}
           className={`text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'policies' ? 'text-sif-joy' : 'text-slate-400 hover:text-white'}`}
         >
           Изученное
         </button>
      </div>
      
      {activeTab === 'log' ? (
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {memories.length === 0 && (
              <div className="text-slate-600 text-sm italic text-center py-4">Память пуста.</div>
            )}
            {memories.map((mem) => (
              <div 
                key={mem.id} 
                className="p-3 bg-slate-800/50 rounded-lg border-l-2 text-sm relative group transition-colors hover:bg-slate-800"
                style={{ borderLeftColor: EMOTION_COLORS[mem.emotion] }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-mono text-slate-500">{mem.timestamp.toLocaleTimeString('ru-RU')}</span>
                  <span 
                    className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold text-slate-900"
                    style={{ backgroundColor: EMOTION_COLORS[mem.emotion] }}
                  >
                    {EMOTION_DISPLAY_NAMES[mem.emotion]}
                  </span>
                </div>
                <p className="text-slate-200 line-clamp-2 group-hover:line-clamp-none transition-all">
                    {mem.content}
                </p>
              </div>
            ))}
          </div>
      ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
             {policies.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm italic text-center p-4">
                     <BookOpen className="w-8 h-8 mb-2 opacity-20" />
                     <p>Система адаптации активна.</p>
                     <p className="text-xs mt-2">Я пока не изучила специальных правил общения с тобой.</p>
                 </div>
             ) : (
                 policies.map((policy, idx) => (
                     <div key={idx} className="p-3 bg-amber-900/20 border border-amber-900/50 rounded-lg flex gap-3 items-start">
                         <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                         <p className="text-amber-200/80 text-xs">{policy}</p>
                     </div>
                 ))
             )}
          </div>
      )}
    </div>
  );
};
