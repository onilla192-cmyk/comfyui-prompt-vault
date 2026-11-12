# ComfyUI Remote Console

A mobile-friendly Progressive Web App (PWA) for controlling a ComfyUI instance remotely. The interface connects to ComfyUI, submits workflows, and provides supporting tools for prompts, generated images, and local app data.

## Requirements

- Node.js and npm
- A reachable ComfyUI server
- Network access to the ComfyUI API (the configured endpoint is in `src/comfyClient.ts`)

## Run locally

```bash
npm install
npm run dev
```

Vite starts the development server on port `3000` and binds to `0.0.0.0`.

## Build for deployment

```bash
npm run build
```

The production site is written to `dist/`. For a static deployment such as Cloudflare Pages, use the repository root as the project root, `npm run build` as the build command, and `dist` as the output directory.

## Configuration and setup

See [SETUP.md](SETUP.md) for the existing remote-access and ComfyUI workflow setup notes. The Vite PWA configuration is in `vite.config.ts`; the app's HTML shell and browser metadata are in `index.html`.
