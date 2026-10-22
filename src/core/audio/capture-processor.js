/**
 * AudioWorklet chạy trên audio thread: gom mẫu kênh 0 vào bộ đệm vòng và
 * gửi khung FRAME_SIZE mẫu về main thread sau mỗi HOP_SIZE mẫu.
 * Không xử lý nặng ở đây để tránh làm rè audio thread.
 * File JS thuần (không qua bundler) vì được nạp bằng audioWorklet.addModule().
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.frameSize = opts.frameSize || 2048;
    this.hopSize = opts.hopSize || 1024;
    this.ring = new Float32Array(this.frameSize);
    this.writeIndex = 0;
    this.filled = 0;
    this.sinceLastPost = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.stopped = true;
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.ring[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % this.frameSize;
    }
    this.filled = Math.min(this.frameSize, this.filled + channel.length);
    this.sinceLastPost += channel.length;

    if (this.filled >= this.frameSize && this.sinceLastPost >= this.hopSize) {
      this.sinceLastPost = 0;
      // Sao chép theo đúng thứ tự thời gian (cũ → mới).
      const frame = new Float32Array(this.frameSize);
      const tail = this.frameSize - this.writeIndex;
      frame.set(this.ring.subarray(this.writeIndex), 0);
      frame.set(this.ring.subarray(0, this.writeIndex), tail);
      this.port.postMessage(frame, [frame.buffer]);
    }
    return true;
  }
}

registerProcessor('vietpiano-capture', CaptureProcessor);
