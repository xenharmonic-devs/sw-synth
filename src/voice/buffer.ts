import {VoiceBase, VoiceBaseParams} from './base';

export type BufferFactory = (
  context: BaseAudioContext,
  frequency: number,
  velocity: number
) => AudioBufferSourceNode;

/** Parameters for the audio buffers of the synth. */
export interface BufferVoiceParams extends VoiceBaseParams {
  /** A function that returns unstarted [AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode) when queried with context, frequency and velocity. */
  factory: BufferFactory;
}

export class BufferVoice extends VoiceBase {
  node?: AudioBufferSourceNode;

  noteOn(
    frequency: number,
    velocity: number,
    noteId: number,
    params: BufferVoiceParams
  ): () => void {
    // This is not the ideal pattern for AudioBufferSourceNodes, but I've had bad experiences with Web Audio API garbage collection,
    // so I'd like to reuse that GainNode as long as possible...
    if (this.node) {
      this.node.stop();
    }

    const node = params.factory(this.context, frequency, velocity);
    node.connect(this.envelope);
    node.addEventListener('ended', () => {
      node.disconnect(this.envelope);
    });

    const now = this.context.currentTime + params.audioDelay;
    node.start(now);

    this.node = node;

    const noteOff = super.noteOn(frequency, velocity, noteId, params);
    return () => {
      noteOff();
      const then = this.context.currentTime + params.audioDelay;
      node.stop(then + params.releaseTime * 3);
    };
  }

  dispose() {
    if (this.node) {
      this.node.stop();
    }
    this.envelope.disconnect();
  }
}
