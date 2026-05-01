/* eslint-disable @typescript-eslint/no-unused-vars */
import {describe, it, expect, vi} from 'vitest';
import {Synth} from '../index.js';

class MockAudioNode {
  constructor(context: MockAudioContext) {}

  connect(destinationNode: AudioNode | AudioParam) {
    return destinationNode;
  }

  disconnect(destinationNode?: AudioNode) {}
}

class MockAudioParam {
  value: number = 0;
  cancelTime?: number;
  setValueAtTime(value: number, startTime: number) {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, endTime: number) {
    this.value = value;
    return this;
  }
  setTargetAtTime(target: number, startTime: number, timeConstant: number) {
    this.value = target;
    return this;
  }
  cancelScheduledValues(cancelTime: number) {
    this.cancelTime = cancelTime;
    return this;
  }
}

class MockConstantSourceNode extends MockAudioNode {
  offset: MockAudioParam;
  connections: (AudioNode | AudioParam)[] = [];

  constructor(context: MockAudioContext, options: ConstantSourceOptions) {
    super(context);
    this.offset = new MockAudioParam();
    this.offset.setValueAtTime(options?.offset ?? 1, context.currentTime);
  }

  connect(destinationNode: AudioNode | AudioParam) {
    this.connections.push(destinationNode);
    return destinationNode;
  }

  disconnect(destinationNode?: AudioNode | AudioParam) {}

  start(when?: number) {}
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  detune: MockAudioParam;
  frequency: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.detune = new MockAudioParam();
    this.frequency = new MockAudioParam();
  }

  setPeriodicWave(wave: PeriodicWave) {}

  addEventListener(type: 'ended', listener: () => void) {}

  start(when: number) {}
  stop(when?: number) {}
}

class MockGainNode extends MockAudioNode {
  gain: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.gain = new MockAudioParam();
  }
}

class MockWaveShaperNode extends MockAudioNode {
  curve?: Float32Array | number[];
  oversample?: OverSampleType;

  constructor(context: MockAudioContext, options?: WaveShaperOptions) {
    super(context);
    this.curve = options?.curve;
    this.oversample = options?.oversample;
  }
}

class MockAudioContext {
  currentTime = 0;
  createGain(): MockGainNode {
    return new MockGainNode(this);
  }
  createPeriodicWave() {}
}

vi.stubGlobal('ConstantSourceNode', MockConstantSourceNode);
vi.stubGlobal('OscillatorNode', MockOscillatorNode);
vi.stubGlobal('GainNode', MockGainNode);
vi.stubGlobal('WaveShaperNode', MockWaveShaperNode);

const context = new MockAudioContext() as unknown as AudioContext;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(context as any).destination = new MockGainNode(context as any);

describe('Oscillator Synth', () => {
  it('allocates voices', () => {
    const synth = new Synth(context, context.destination);
    synth.maxPolyphony = 3;
    expect(synth.voices).toHaveLength(3);
  });

  it('rejects non-integer max polyphony values', () => {
    const synth = new Synth(context, context.destination);
    expect(() => synth.setPolyphony(1.5)).toThrow('Invalid max polyphony');
  });

  it('handles zero attack/decay/release envelope times', () => {
    const synth = new Synth(context, context.destination);
    synth.maxPolyphony = 1;
    synth.voiceParams = {
      audioDelay: 0,
      type: 'sine',
      attackTime: 0,
      decayTime: 0,
      sustainLevel: 0.8,
      releaseTime: 0,
    };

    const noteOff = synth.noteOn(440, 0.5);
    expect(() => noteOff()).not.toThrow();
  });

  it('applies audioDelay when releasing notes', () => {
    const synth = new Synth(context, context.destination);
    synth.maxPolyphony = 1;
    synth.voiceParams = {
      audioDelay: 0.25,
      type: 'sine',
      attackTime: 0.01,
      decayTime: 0.1,
      sustainLevel: 0.8,
      releaseTime: 0.1,
    };

    const noteOff = synth.noteOn(440, 0.5);
    (context as unknown as MockAudioContext).currentTime = 1;
    noteOff();

    const gain = synth.voices[0].envelope.gain as unknown as MockAudioParam;
    expect(gain.cancelTime).toBeCloseTo(1.25);
  });

  it('forwards synth pitch bend parameter to voice pitch bend', () => {
    const synth = new Synth(context, context.destination);
    synth.maxPolyphony = 1;
    const voice = synth.voices[0];
    expect(voice.pitchBend).toBeDefined();
    expect(
      (synth as unknown as {pitchBendNode: MockConstantSourceNode})
        .pitchBendNode.connections,
    ).toContain(voice.pitchBend);
  });

  it('sets asymmetric pitch-bend weights per note', () => {
    const synth = new Synth(context, context.destination);
    synth.maxPolyphony = 1;
    synth.voiceParams = {
      audioDelay: 0,
      type: 'sine',
      attackTime: 0,
      decayTime: 0,
      sustainLevel: 1,
      releaseTime: 0,
    };

    synth.noteOn(440, 0.5, {down: 175, up: 275});
    const voice = synth.voices[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const curve = (voice as any).pitchBend.curve as Float32Array;
    expect(curve[0]).toBeCloseTo(-175, 0);
    expect(curve[curve.length - 1]).toBeCloseTo(275, 0);
  });
});
