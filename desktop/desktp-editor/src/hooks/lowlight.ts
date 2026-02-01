import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { useMemo } from "react";

export function useLowlight() {
	const lowlight = useMemo(() => {
		const lowlight = createLowlight();

		lowlight.register({
			bash,
			css,
			javascript,
			json,
			markdown,
			plaintext,
			rust,
			typescript,
			xml,
			yaml,
		});

		return lowlight;
	}, []);

	return lowlight;
}
