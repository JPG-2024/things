const SPANISH_MONTHS = {
	ene: 0,
	feb: 1,
	mar: 2,
	abr: 3,
	may: 4,
	jun: 5,
	jul: 6,
	ago: 7,
	sep: 8,
	sept: 8,
	oct: 9,
	nov: 10,
	dic: 11
} as const satisfies Record<string, number>;

const ABSOLUTE_ES_RE =
	/^(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|sept|oct|nov|dic)\s+(\d{4})$/i;

const RELATIVE_ES_RE =
	/^(?:(?:transmitido|streamed|premiere)\s+)?hace\s+(\d+)\s+(segundos?|minutos?|horas?|d[ií]as?|semanas?|meses?|a[ñn]os?)$/i;

export function isoDateDaysAgo(days: number): string {
	return new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
}

export function calculateDaysAgo(uploadDate: string): string {
	let uploadTime = NaN;
	const match = uploadDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
	if (match) {
		const day = parseInt(match[1], 10);
		const monthStr = match[2].toLowerCase();
		const year = parseInt(match[3], 10);
		const month = SPANISH_MONTHS[monthStr as keyof typeof SPANISH_MONTHS];
		if (month !== undefined) {
			uploadTime = new Date(year, month, day).getTime();
		}
	}
	if (Number.isNaN(uploadTime)) {
		uploadTime = new Date(uploadDate).getTime();
	}
	if (Number.isNaN(uploadTime)) {
		return 'Unknown';
	}
	const now = Date.now();
	const diffInMs = now - uploadTime;
	const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
	if (diffInDays < 1) {
		return 'Today';
	} else if (diffInDays === 1) {
		return '1 day ago';
	} else {
		return `${diffInDays} days ago`;
	}
}

export function parseLastVideoDate(raw: string): string {
	const trimmed = raw.trim();

	const abs = trimmed.match(ABSOLUTE_ES_RE);
	if (abs) {
		const day = parseInt(abs[1], 10);
		const monthStr = abs[2].toLowerCase();
		const year = parseInt(abs[3], 10);
		const month = SPANISH_MONTHS[monthStr as keyof typeof SPANISH_MONTHS];
		if (month !== undefined) {
			const date = new Date(year, month, day);
			if (!Number.isNaN(date.getTime())) {
				return date.toISOString().split('T')[0];
			}
		}
	}

	const rel = trimmed.match(RELATIVE_ES_RE);
	if (rel) {
		const n = parseInt(rel[1], 10);
		const unit = rel[2].toLowerCase();
		const d = new Date();
		if (/segundos?/.test(unit)) d.setSeconds(d.getSeconds() - n);
		else if (/minutos?/.test(unit)) d.setMinutes(d.getMinutes() - n);
		else if (/horas?/.test(unit)) d.setHours(d.getHours() - n);
		else if (/d[ií]as?/.test(unit)) d.setDate(d.getDate() - n);
		else if (/semanas?/.test(unit)) d.setDate(d.getDate() - n * 7);
		else if (/meses?/.test(unit)) d.setMonth(d.getMonth() - n);
		else if (/a[ñn]os?/.test(unit)) d.setFullYear(d.getFullYear() - n);
		return d.toISOString().split('T')[0];
	}

	return '1970-01-01';
}
