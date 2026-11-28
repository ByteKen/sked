const SOUND_STORAGE_KEY = 'sked_agenda_sound_enabled';
const SOUND_PREF_EVENT = 'sked:reminder-sound-change';

type AudioContextConstructor = typeof AudioContext;

function getAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export function isReminderSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function setReminderSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(SOUND_PREF_EVENT, { detail: enabled }));
  } catch {
    // Ignore storage restrictions
  }
}

export function subscribeReminderSoundPreference(callback: (enabled: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback(isReminderSoundEnabled());
  window.addEventListener(SOUND_PREF_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(SOUND_PREF_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Plays a gentle, crisp 2-note Web Audio bell chime (E5 -> B5) with zero external audio assets.
 * Safe no-op when muted, unsupported (SSR/jsdom), or blocked by browser autoplay policy.
 */
export function playReminderChime(options: { force?: boolean } = {}): boolean {
  if (!options.force && !isReminderSoundEnabled()) return false;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return false;

  try {
    const ctx = new Ctor();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 659.25, start: 0, duration: 0.34, peak: 0.14 }, // E5
      { freq: 987.77, start: 0.16, duration: 0.48, peak: 0.16 }, // B5
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const overtone = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(note.freq * 2, now + note.start);

      const overtoneGain = ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.18, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.peak, now + note.start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.start);
      overtone.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.03);
      overtone.stop(now + note.start + note.duration + 0.03);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
    return true;
  } catch {
    return false;
  }
}
