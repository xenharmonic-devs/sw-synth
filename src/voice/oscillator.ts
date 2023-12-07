import {
  AperiodicOscillator,
  AperiodicWave,
  UnisonOscillator,
} from 'aperiodic-oscillator';
import {VoiceBase, VoiceBaseParams} from './base';

/** Parameters for the timbre and ADSR envelope of the synth. */
export interface OscillatorVoiceParams extends VoiceBaseParams {
  /** One of `"sine"`, `"sawtooth"`, `"triangle"`, `"square"` or `"custom"` if `periodicWave` is set. */
  type: OscillatorType;
  /** Custom waveform. */
  periodicWave?: PeriodicWave;
}

/** Parameters for the timbre, ADSR and voice stack of the synth.*/
export interface UnisonVoiceParams extends OscillatorVoiceParams {
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

export function defaultParams(): OscillatorVoiceParams {
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

export class OscillatorVoiceBase extends VoiceBase {
  oscillator: OscillatorNode;

  constructor(
    context: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void,
    oscillatorClass: typeof OscillatorNode
  ) {
    super(context, destination, log);

    this.oscillator = new oscillatorClass(this.context);
    this.oscillator.connect(this.envelope);
    const now = this.context.currentTime;
    this.oscillator.start(now);
    this.oscillator.addEventListener('ended', () => {
      this.envelope.disconnect();
      this.oscillator.disconnect();
    });
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: VoiceBaseParams
  ): () => void {
    const now = this.context.currentTime + params.audioDelay;
    this.oscillator.frequency.setValueAtTime(frequency, now);
    return super.noteOn(frequency, velocity, noteId, params);
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

export class OscillatorVoice extends OscillatorVoiceBase {
  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(audioContext, destination, log, OscillatorNode);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: OscillatorVoiceParams
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

export class UnisonVoice extends OscillatorVoiceBase {
  oscillator!: UnisonOscillator;

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(audioContext, destination, log, UnisonOscillator);
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

export class AperiodicVoice extends OscillatorVoiceBase {
  oscillator!: AperiodicOscillator;

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    super(audioContext, destination, log, AperiodicOscillator);
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
