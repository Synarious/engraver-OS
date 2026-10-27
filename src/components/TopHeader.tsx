'use client';

import React from 'react';
import { FileDown, FileUp, Save, Undo2, Redo2 } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { openLocalScoreFile, saveScoreToLocalDisk } from '../storage/fileSystem';

export const TopHeader = () => {
  const { score, setScore, updateScoreTitle, undo, redo, history, historyIndex } = useEditorStore();

  const handleImport = async () => {
    try {
      const file = await openLocalScoreFile();
      console.log('Imported file:', file.name);
      if (file.score) {
        setScore(file.score);
      }
      alert(`Imported ${file.name}`);
    } catch (e) {
      console.log('Import cancelled or failed');
    }
  };

  const handleExport = async () => {
    try {
      if (score) {
        const dummyData = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' });
        await saveScoreToLocalDisk(`${score.title || 'export'}.json`, dummyData);
      }
    } catch (e) {
      console.log('Export cancelled or failed');
    }
  };

  return (
    <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-[#1e293b] text-white">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center text-slate-900 font-bold leading-none">&#9839;</div>
          <span className="font-semibold text-lg tracking-tight">SYMPHONY <span className="text-slate-500 font-normal ml-1">PRO</span></span>
        </div>
        <div className="h-4 w-[1px] bg-slate-700"></div>
        <input 
          type="text" 
          className="bg-transparent border-none text-sm outline-none w-64 hover:bg-slate-800 px-2 py-1 rounded text-cyan-400 font-medium placeholder-slate-500 focus:bg-slate-800"
          value={score?.title || "Untitled Score"}
          onChange={(e) => updateScoreTitle(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <button 
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded hover:text-cyan-400 text-slate-400 disabled:opacity-50 transition-colors"
            title="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button 
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded hover:text-cyan-400 text-slate-400 disabled:opacity-50 transition-colors"
            title="Redo"
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="h-4 w-[1px] bg-slate-700"></div>
        <button onClick={handleImport} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-cyan-400 transition-colors">
          IMPORT
        </button>
        <button onClick={handleExport} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-cyan-400 transition-colors">
          EXPORT
        </button>
        <button className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-900 transition-colors ml-2">
          SAVE
        </button>
      </div>
    </header>
  );
};
