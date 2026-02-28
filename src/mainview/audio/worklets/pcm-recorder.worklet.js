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
    if (!input || input.length === 0) {
      return true;
    }

    const left = input[0];
    if (!left) {
      return true;
    }

    for (let i = 0; i < left.length; i++) {
      this.buffers[0][this.writeIndex] = left[i];
      if (this.channelCount === 2) {
        const right = input[1];
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
