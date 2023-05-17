import { keyPrefixMatch, processExists, windowExists } from './helpers';

export function svelteWebDetect() {
	return windowExists() && keyPrefixMatch(window, '__SVELTE');
}

export function svelteSSRDetect() {
	return (
		processExists() &&
		typeof process.env !== 'undefined' &&
		!!Object.keys(process.env).find(key => key.includes('svelte'))
	);
}
