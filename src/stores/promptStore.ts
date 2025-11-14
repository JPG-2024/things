import { writable } from "svelte/store";
import { YOUTUBE_SUMMARY_PROMPT } from '@/constants';

export const youTubeSummaryPrompt = writable<string>(YOUTUBE_SUMMARY_PROMPT);