# sw-synth
Lightweight sound synthesizer designed for real-time user interaction using the Web Audio API

## Example
```typescript
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
  if (noteOffs.has(event.key)) {
    noteOffs.get(event.key)!();
  }
});
```

## Installation ##
```bash
npm i
```

## Documentation ##
Documentation is hosted at the project [Github pages](https://xenharmonic-devs.github.io/sw-synth).

To generate documentation locally run:
```bash
npm run doc
```
