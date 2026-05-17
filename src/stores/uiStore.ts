import { writable } from 'svelte/store';

export const DEFAULT_PRIMARY_COLOR = 'rgb(192, 36, 212)';

export const primaryColor = writable<string>(DEFAULT_PRIMARY_COLOR);
