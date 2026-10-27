import { useEffect, useRef } from 'react';
import { useEditorStore, selectActiveNote } from '../store/editorStore';

export const useHotkeys = () => {
  const digitBuffer = useRef('');
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitPending = (store: ReturnType<typeof useEditorStore.getState>) => {
    if (digitBuffer.current && store.pendingInsertTarget) {
      const fret = parseInt(digitBuffer.current, 10);
      if (!Number.isNaN(fret)) store.insertNoteAtTarget(fret);
    }
    digitBuffer.current = '';
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const store = useEditorStore.getState();
      const activeTrack = store.score?.tracks.find(t => t.id === store.activeTrackId);
      const isTabMode = activeTrack?.type === 'guitar' || activeTrack?.type === 'bass';

      // --- Global Transport ---
      if (e.code === 'Space') {
        e.preventDefault();
        if (store.alphaApi) store.alphaApi.playPause();
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          store.undo();
          return;
        }
        if ((e.key === 'y' || e.key === 'Z') || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          store.redo();
          return;
        }
      }

      // --- Pending insertion target: double-clicked a string, now type a fret ---
      if (store.pendingInsertTarget) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          digitBuffer.current += e.key;
          if (commitTimer.current) clearTimeout(commitTimer.current);
          commitTimer.current = setTimeout(() => commitPending(store), 450);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          commitPending(store);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          store.setPendingInsertTarget(null);
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const numStrings = activeTrack?.tuning?.length || 6;
          const delta = e.key === 'ArrowUp' ? -1 : 1;
          store.setPendingInsertTarget({
            ...store.pendingInsertTarget,
            stringIndex: Math.max(0, Math.min(numStrings - 1, store.pendingInsertTarget.stringIndex + delta)),
          });
          return;
        }
        commitPending(store);
      }

      // --- Note editing (only when a note is selected) ---
      const note = selectActiveNote(store);
      if (note && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? 1 : -1;
        store.updateNoteFret((note.fret ?? 0) + delta);
        return;
      }

      if (note && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        store.updateNoteString((note.string ?? 0) + delta);
        return;
      }

      if (note && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        store.removeActiveNote();
        return;
      }

      // --- Context-Aware Actions (guitar techniques) ---
      if (isTabMode && note) {
        switch (e.key.toLowerCase()) {
          case 'b':
            store.toggleNoteAccent();
            break;
          case 'p':
            store.toggleNotePalmMute();
            break;
          case 'i':
            store.toggleNoteLetRing();
            break;
          case 'x':
            store.setNoteDead(true);
            break;
          case '0':
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
          case '6':
          case '7':
          case '8':
          case '9':
            store.updateNoteFret(parseInt(e.key, 10));
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};
