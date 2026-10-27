'use client';

import React from 'react';
import { TrackAST } from '../types/score';
import { GuitarTrackView } from './GuitarTrackView';
import { PianoTrackView } from './PianoTrackView';

interface ScoreViewerProps {
  tracks: TrackAST[];
  activeTrackId: string | null;
}

export const ScoreViewer: React.FC<ScoreViewerProps> = ({ tracks, activeTrackId }) => {
  if (!tracks || tracks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-900 text-slate-400">
        <p>No tracks to display. Create a track to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-slate-900">
      {tracks.map((track) => {
        if (track.type === 'guitar' || track.type === 'bass' || track.type === 'percussion') {
          return <GuitarTrackView key={track.id} track={track} isActive={track.id === activeTrackId} />;
        }
        if (track.type === 'piano') {
          return <PianoTrackView key={track.id} track={track} isActive={track.id === activeTrackId} />;
        }
        return null;
      })}
    </div>
  );
};
