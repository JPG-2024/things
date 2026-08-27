interface AutoHideOptions {
	scrollContainerId?: string;
	threshold?: number;
	enabled?: boolean;
}

export function autoHide(node: HTMLElement, options: AutoHideOptions = {}) {
	const { scrollContainerId = 'layout-main', threshold = 0.1, enabled = true } = options;

	let containerId = scrollContainerId;
	let thresholdRatio = threshold;
	let lastScrollY = 0;
	let isHidden = false;

	function setHidden(hidden: boolean) {
		if (isHidden === hidden) return;
		isHidden = hidden;
		node.classList.toggle('hidden', hidden);
	}

	function handleScroll() {
		const scrollContainer = document.getElementById(containerId);
		if (!scrollContainer) return;

		const currentScrollY = scrollContainer.scrollTop;
		const thresholdPx = window.innerHeight * thresholdRatio;

		if (currentScrollY > thresholdPx) {
			setHidden(currentScrollY > lastScrollY);
		} else {
			setHidden(false);
		}

		lastScrollY = currentScrollY;
	}

	function attach(id: string) {
		const scrollContainer = document.getElementById(id);
		scrollContainer?.addEventListener('scroll', handleScroll, { passive: true });
	}

	function detach() {
		const scrollContainer = document.getElementById(containerId);
		scrollContainer?.removeEventListener('scroll', handleScroll);
	}

	if (enabled) {
		attach(containerId);
	}

	return {
		update(nextOptions: AutoHideOptions = {}) {
			const nextContainerId = nextOptions.scrollContainerId ?? 'layout-main';
			const nextEnabled = nextOptions.enabled ?? true;
			thresholdRatio = nextOptions.threshold ?? thresholdRatio;

			detach();
			lastScrollY = 0;
			setHidden(false);

			containerId = nextContainerId;
			if (nextEnabled) {
				attach(containerId);
			}
		},
		destroy() {
			detach();
			setHidden(false);
		}
	};
}
