import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { useAppActive } from '@/hooks/use-app-active';
import { saveFocusTime } from '@/lib/focus-data';

/** A running stretch is saved at least this often, so closing the app loses little. */
const SAVE_EVERY_MS = 60_000;
/** After opening an allowed link the app must lose focus within this time, or the permission lapses. */
const LEAVE_WITHIN_MS = 3000;

type Stretch = { start: number; end: number };

/**
 * The focus timer. It counts while all of these hold:
 *  - it was started and not stopped or paused by the learner,
 *  - the timer screen is the screen on view,
 *  - the app is in front, or the learner just opened one of the allowed
 *    links from the timer screen (the app trusts them to stay there).
 * Leaving in any other way pauses it; coming back continues it.
 *
 * Time is saved as stretches of uninterrupted work (focus_time): when the
 * timer stops counting, and every minute while it counts. A stretch that
 * could not be saved is kept and retried with the next one.
 *
 * @param ready false until the project has loaded; the timer waits for it.
 */
export function useFocusTimer(courseId: string, ready: boolean) {
  const screenFocused = useIsFocused();
  const appActive = useAppActive();
  const [stopped, setStopped] = useState(false);
  const [paused, setPaused] = useState(false);
  /** Label of the allowed site the learner went to; null when not on one. */
  const [onAllowedSite, setOnAllowedSite] = useState<string | null>(null);
  /** Time saved (or waiting to be saved) in this session. */
  const [banked, setBanked] = useState(0);
  /** Start of the stretch that is counting now; null while not counting. */
  const [countingSince, setCountingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saveError, setSaveError] = useState<string | null>(null);
  /** How long the timer was paused while the learner was away; shown once on return. */
  const [awayMs, setAwayMs] = useState<number | null>(null);

  const pending = useRef<Stretch[]>([]);
  const saving = useRef(false);
  const leftForSite = useRef(false);
  const awaySince = useRef<number | null>(null);

  const counting =
    ready && !stopped && !paused && screenFocused && (appActive || onAllowedSite !== null);
  /** Away = paused by leaving, not by the pause button. */
  const away = ready && !stopped && !paused && !counting;

  /** Saves every waiting stretch in order; stops at the first failure and keeps the rest. */
  const saveWaiting = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (pending.current.length > 0) {
        const stretch = pending.current[0];
        await saveFocusTime(courseId, stretch.start, stretch.end);
        pending.current.shift();
      }
      setSaveError(null);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      saving.current = false;
    }
  }, [courseId]);

  const bank = useCallback(
    (start: number, end: number) => {
      if (end <= start) return;
      setBanked((total) => total + (end - start));
      pending.current.push({ start, end });
      saveWaiting();
    },
    [saveWaiting],
  );

  // Counting: a stretch begins now, is saved every minute, and ends (and is
  // saved) when counting stops for any reason, including leaving the screen.
  useEffect(() => {
    if (!counting) return;
    let start = Date.now();
    // Shown from the next moment on, like every later tick.
    const first = setTimeout(() => {
      setCountingSince(start);
      setNow(start);
    }, 0);
    const tick = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time - start >= SAVE_EVERY_MS) {
        bank(start, time);
        start = time;
        setCountingSince(time);
      }
    }, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      bank(start, Date.now());
      setCountingSince(null);
    };
  }, [counting, bank]);

  // Note when the learner left, and how long they were away once they are back.
  useEffect(() => {
    if (away) {
      awaySince.current = Date.now();
    } else if (awaySince.current !== null) {
      const since = awaySince.current;
      awaySince.current = null;
      if (counting) setAwayMs(Date.now() - since);
    }
  }, [away, counting]);

  // Back from an allowed site (the app is in front again): the permission ends.
  useEffect(() => {
    if (!appActive) {
      leftForSite.current = true;
    } else if (leftForSite.current) {
      leftForSite.current = false;
      setOnAllowedSite(null);
    }
  }, [appActive]);

  /** Opens an allowed link; the timer keeps counting while the learner is there. */
  function openAllowed(url: string, label: string) {
    leftForSite.current = false;
    setOnAllowedSite(label);
    setAwayMs(null);
    Linking.openURL(url).catch(() => setOnAllowedSite(null));
    // If the link did not take the learner away (e.g. a blocked pop-up),
    // the permission must not linger and excuse a later distraction.
    setTimeout(() => {
      if (!leftForSite.current) setOnAllowedSite(null);
    }, LEAVE_WITHIN_MS);
  }

  return {
    /** Time counted in this session, live. */
    sessionMs: banked + (countingSince !== null ? Math.max(0, now - countingSince) : 0),
    counting,
    paused,
    stopped,
    onAllowedSite,
    awayMs,
    saveError,
    togglePause: () => {
      setAwayMs(null);
      setPaused((p) => !p);
    },
    stop: () => setStopped(true),
    dismissAwayNote: () => setAwayMs(null),
    openAllowed,
    retrySave: saveWaiting,
  };
}
