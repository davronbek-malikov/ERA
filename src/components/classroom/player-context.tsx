"use client";

import * as React from "react";

/**
 * Lets the tutor read the current video time and seek, without re-rendering the player.
 * The handle lives in a ref, so opening, closing or changing tutor conversations never
 * touches the video element.
 */
export type PlayerHandle = {
  /** False for embeds without a timeline API (for example Vimeo). */
  hasTimeline: boolean;
  getTime: () => number | null;
  seek: (seconds: number) => void;
};

const PlayerContext = React.createContext<React.MutableRefObject<PlayerHandle | null> | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const handle = React.useRef<PlayerHandle | null>(null);
  return <PlayerContext.Provider value={handle}>{children}</PlayerContext.Provider>;
}

export function usePlayerHandle() {
  const context = React.useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayerHandle must be used inside PlayerProvider");
  }
  return context;
}
