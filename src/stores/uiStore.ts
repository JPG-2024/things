import { writable } from "svelte/store";

export const DEFAULT_PRIMARY_COLOR = "rgb(46, 204, 143)";


export const primaryColor = writable<string>(DEFAULT_PRIMARY_COLOR);

