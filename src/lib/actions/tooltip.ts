import {
	calculatePopupPosition,
	type PopupPosition,
	type PopupPositionInput
} from '@/lib/position';

export interface TooltipOptions {
	/** Text rendered in the tooltip. Empty/undefined (with no `title`) disables it. */
	content?: string | null;
	/** Optional bold line rendered above `content` (e.g. a profile name). */
	title?: string | null;
	position?: PopupPositionInput;
	/** Show even while an ancestor PopupMenu is open (popup content wanting its own tooltips). */
	ignoreMenuCtx?: boolean;
	/** Visual variant applied to the shared tooltip element (e.g. larger article titles). */
	variant?: 'title' | 'summary';
}

interface ResolvedOptions {
	content: string;
	title: string;
	position: PopupPositionInput;
	ignoreMenuCtx: boolean;
	variant?: 'title' | 'summary';
}

const GAP = 8;
const SIDES: PopupPosition[] = ['top', 'bottom', 'left', 'right'];
// Marks a PopupMenu that is currently open. Kept as a DOM attribute (instead of
// a Svelte context) so a plain action, which has no component instance, can
// honor the same "my own menu suppresses me" rule.
const POPUP_OPEN_SELECTOR = '[data-popup-open]';

// One floating element for the whole app. A wheel of entity cards mounts one
// tooltip host per thumbnail; a per-instance body portal put a hidden node in
// `document.body` for every single one of them.
let tooltipEl: HTMLElement | null = null;
let anchorEl: HTMLElement | null = null;
let active: ResolvedOptions | null = null;
let trackingMove = false;

function resolve(options: TooltipOptions): ResolvedOptions {
	return {
		content: options.content ?? '',
		title: options.title ?? '',
		position: options.position ?? 'bottom',
		ignoreMenuCtx: options.ignoreMenuCtx ?? false,
		variant: options.variant
	};
}

function hasContent(options: ResolvedOptions): boolean {
	return Boolean(options.content || options.title);
}

function ensureElement(): HTMLElement {
	if (tooltipEl) return tooltipEl;
	const el = document.createElement('div');
	el.className = 'tooltip';
	el.setAttribute('role', 'tooltip');
	document.body.appendChild(el);
	tooltipEl = el;
	return el;
}

function setSide(side: PopupPosition): void {
	for (const candidate of SIDES) {
		tooltipEl?.classList.toggle(`tooltip-${candidate}`, candidate === side);
	}
}

function setVariant(variant: ResolvedOptions['variant']): void {
	tooltipEl?.classList.toggle('tooltip-title', variant === 'title');
	tooltipEl?.classList.toggle('tooltip-summary', variant === 'summary');
}

function position(): void {
	if (!tooltipEl || !anchorEl || !active) return;
	const coords = calculatePopupPosition(
		anchorEl.getBoundingClientRect(),
		tooltipEl.offsetWidth,
		tooltipEl.offsetHeight,
		GAP,
		active.position
	);
	tooltipEl.style.left = `${coords.x}px`;
	tooltipEl.style.top = `${coords.y}px`;
	setSide(coords.effectivePosition);
}

function handleMove(): void {
	position();
}

// The listener exists only while something is hovered, so idle pages pay
// nothing; a single one serves every host on the page.
function startTracking(): void {
	if (trackingMove) return;
	trackingMove = true;
	window.addEventListener('mousemove', handleMove);
}

function stopTracking(): void {
	if (!trackingMove) return;
	trackingMove = false;
	window.removeEventListener('mousemove', handleMove);
}

function show(host: HTMLElement, options: ResolvedOptions): void {
	const el = ensureElement();
	anchorEl = host;
	active = options;
	el.replaceChildren();
	if (options.title) {
		const heading = document.createElement('strong');
		heading.className = 'tooltip-heading';
		heading.textContent = options.title;
		el.appendChild(heading);
	}
	if (options.content) el.appendChild(document.createTextNode(options.content));
	// Apply the variant before measuring: a larger font changes the box size
	// that `position()` reads. `show()` is the single source of truth, so a
	// stale variant from the previous host can never leak into this one.
	setVariant(options.variant);
	// Measure after the content is in place: the element is `visibility:hidden`
	// (not `display:none`), so its box is already laid out.
	position();
	el.classList.add('visible');
	startTracking();
}

function hide(host?: HTMLElement): void {
	// A leave from the previous host can arrive after the next enter; never let
	// it drop the tooltip that is now anchored somewhere else.
	if (host && anchorEl !== host) return;
	anchorEl = null;
	active = null;
	stopTracking();
	tooltipEl?.classList.remove('visible');
}

/** Dismiss the visible tooltip (e.g. a PopupMenu opening under the pointer). */
export function hideTooltip(): void {
	hide();
}

export function tooltip(node: HTMLElement, options: TooltipOptions = {}) {
	let resolved = resolve(options);
	let hovered = false;
	let listening = false;

	function handleEnter(): void {
		if (!hasContent(resolved)) return;
		if (!resolved.ignoreMenuCtx && node.closest(POPUP_OPEN_SELECTOR)) return;
		hovered = true;
		show(node, resolved);
	}

	function handleLeave(): void {
		if (!hovered) return;
		hovered = false;
		hide(node);
	}

	// Hosts without content (a thumbnail with no title yet) attach nothing at
	// all; the listeners appear the moment the content does.
	function attach(): void {
		if (listening) return;
		listening = true;
		node.addEventListener('mouseenter', handleEnter);
		node.addEventListener('mouseleave', handleLeave);
	}

	function detach(): void {
		if (!listening) return;
		listening = false;
		node.removeEventListener('mouseenter', handleEnter);
		node.removeEventListener('mouseleave', handleLeave);
	}

	if (hasContent(resolved)) attach();

	return {
		update(next: TooltipOptions = {}) {
			resolved = resolve(next);
			if (!hasContent(resolved)) {
				if (hovered) {
					hovered = false;
					hide(node);
				}
				detach();
				return;
			}
			attach();
			if (hovered) show(node, resolved);
		},
		destroy() {
			detach();
			if (hovered) {
				hovered = false;
				hide(node);
			}
		}
	};
}
