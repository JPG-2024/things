export function hashHue(input: string): number {
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		hash = (hash * 33) ^ input.charCodeAt(i);
	}
	return Math.abs(hash) % 360;
}

export function colorFor(id: string): string {
	return `hsl(${hashHue(id)}, 60%, 50%)`;
}

export function initialFor(label: string): string {
	const trimmed = label.trim();
	return trimmed.length ? trimmed[0].toUpperCase() : '?';
}
