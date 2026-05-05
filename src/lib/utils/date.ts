export function calculateDaysAgo(uploadDate: string): string {
	// Try to parse date in format like "17 ene 2020"
	// Fallback to Date constructor if possible
	let uploadTime = NaN;
	// Try parsing DD MMM YYYY (Spanish months)
	const match = uploadDate.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
	if (match) {
		const day = parseInt(match[1], 10);
		const monthStr = match[2].toLowerCase();
		const year = parseInt(match[3], 10);
		const months = {
			ene: 0,
			feb: 1,
			mar: 2,
			abr: 3,
			may: 4,
			jun: 5,
			jul: 6,
			ago: 7,
			sep: 8,
			oct: 9,
			nov: 10,
			dic: 11,
		} as const satisfies Record<string, number>;
		const month = months[monthStr as keyof typeof months];
		if (month !== undefined) {
			uploadTime = new Date(year, month, day).getTime();
		}
	}
	if (Number.isNaN(uploadTime)) {
		uploadTime = new Date(uploadDate).getTime();
	}
	if (Number.isNaN(uploadTime)) {
		return "Unknown";
	}
	const now = Date.now();
	const diffInMs = now - uploadTime;
	const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
	if (diffInDays < 1) {
		return "Today";
	} else if (diffInDays === 1) {
		return "1 day ago";
	} else {
		return `${diffInDays} days ago`;
	}
}
