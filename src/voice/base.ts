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

// Tracking numbers for logging purposes
let VOICE_ID = 1;

/**
 * Oscillator with ADSR envelope.
 * Represents a single "channel" of polyphony. Should be reused for multiple notes.
 */
export class VoiceBase {
  age: number;
  context: BaseAudioContext;
  envelope: GainNode;
  log: (msg: string) => void;
  noteId: number;
  voiceId: number;
  lastNoteOff?: () => void;

  constructor(
    context: BaseAudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    this.age = EXPIRED;
    this.context = context;
    this.envelope = new GainNode(context, {gain: 0});
    this.envelope.connect(destination);

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

  dispose() {}
}
