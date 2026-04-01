# sw-synth

Lightweight sound synthesizer designed for real-time user interaction using the Web Audio API.

## Installation

Install from npm:

```bash
npm install sw-synth
```

## Quick start

```typescript
import {Synth, defaultParams} from 'sw-synth';

const context = new AudioContext({latencyHint: 'interactive'});
const synth = new Synth(context, context.destination);

synth.maxPolyphony = 6;
synth.voiceParams = defaultParams();

const noteOffs = new Map<string, () => void>();
window.addEventListener('keydown', (event: KeyboardEvent) => {
  const pitch = parseInt(event.key, 36) % 24;
  const frequency = 440 * 2 ** (pitch / 12);
  const velocity = 0.2;
  noteOffs.set(event.key, synth.noteOn(frequency, velocity));
});

window.addEventListener('keyup', (event: KeyboardEvent) => {
  const noteOff = noteOffs.get(event.key);
  if (noteOff) {
    noteOff();
    noteOffs.delete(event.key);
  }
});
```

## API overview

The package exports four synth classes:

- `Synth`: finite polyphony with standard Web Audio `OscillatorNode` voices.
- `UnisonSynth`: finite polyphony with stacked detuned oscillator voices.
- `AperiodicSynth`: finite polyphony using `AperiodicWave` from `aperiodic-oscillator`.
- `BufferSynth`: finite polyphony driven by user-provided `AudioBufferSourceNode` factories.

Voice parameter helpers are also exported:

- `defaultParams()`
- `defaultUnisonParams()`

## Documentation

- Hosted docs: <https://xenharmonic-devs.github.io/sw-synth>
- Generate docs locally:

```bash
npm run doc
```

TypeDoc output is written to `./docs`.
