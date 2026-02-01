import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { lowlight } from "lowlight/lib/core";

import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import rust from "highlight.js/lib/languages/rust";
import toml from "highlight.js/lib/languages/toml";
import tsx from "highlight.js/lib/languages/tsx";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

lowlight.register({
	bash,
	css,
	javascript,
	json,
	markdown,
	plaintext,
	rust,
	toml,
	tsx,
	typescript,
	xml,
	yaml,
});

export const CodeBlockExtension = CodeBlockLowlight.configure({
	lowlight,
	defaultLanguage: "plaintext",
});
