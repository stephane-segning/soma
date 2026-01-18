import ElectronStore from "electron-store";

export type WindowState =
	{
		bounds?: {
			x: number;
			y: number;
			width: number;
			height: number;
		};
		isMaximized?: boolean;
		isFullScreen?: boolean;
	};

type StoreSchema =
	{
		settings: Record<
			string,
			unknown
		>;
		windowState?: WindowState | null;
	};

export class AppDataStore {
	private store: ElectronStore<StoreSchema>;

	constructor() {
		// electron-store v10+ may be exported under `.default` when required from CJS;
		// resolve to the constructor explicitly to avoid "not a constructor".
		const StoreCtor: any =
			(
				ElectronStore as any
			)
				.default ??
			ElectronStore;

		this.store =
			new StoreCtor(
				{
					name: "soma-data",
					defaults:
						{
							settings:
								{},
						},
				},
			) as ElectronStore<StoreSchema>;
	}

	get settings(): Record<
		string,
		unknown
	> {
		return this.store.get(
			"settings",
			{},
		);
	}

	set settings(value: Record<
		string,
		unknown
	>) {
		this.store.set(
			"settings",
			value,
		);
	}

	get windowState(): WindowState | null {
		return this.store.get(
			"windowState",
			null,
		);
	}

	set windowState(value: WindowState | null) {
		this.store.set(
			"windowState",
			value,
		);
	}
}
