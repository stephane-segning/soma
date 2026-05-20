/**
 * Tauri implementation of {@link Transport}. Wraps `invoke` (commands) and
 * `listen` (events) from `@tauri-apps/api`, returning a synchronous
 * unsubscribe that survives the listen registration's microtask delay.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toBackendError } from "../errors";
import type { Transport } from "./index";

export function tauriTransport(): Transport {
	return {
		async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
			try {
				return await invoke<T>(command, args);
			} catch (err) {
				throw toBackendError(err);
			}
		},
		subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
			const pending: Promise<UnlistenFn> = listen<T>(channel, (event) => handler(event.payload));
			let unlisten: UnlistenFn | null = null;
			let cancelled = false;
			void pending.then((fn) => {
				if (cancelled) {
					fn();
					return;
				}
				unlisten = fn;
			});
			return () => {
				cancelled = true;
				unlisten?.();
			};
		},
	};
}
