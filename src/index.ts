import {
  AperiodicOscillator,
  AperiodicWave,
  UnisonOscillator,
} from 'aperiodic-oscillator';

// Exponential approach conversion, smaller value results in more eager envelopes
const TIME_CONSTANT = 0.5;

// Large but finite number to signify voices that are off
const EXPIRED = 10000;

/** Parameters for the ADSR envelope of the synth. */
export type VoiceBaseParams = {
  /** Audio delay in seconds. Increase on Firefox to reduce pops. */
  audioDelay: number;
  /** Attack time in seconds. */
  attackTime: number;
  /** Decay time constant (exponential decay from 1 to `sustainLevel`). */
  decayTime: number;
  /** Steady state amplitude. */
  sustainLevel: number;
  /** Release time constant (exponential decay from `sustainLevel` to 0). */
  releaseTime: number;
};

/** Parameters for the timbre and ADSR envelope of the synth. */
export interface VoiceParams extends VoiceBaseParams {
  /** One of `"sine"`, `"sawtooth"`, `"triangle"`, `"square"` or `"custom"` if `periodicWave` is set. */
  type: OscillatorType;
  /** Custom waveform. */
  periodicWave?: PeriodicWave;
}

/** Parameters for the timbre, ADSR and voice stack of the synth.*/
export interface UnisonVoiceParams extends VoiceParams {
  /** Number of voices to play in unison. */
  stackSize: number;
  /** Spread of voice frequencies in ±Hertz. */
  spread: number;
}

/** Parameters for the inharmonic timbre and ADSR of the synth. */
export interface AperiodicVoiceParams extends VoiceBaseParams {
  /** Aperiodic wave representing an inharmonic timbre. */
  aperiodicWave: AperiodicWave;
}

export function defaultParams(): VoiceParams {
  return {
    audioDelay: 0.001,
    type: 'triangle',
    attackTime: 0.01,
    decayTime: 0.3,
    sustainLevel: 0.8,
    releaseTime: 0.01,
  };
}

export function defaultUnisonParams(): UnisonVoiceParams {
  const result = defaultParams() as UnisonVoiceParams;
  result.type = 'sawtooth';
  result.stackSize = 3;
  result.spread = 1.5;
  return result;
}

// Tracking numbers for voice stealing
// Technically we could run out of note identifiers,
// but who is going to play 9007199254740991 notes in one session?
let NOTE_ID = 1;

// Tracking numbers for logging purposes
let VOICE_ID = 1;

/**
 * Oscillator with ADSR envelope.
 * Represents a single "channel" of polyphony. Should be reused for multiple notes.
 */
export class VoiceBase {
  age: number;
  context: BaseAudioContext;
  oscillator: OscillatorNode;
  envelope: GainNode;
  log: (msg: string) => void;
  noteId: number;
  voiceId: number;
  lastNoteOff?: () => void;

