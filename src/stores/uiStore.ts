import { writable } from "svelte/store";

export const DEFAULT_PRIMARY_COLOR = "rgb(66, 66, 66)";


export const primaryColor = writable<string>(DEFAULT_PRIMARY_COLOR);

