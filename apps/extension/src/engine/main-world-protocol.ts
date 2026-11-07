/** Messages over the private port between main-world.content.ts and content.ts. Types only. */
export type MainWorldMessage =
  | { kind: 'fullscreen' | 'keyboardLock' | 'pointerLock' | 'alertLoop' | 'autoplayAudio' | 'beforeunloadTrap' | 'historySpam' | 'notificationPrompt' | 'clipboardCommand' }
  | { kind: 'walletRequest'; id?: number; method?: string };

export type MainWorldReply =
  | { kind: 'walletDecision'; id: number; allow: boolean }
  /** The page was judged scareware: refuse any further fullscreen / keyboard / pointer lock. */
  | { kind: 'lockdown' }
  /** The page is risky: answer notification-permission requests with "denied" without prompting. */
  | { kind: 'denyNotifications' };
