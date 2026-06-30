class PcmProcessor extends AudioWorkletProcessor {
	process(inputs) {
		const input = inputs[0];
		if (input && input[0] && input[0].length > 0) {
			const pcm = new Float32Array(input[0]);
			this.port.postMessage(pcm, [pcm.buffer]);
		}
		return true;
	}
}

registerProcessor('pcm-processor', PcmProcessor);
