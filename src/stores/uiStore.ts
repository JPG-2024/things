import { writable } from 'svelte/store';

export const DEFAULT_PRIMARY_COLOR = 'rgb(250, 228, 192)';

export const primaryColor = writable<string>(DEFAULT_PRIMARY_COLOR);
