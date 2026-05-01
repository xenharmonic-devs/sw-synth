import {VoiceBase, PitchBendRange} from './voice/base.js';
import {
  AperiodicVoice,
  AperiodicVoiceParams,
  OscillatorVoice,
  UnisonVoice,
  UnisonVoiceParams,
} from './voice/oscillator.js';
import {BufferVoice, BufferVoiceParams} from './voice/buffer.js';
export * from './voice/index.js';

// Tracking numbers for voice stealing
// Technically we could run out of note identifiers,
// but who is going to play 9007199254740991 notes in one session?
let NOTE_ID = 1;

/** Infers the `noteOn` parameter type for a given voice type. */
export type VoiceParamsOf<VoiceType extends VoiceBase> = Parameters<
  VoiceType['noteOn']
>[3];

/**
 * Simple web audio synth of finite polyphony.
 */
export class Synth<VoiceType extends VoiceBase = OscillatorVoice> {
  audioContext: BaseAudioContext;
  destination: AudioNode;
  voiceParams?: VoiceParamsOf<VoiceType>;
  private pitchBendNode: ConstantSourceNode;
  pitchBend: AudioParam;
  log: (msg: string) => void;
  voices: VoiceType[];

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log?: (msg: string) => void,
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
    this.pitchBendNode = new ConstantSourceNode(this.audioContext, {offset: 0});
    this.pitchBend = this.pitchBendNode.offset;
    this.pitchBendNode.start();
  }

  protected _newVoice(): VoiceType {
    return new OscillatorVoice(
      this.audioContext,
      this.destination,
      this.log,
    ) as unknown as VoiceType;
  }

  setPolyphony(maxPolyphony: number) {
    if (
      !Number.isFinite(maxPolyphony) ||
      maxPolyphony < 0 ||
      !Number.isInteger(maxPolyphony)
    ) {
      throw new Error('Invalid max polyphony');
    }
    while (this.voices.length > maxPolyphony) {
      const voice = this.voices.pop()!;
      if (voice.pitchBend) {
        this.pitchBendNode.disconnect(voice.pitchBend);
      }
      voice.dispose();
    }
    while (this.voices.length < maxPolyphony) {
      const voice = this._newVoice();
      if (voice.pitchBend) {
        this.pitchBendNode.connect(voice.pitchBend);
      }
      this.voices.push(voice);
    }
  }

  get maxPolyphony() {
    return this.voices.length;
  }
  set maxPolyphony(value: number) {
    this.setPolyphony(value);
  }

  protected _allocateVoice(): VoiceType | undefined {
    // Allocate voices based on age.
    // Boils down to:
    // a) Pick the oldest released voice.
    // b) If there are no released voices, replace the oldest currently playing voice.
    let oldestVoice: VoiceType | undefined;
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
   * @param velocity Voice amplitude. Recommended range is 0 to 1.
   * @param pitchBendRange Asymmetric pitch bend range. Determines the effect of {@link Synth.pitchBend} on this note.
   * @returns A callback that stops playing the note.
   */
  noteOn(frequency: number, velocity: number, pitchBendRange?: PitchBendRange) {
    const oldestVoice = this._allocateVoice();

    if (oldestVoice === undefined) {
      return () => {};
    }

    if (this.voiceParams === undefined) {
      throw new Error(
        'Synth.voiceParams must be set before calling Synth.noteOn',
      );
    }

    return oldestVoice.noteOn(
      frequency,
      velocity,
      NOTE_ID++,
      this.voiceParams,
      pitchBendRange,
    );
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
export class UnisonSynth extends Synth<UnisonVoice> {
  voiceParams?: UnisonVoiceParams;
  voices!: UnisonVoice[];

  protected _newVoice(): UnisonVoice {
    return new UnisonVoice(this.audioContext, this.destination, this.log);
  }
}

/**
 * Web audio synth of finite polyphony that supports inharmonic timbres.
 */
export class AperiodicSynth extends Synth<AperiodicVoice> {
  voiceParams?: AperiodicVoiceParams;
  voices!: AperiodicVoice[];

  protected _newVoice(): AperiodicVoice {
    return new AperiodicVoice(this.audioContext, this.destination, this.log);
  }
}

/**
 * Web audio synth of finite polyphony with user-provided audio buffers.
 */
export class BufferSynth extends Synth<BufferVoice> {
  voiceParams?: BufferVoiceParams;
  voices!: BufferVoice[];

  protected _newVoice(): BufferVoice {
    return new BufferVoice(this.audioContext, this.destination, this.log);
  }
}
