import {
  AperiodicOscillator,
  AperiodicWave,
  UnisonOscillator,
} from 'aperiodic-oscillator';
import {PitchBendWeights, VoiceBase, VoiceBaseParams} from './base.js';

export {AperiodicWave} from 'aperiodic-oscillator';

/** Parameters for the timbre and ADSR envelope of the synth. */
export interface OscillatorVoiceParams extends VoiceBaseParams {
  /** One of `"sine"`, `"sawtooth"`, `"triangle"`, `"square"` or `"custom"` if `periodicWave` is set. */
  type: OscillatorType;
  /** Custom waveform. */
  periodicWave?: PeriodicWave;
}

/** Parameters for the timbre, ADSR envelope, and voice stack of the synth. */
export interface UnisonVoiceParams extends OscillatorVoiceParams {
  /** Number of voices to play in unison. */
  stackSize: number;
  /** Spread of voice frequencies in ±Hertz. */
  spread: number;
}

/** Parameters for the inharmonic timbre and ADSR envelope of the synth. See [aperiodic-oscillator](https://xenharmonic-devs.github.io/aperiodic-oscillator/index.html) documentation for [AperiodicWave](https://xenharmonic-devs.github.io/aperiodic-oscillator/classes/AperiodicWave.html). */
export interface AperiodicVoiceParams extends VoiceBaseParams {
  /** [AperiodicWave](https://xenharmonic-devs.github.io/aperiodic-oscillator/classes/AperiodicWave.html) representing an inharmonic timbre. */
  aperiodicWave: AperiodicWave;
}

/** Returns default parameters for {@link OscillatorVoice}. */
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

/** Returns default parameters for {@link UnisonVoice}. */
export function defaultUnisonParams(): UnisonVoiceParams {
  const result = defaultParams() as UnisonVoiceParams;
  result.type = 'sawtooth';
  result.stackSize = 3;
  result.spread = 1.5;
  return result;
}

export class OscillatorVoiceBase extends VoiceBase {
  oscillator: OscillatorNode;
  positivePitchBendGain: GainNode;
  negativePitchBendGain: GainNode;

  constructor(
    context: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void,
    oscillatorClass: typeof OscillatorNode,
  ) {
    super(context, destination, log);

    this.oscillator = new oscillatorClass(this.context);
    this.oscillator.connect(this.envelope);

    // Piecewise linear transform:
    // detune = max(0, bend) * up + min(0, bend) * down.
    // bend is expected in [-1, 1], gains are expressed in cents.
    const positiveBendShaper = new WaveShaperNode(this.context, {
      curve: createPiecewiseCurve(x => Math.max(0, x)),
      oversample: 'none',
    });
    const negativeBendShaper = new WaveShaperNode(this.context, {
      curve: createPiecewiseCurve(x => Math.min(0, x)),
      oversample: 'none',
    });
    this.positivePitchBendGain = new GainNode(this.context, {gain: 0});
    this.negativePitchBendGain = new GainNode(this.context, {gain: 0});
    positiveBendShaper.connect(this.positivePitchBendGain);
    negativeBendShaper.connect(this.negativePitchBendGain);
    this.positivePitchBendGain.connect(this.oscillator.detune);
    this.negativePitchBendGain.connect(this.oscillator.detune);

    const pitchBendSource = new ConstantSourceNode(this.context, {offset: 0});
    pitchBendSource.connect(positiveBendShaper);
    pitchBendSource.connect(negativeBendShaper);
    pitchBendSource.start();
    this.pitchBend = pitchBendSource.offset;

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
    params: VoiceBaseParams,
    pitchBendWeights?: PitchBendWeights,
  ): () => void {
    const now = this.context.currentTime + params.audioDelay;
    this.oscillator.frequency.setValueAtTime(frequency, now);
    const up = pitchBendWeights?.up ?? 0;
    const down = pitchBendWeights?.down ?? 0;
    this.positivePitchBendGain.gain.setValueAtTime(up, now);
    this.negativePitchBendGain.gain.setValueAtTime(down, now);
    return super.noteOn(frequency, velocity, noteId, params, pitchBendWeights);
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

function createPiecewiseCurve(fn: (x: number) => number) {
  const size = 2048;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (2 * i) / (size - 1) - 1;
    curve[i] = fn(x);
  }
  return curve;
}

export class OscillatorVoice extends OscillatorVoiceBase {
  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void,
  ) {
    super(audioContext, destination, log, OscillatorNode);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: OscillatorVoiceParams,
    pitchBendWeights?: PitchBendWeights,
  ): () => void {
    if (params.periodicWave) {
      if (params.type !== 'custom') {
        throw new Error(
          "Oscillator type must be set to 'custom' when periodic wave is used.",
        );
      }
      this.oscillator.setPeriodicWave(params.periodicWave);
    } else {
      if (params.type === 'custom') {
        throw new Error(
          "Periodic wave must be given when oscillator type is set to 'custom'",
        );
      }
      this.oscillator.type = params.type;
    }
    return super.noteOn(frequency, velocity, noteId, params, pitchBendWeights);
  }
}

export class UnisonVoice extends OscillatorVoiceBase {
  oscillator!: UnisonOscillator;

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void,
  ) {
    super(audioContext, destination, log, UnisonOscillator);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: UnisonVoiceParams,
    pitchBendWeights?: PitchBendWeights,
  ) {
    this.oscillator.numberOfVoices = params.stackSize;
    const now = this.context.currentTime + params.audioDelay;
    this.oscillator.spread.setValueAtTime(params.spread, now);

    if (params.periodicWave) {
      if (params.type !== 'custom') {
        throw new Error(
          "Oscillator type must be set to 'custom' when periodic wave is used.",
        );
      }
      this.oscillator.setPeriodicWave(params.periodicWave);
    } else {
      if (params.type === 'custom') {
        throw new Error(
          "Periodic wave must be given when oscillator type is set to 'custom'",
        );
      }
      this.oscillator.type = params.type;
    }

    return super.noteOn(frequency, velocity, noteId, params, pitchBendWeights);
  }
}

export class AperiodicVoice extends OscillatorVoiceBase {
  oscillator!: AperiodicOscillator;

  constructor(
    audioContext: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void,
  ) {
    super(audioContext, destination, log, AperiodicOscillator);
  }

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: AperiodicVoiceParams,
    pitchBendWeights?: PitchBendWeights,
  ) {
    this.oscillator.setAperiodicWave(params.aperiodicWave);
    return super.noteOn(frequency, velocity, noteId, params, pitchBendWeights);
  }
}
