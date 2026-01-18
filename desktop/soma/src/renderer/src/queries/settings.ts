import { api } from "@app/store/api";

type SetSettingInput = {
	key: string;
	value: unknown;
};

function useSettingQuery<T = unknown>(key: string) {
	const result = api.useGetSettingQuery(key);
	return {
		...result,
		data: result.data as T | undefined,
	};
}

function useSetSettingMutation() {
	const [mutate, state] = api.useSetSettingMutation();
	return {
		...state,
		mutate,
		mutateAsync: (input: SetSettingInput) => mutate(input).unwrap(),
	};
}

export { useSetSettingMutation, useSettingQuery };