  constructor(
    oscillatorClass: typeof OscillatorNode,
    context: AudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    this.age = EXPIRED;
    this.context = context;

    this.oscillator = new oscillatorClass(this.context);
    this.envelope = new GainNode(context, {gain: 0});
    this.oscillator.connect(this.envelope).connect(destination);
    const now = this.context.currentTime;
    this.oscillator.start(now);
    this.oscillator.addEventListener('ended', () => {
      this.envelope.disconnect();
      this.oscillator.disconnect();
    });

    this.log = log;

    this.noteId = 0;
    this.voiceId = VOICE_ID++;
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: VoiceBaseParams
  ) {
    this.log(
      `Voice ${this.voiceId}: Age = ${this.age}, note = ${noteId}, frequency = ${frequency}`
    );
    this.age = 0;
    this.noteId = noteId;

    const now = this.context.currentTime + params.audioDelay;
    this.log(
      `Voice ${this.voiceId}: On time = ${now}, sustain time = ${
        now + params.attackTime
      }`
    );
    this.oscillator.frequency.setValueAtTime(frequency, now);
    this.envelope.gain.setValueAtTime(0, now);
    this.envelope.gain.linearRampToValueAtTime(
      velocity,
      now + params.attackTime
    );
    this.envelope.gain.setTargetAtTime(
      velocity * params.sustainLevel,
      now + params.attackTime,
      params.decayTime * TIME_CONSTANT
    );

    // Construct a callback that turns this voice off.
    const noteOff = () => {
      // Do nothing if the voice has been stolen or already released.
      if (this.noteId !== noteId) {
        this.log(`Voice ${this.voiceId} had been stolen. Ignoring note off`);
        return;
      }
      this.age = EXPIRED;
      const then = this.context.currentTime;
      this.log(`Voice ${this.voiceId}: Off time = ${then}`);
      this.envelope.gain.cancelScheduledValues(then);
      // NOTE: Canceling scheduled values doesn't hold intermediate values of linear ramps
      if (then < now + params.attackTime) {
        // Calculate correct linear ramp hold value
        this.envelope.gain.setValueAtTime(
          (velocity * (then - now)) / params.attackTime,
          then
        );
      }
      this.envelope.gain.setTargetAtTime(
        0,
        then,
        params.releaseTime * TIME_CONSTANT
      );

      // We're done here.
      this.noteId = -1;
    };

    this.lastNoteOff = noteOff;

    return noteOff;
  }

  dispose() {
    this.oscillator.stop();
    if (
      this.oscillator instanceof UnisonOscillator ||
      this.oscillator instanceof AperiodicOscillator
    ) {
      this.oscillator.dispose();
    }
  }
}

export class Voice extends VoiceBase {
  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(OscillatorNode, audioContext, destination, log);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: VoiceParams
  ): () => void {
    if (params.periodicWave) {
      if (params.type !== 'custom') {
        throw new Error(
          "Oscillator type must be set to 'custom' when periodic wave is used."
        );
      }
      this.oscillator.setPeriodicWave(params.periodicWave);
    } else {
      if (params.type === 'custom') {
        throw new Error(
          "Periodic wave must be given when oscillator type is set to 'custom'"
        );
      }
      this.oscillator.type = params.type;
    }
    return super.noteOn(frequency, velocity, noteId, params);
  }
}

export class UnisonVoice extends VoiceBase {
  oscillator!: UnisonOscillator;

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(UnisonOscillator, audioContext, destination, log);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: UnisonVoiceParams
  ) {
    this.oscillator.numberOfVoices = params.stackSize;
    const now = this.context.currentTime + params.audioDelay;
    this.oscillator.spread.setValueAtTime(params.spread, now);

    if (params.periodicWave) {
      if (params.type !== 'custom') {
        throw new Error(
          "Oscillator type must be set to 'custom' when periodic wave is used."
        );
      }
      this.oscillator.setPeriodicWave(params.periodicWave);
    } else {
      if (params.type === 'custom') {
        throw new Error(
          "Periodic wave must be given when oscillator type is set to 'custom'"
        );
      }
      this.oscillator.type = params.type;
    }

    return super.noteOn(frequency, velocity, noteId, params);
  }
}

export class AperiodicVoice extends VoiceBase {
  oscillator!: AperiodicOscillator;

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(AperiodicOscillator, audioContext, destination, log);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: AperiodicVoiceParams
  ) {
    this.oscillator.setAperiodicWave(params.aperiodicWave);
    return super.noteOn(frequency, velocity, noteId, params);
  }
}

/**
 * Simple web audio synth of finite polyphony.
 */
export class Synth {
  audioContext: AudioContext;
  destination: AudioNode;
  voiceParams?: VoiceBaseParams;
  log: (msg: string) => void;
  voices: VoiceBase[];

  constructor(
    audioContext: AudioContext,
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
    return new Voice(this.audioContext, this.destination, this.log);
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

  /**
   * Start playing a note at the specified frequency and velocity.
   * @param frequency Frequency in Hertz.
   * @param velocity Voice amplitude. Recomended range from 0 to 1.
   * @returns A callback that stops playing the note.
   */
  noteOn(frequency: number, velocity: number) {
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
