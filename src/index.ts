import {VoiceBaseParams, VoiceBase} from './voice/base';
import {
  AperiodicVoice,
  AperiodicVoiceParams,
  OscillatorVoice,
  UnisonVoice,
  UnisonVoiceParams,
} from './voice/oscillator';
import {BufferVoice, BufferVoiceParams} from './voice/buffer';
export * from './voice';

// Tracking numbers for voice stealing
// Technically we could run out of note identifiers,
// but who is going to play 9007199254740991 notes in one session?
let NOTE_ID = 1;

/**
 * Simple web audio synth of finite polyphony.
 */
export class Synth {
  audioContext: BaseAudioContext;
  destination: AudioNode;
  voiceParams?: VoiceBaseParams;
  log: (msg: string) => void;
  voices: VoiceBase[];

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log?: (msg: string) => void
  ) {
    this.audioContext = audioContext;
    this.destination = destination;
    if (log === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.log = (msg: string) => {};
    } else {
      this.log = log;
    }

    this.voices = [];
  }

  protected _newVoice(): VoiceBase {
    return new OscillatorVoice(this.audioContext, this.destination, this.log);
  }

  setPolyphony(maxPolyphony: number) {
    if (maxPolyphony < 0 || maxPolyphony === Infinity || isNaN(maxPolyphony)) {
      throw new Error('Invalid max polyphony');
    }
    while (this.voices.length > maxPolyphony) {
      this.voices.pop()!.dispose();
    }
    while (this.voices.length < maxPolyphony) {
      this.voices.push(this._newVoice());
    }
  }

  get maxPolyphony() {
    return this.voices.length;
  }
  set maxPolyphony(value: number) {
    this.setPolyphony(value);
  }

  protected _allocateVoice() {
    // Allocate voices based on age.
    // Boils down to:
    // a) Pick the oldest released voice.
    // b) If there are no released voices, replace the oldest currently playing voice.
    let oldestVoice: VoiceBase | undefined;
    for (const voice of this.voices) {
      voice.age++;
      if (oldestVoice === undefined || voice.age > oldestVoice.age) {
        oldestVoice = voice;
      }
    }
    return oldestVoice;
  }

  /**
   * Start playing a note at the specified frequency and velocity.
   * @param frequency Frequency in Hertz.
   * @param velocity Voice amplitude. Recomended range from 0 to 1.
   * @returns A callback that stops playing the note.
   */
  noteOn(frequency: number, velocity: number) {
    const oldestVoice = this._allocateVoice();

    if (oldestVoice === undefined) {
      return () => {};
    }

    if (this.voiceParams === undefined) {
      throw new Error(
        'Synth.voiceParams must be set before calling Synth.noteOn'
      );
    }

    return oldestVoice.noteOn(frequency, velocity, NOTE_ID++, this.voiceParams);
  }

  /**
   * Trigger panic and release all notes.
   */
  allNotesOff() {
    for (const voice of this.voices) {
      if (voice.lastNoteOff !== undefined) {
        voice.lastNoteOff();
      }
    }
  }
}

/**
 * Web audio synth of finite polyphony where the voices are stacked in unison.
 */
export class UnisonSynth extends Synth {
  voiceParams?: UnisonVoiceParams;
  voices!: UnisonVoice[];

  protected _newVoice(): UnisonVoice {
    return new UnisonVoice(this.audioContext, this.destination, this.log);
  }
}

/**
 * Web audio synth of finite polyphony that supports inharmonic timbres.
 */
export class AperiodicSynth extends Synth {
  voiceParams?: AperiodicVoiceParams;
  voices!: AperiodicVoice[];

  protected _newVoice(): AperiodicVoice {
    return new AperiodicVoice(this.audioContext, this.destination, this.log);
  }
}

/**
 * Web audio synth of finite polyphony with user-provided audio buffers.
 */
export class BufferSynth extends Synth {
  voiceParams?: BufferVoiceParams;
  voices!: BufferVoice[];

  protected _newVoice(): BufferVoice {
    return new BufferVoice(this.audioContext, this.destination, this.log);
  }
}
