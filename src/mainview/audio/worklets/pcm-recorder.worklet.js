const WORKLET_BUFFER_SIZE = 4096;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channelCount = options.processorOptions?.channelCount ?? 2;
    this.buffers = [];
    for (let i = 0; i < this.channelCount; i++) {
      this.buffers.push(new Float32Array(WORKLET_BUFFER_SIZE));
    }
    this.writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    // 入力が空でも無音フレームを書き込む。スキップすると WAV の総サンプル数が
    // 実際の録音時間より短くなり、再生速度が速くなる原因になる。
    // AudioWorklet の 1 render quantum は常に 128 フレーム。
    const frameCount = (input && input[0]) ? input[0].length : 128;
    const left = input?.[0];
    const right = input?.[1];

    for (let i = 0; i < frameCount; i++) {
      this.buffers[0][this.writeIndex] = left ? left[i] : 0;
      if (this.channelCount === 2) {
        this.buffers[1][this.writeIndex] = right ? right[i] : 0;
      }
      this.writeIndex++;

      if (this.writeIndex >= WORKLET_BUFFER_SIZE) {
        this.flush();
      }
    }

    return true;
  }

  flush() {
    const totalSamples = WORKLET_BUFFER_SIZE * this.channelCount;
    const interleaved = new Int16Array(totalSamples);

    if (this.channelCount === 1) {
      for (let i = 0; i < WORKLET_BUFFER_SIZE; i++) {
        const sample = Math.max(-1, Math.min(1, this.buffers[0][i]));
        interleaved[i] = sample * 32767;
      }
    } else {
      for (let i = 0; i < WORKLET_BUFFER_SIZE; i++) {
        const l = Math.max(-1, Math.min(1, this.buffers[0][i]));
        const r = Math.max(-1, Math.min(1, this.buffers[1][i]));
        interleaved[i * 2] = l * 32767;
        interleaved[i * 2 + 1] = r * 32767;
      }
    }

    this.port.postMessage(interleaved.buffer, [interleaved.buffer]);

    this.buffers = [];
    for (let i = 0; i < this.channelCount; i++) {
      this.buffers.push(new Float32Array(WORKLET_BUFFER_SIZE));
    }
    this.writeIndex = 0;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
