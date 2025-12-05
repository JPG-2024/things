import { writable } from "svelte/store";

export const DEFAULT_PRIMARY_COLOR = "rgba(170, 170, 170, 1)";


export const primaryColor = writable<string>(DEFAULT_PRIMARY_COLOR);

