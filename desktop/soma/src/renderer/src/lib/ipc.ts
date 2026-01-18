type RendererApi =
	{
		invoke: <
			T = unknown,
		>(
			channel: string,
			args?: unknown,
		) => Promise<T>;
		windowControls?: {
			minimize: () => Promise<void>;
			toggleMaximize: () => Promise<void>;
			close: () => Promise<void>;
		};
	};

const api:
	| RendererApi
	| undefined =
	typeof window !==
	"undefined"
		? (
				window as any
			)
				.api
		: undefined;

export async function invoke<
	T = unknown,
>(
	channel: string,
	args?: unknown,
): Promise<T> {
	if (
		!api?.invoke
	) {
		throw new Error(
			"IPC bridge unavailable",
		);
	}
	return api.invoke<T>(
		channel,
		args,
	);
}

export const windowControls =
	{
		minimize:
			() =>
				invoke(
					"window:control",
					{
						action:
							"minimize",
					},
				),
		toggleMaximize:
			() =>
				invoke(
					"window:control",
					{
						action:
							"toggleMaximize",
					},
				),
		close:
			() =>
				invoke(
					"window:control",
					{
						action:
							"close",
					},
				),
		...((api?.windowControls as RendererApi["windowControls"]) ??
			{}),
	};
