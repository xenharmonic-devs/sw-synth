/* eslint-disable @typescript-eslint/no-unused-vars */
import {describe, it, expect, vi} from 'vitest';
import {Synth} from '..';

class MockAudioNode {
  constructor(context: MockAudioContext) {}

  connect(destinationNode: AudioNode) {
    return destinationNode;
  }

  disconnect(destinationNode?: AudioNode) {}
}

class MockAudioParam {
  value: number = 0;
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
    return this;
  }
}

class MockConstantSourceNode extends MockAudioNode {
  offset: MockAudioParam;

  constructor(context: MockAudioContext, options: ConstantSourceOptions) {
    super(context);
    this.offset = new MockAudioParam();
    this.offset.setValueAtTime(options?.offset ?? 1, context.currentTime);
  }
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
});
