export function playCoinSound(): void {
	const AudioCtx =
		window.AudioContext ||
		(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
	const ctx = new AudioCtx();
	const now = ctx.currentTime;

	const osc1 = ctx.createOscillator();
	const gain1 = ctx.createGain();

	osc1.type = 'square';
	osc1.frequency.setValueAtTime(1318.5, now);

	gain1.gain.setValueAtTime(0, now);
	gain1.gain.linearRampToValueAtTime(0.025, now + 0.01);
	gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

	osc1.connect(gain1);
	gain1.connect(ctx.destination);
	osc1.start(now);
	osc1.stop(now + 0.1);

	const osc2 = ctx.createOscillator();
	const gain2 = ctx.createGain();

	osc2.type = 'square';
	osc2.frequency.setValueAtTime(1975.5, now + 0.08);

	gain2.gain.setValueAtTime(0, now + 0.08);
	gain2.gain.linearRampToValueAtTime(0.025, now + 0.09);
	gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

	osc2.connect(gain2);
	gain2.connect(ctx.destination);
	osc2.start(now + 0.08);
	osc2.stop(now + 0.25);

	osc2.onended = () => {
		void ctx.close();
	};
}
