// Exponential approach conversion, smaller value results in more eager envelopes
const TIME_CONSTANT = 0.5;

// Large but finite number to signify voices that are off
const EXPIRED = 10000;

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
class Voice {
  age: number;
  audioContext: AudioContext;
  oscillator: OscillatorNode;
  envelope: GainNode;
  log: (msg: string) => void;
  noteId: number;
  voiceId: number;
  lastNoteOff?: () => void;

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    log: (msg: string) => void
  ) {
    this.age = EXPIRED;
    this.audioContext = audioContext;

    this.oscillator = this.audioContext.createOscillator();
    this.envelope = this.audioContext.createGain();
    this.oscillator.connect(this.envelope).connect(destination);
    const now = this.audioContext.currentTime;
    this.envelope.gain.setValueAtTime(0, now);
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
    audioDelay: number,
    frequency: number,
    velocity: number,
    typeOrPeriodicWave: OscillatorType | PeriodicWave,
    attackTime: number,
    decayTime: number,
    sustainLevel: number,
    releaseTime: number,
    noteId: number
  ) {
    this.log(
      `Voice ${this.voiceId}: Age = ${this.age}, note = ${noteId}, frequency = ${frequency}`
    );
    this.age = 0;
    this.noteId = noteId;

    if (typeOrPeriodicWave instanceof PeriodicWave) {
      this.oscillator.setPeriodicWave(typeOrPeriodicWave);
    } else {
      this.oscillator.type = typeOrPeriodicWave;
    }

    const now = this.audioContext.currentTime + audioDelay;
    this.log(
      `Voice ${this.voiceId}: On time = ${now}, sustain time = ${
        now + attackTime
      }`
    );
    this.oscillator.frequency.setValueAtTime(frequency, now);
    this.envelope.gain.setValueAtTime(0, now);
    this.envelope.gain.linearRampToValueAtTime(velocity, now + attackTime);
    this.envelope.gain.setTargetAtTime(
      velocity * sustainLevel,
      now + attackTime,
      decayTime * TIME_CONSTANT
    );

    // Construct a callback that turns this voice off.
    const noteOff = () => {
      // Do nothing if the voice has been stolen or already released.
      if (this.noteId !== noteId) {
        this.log(`Voice ${this.voiceId} had been stolen. Ignoring note off`);
        return;
      }
      this.age = EXPIRED;
      const then = this.audioContext.currentTime;
      this.log(`Voice ${this.voiceId}: Off time = ${then}`);
      this.envelope.gain.cancelScheduledValues(then);
      // NOTE: Canceling scheduled values doesn't hold intermediate values of linear ramps
      if (then < now + attackTime) {
        // Calculate correct linear ramp hold value
        this.envelope.gain.setValueAtTime(
          (velocity * (then - now)) / attackTime,
          then
        );
      }
      this.envelope.gain.setTargetAtTime(0, then, releaseTime * TIME_CONSTANT);

      // We're done here.
      this.noteId = -1;
    };

    this.lastNoteOff = noteOff;

    return noteOff;
  }

  dispose() {
    this.oscillator.stop();
  }
}

/**
 * Simple web audio synth of finite polyphony.
 */
export class Synth {
  audioContext: AudioContext;
  destination: AudioNode;
  audioDelay: number;
  typeOrPeriodicWave: OscillatorType | PeriodicWave;
  attackTime: number;
  decayTime: number;
  sustainLevel: number;
  releaseTime: number;
  log: (msg: string) => void;
  voices: Voice[];

  constructor(
    audioContext: AudioContext,
    destination: AudioNode,
    audioDelay = 0.001,
    typeOrPeriodicWave = 'triangle',
    attackTime = 0.01,
    decayTime = 0.3,
    sustainLevel = 0.8,
    releaseTime = 0.01,
    maxPolyphony = 6,
    log?: (msg: string) => void
  ) {
    this.audioContext = audioContext;
    this.destination = destination;
    this.audioDelay = audioDelay;
    this.typeOrPeriodicWave = typeOrPeriodicWave;
    this.attackTime = attackTime;
    this.decayTime = decayTime;
    this.sustainLevel = sustainLevel;
    this.releaseTime = releaseTime;
    if (log === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.log = (msg: string) => {};
    } else {
      this.log = log;
    }

    this.voices = [];
    this.setPolyphony(maxPolyphony);
  }

  setPolyphony(maxPolyphony: number) {
    if (maxPolyphony < 0 || maxPolyphony === Infinity || isNaN(maxPolyphony)) {
      throw new Error('Invalid max polyphony');
    }
    while (this.voices.length > maxPolyphony) {
      this.voices.pop()!.dispose();
    }
    while (this.voices.length < maxPolyphony) {
      this.voices.push(
        new Voice(this.audioContext, this.destination, this.log)
      );
    }
  }

  get maxPolyphony() {
    return this.voices.length;
  }
  set maxPolyphony(value: number) {
    this.setPolyphony(value);
  }

  noteOn(frequency: number, velocity: number) {
    // Allocate voices based on age.
    // Boils down to:
    // a) Pick the oldest released voice.
    // b) If there are no released voices, replace the oldest currently playing voice.
    let oldestVoice: Voice | undefined;
    for (const voice of this.voices) {
      voice.age++;
      if (oldestVoice === undefined || voice.age > oldestVoice.age) {
        oldestVoice = voice;
      }
    }
    if (oldestVoice === undefined) {
      return () => {};
    }

    return oldestVoice.noteOn(
      this.audioDelay,
      frequency,
      velocity,
      this.typeOrPeriodicWave,
      this.attackTime,
      this.decayTime,
      this.sustainLevel,
      this.releaseTime,
      NOTE_ID++
    );
  }

  allNotesOff() {
    for (const voice of this.voices) {
      if (voice.lastNoteOff !== undefined) {
        voice.lastNoteOff();
      }
    }
  }
}
