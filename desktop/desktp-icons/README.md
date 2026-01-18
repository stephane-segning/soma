# desktp-icons

Rust CLI for generating Electron icon assets (PNG + ICNS + ICO) from a PNG or SVG source.

## Usage

```bash
cargo run -p desktp-icons -- --input ./icon.png --output ./dist
```

Options:

- `--input`, `-i` (default `./icon.png`, accepts `.png` or `.svg`)
- `--output`, `-o` (default `./`)
- `--flatten`, `-f` (default `false`)
```
