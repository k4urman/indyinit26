/** Messages over the private port between main-world.content.ts and content.ts. Types only. */
export type MainWorldMessage =
  | { kind: 'fullscreen' | 'keyboardLock' | 'pointerLock' | 'alertLoop' | 'autoplayAudio' | 'beforeunloadTrap' | 'historySpam' | 'notificationPrompt' }
  | { kind: 'walletRequest'; id?: number; method?: string };

export type MainWorldReply =
  | { kind: 'walletDecision'; id: number; allow: boolean }
  /** The page was judged scareware: refuse any further fullscreen / keyboard / pointer lock. */
  | { kind: 'lockdown' };
