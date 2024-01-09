/* eslint-disable @typescript-eslint/no-unused-vars */
import {describe, it, expect, vi} from 'vitest';
import {Synth} from '..';

class MockAudioNode {
  constructor(context: MockAudioContext) {}

  connect(destinationNode: AudioNode) {
    return destinationNode;
  }
}

class MockAudioParam {
  value: number;
  setValueAtTime(value: number, startTime: number) {
    this.value = value;
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

  constructor(context: MockAudioContext) {
    super(context);
    this.detune = new MockAudioParam();
  }

  setPeriodicWave(wave: PeriodicWave) {}

  addEventListener(type: 'ended', listener: () => void) {}

  start(when: number) {}
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
});
