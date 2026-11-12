# RunPod compute integration setup (Cloudflare Pages)

The app keeps the existing local ComfyUI connection as its default. The RunPod control API lives in `functions/api/compute.ts`, which Cloudflare Pages automatically exposes at `/api/compute`. The RunPod API key stays server-side and is never sent to the browser.

For the existing Git-connected Pages project, keep the build command as `npm run build` and the build output directory as `dist`. Pages deploys new commits automatically. The optional local Pages preview command is `npm run cf:dev`; `npm run cf:deploy` performs a manual Pages upload and is not needed for Git integration.

## Configure Pages secrets

In Cloudflare Dashboard → Workers & Pages → your Pages project → Settings → Variables and Secrets, add these for both Production and Preview environments as needed:

- `COMPUTE_CONTROL_TOKEN`: a long random access token required by the app's compute management API. Enter the same value in Settings → Compute destination. The browser keeps it in session storage only.
- `RUNPOD_API_KEY`: your RunPod API key. This is a secret and must remain server-side.
- `RUNPOD_POD_TEMPLATE_ID`: the prepared Pod template ID for the MiniMax H3 ComfyUI image.
- `RUNPOD_GPU_TYPE_ID`: the RunPod GPU type ID used when no GPU is selected per request.
- `RUNPOD_SERVERLESS_ENDPOINT_ID`: the deployed MiniMax H3 ComfyUI Serverless endpoint ID.

Save the settings and allow Pages to redeploy. Do not put the RunPod API key in the frontend, GitHub files, or chat.

## Current API actions

All requests require the `x-compute-token` header.

- `GET /api/compute`: reports which RunPod settings are configured without revealing secrets.
- `POST /api/compute` with `{ "action": "start-pod", "gpuTypeId": "..." }`: creates a Pod from the configured template.
- `POST /api/compute` with `{ "action": "pod-status", "podId": "..." }`: reads Pod status.
- `POST /api/compute` with `{ "action": "stop-pod", "podId": "..." }`: stops a Pod.
- `POST /api/compute` with `{ "action": "terminate-pod", "podId": "..." }`: permanently deletes a Pod.
- `POST /api/compute` with `{ "action": "serverless-run", "input": { ... } }`: submits a Serverless job.
- `POST /api/compute` with `{ "action": "serverless-status", "jobId": "..." }`: checks a Serverless job.

## Important: worker and routing prerequisites

The Pod template and Serverless endpoint must use a container image that includes the exact MiniMax H3 ComfyUI environment: the H3 UNET, Qwen3VL H3 text encoder, H3 video VAE, required custom nodes, SAGE attention and Spectrum. The Serverless worker must accept the app's workflow JSON and return output files in a form the app can retrieve.

The current compute settings panel is a setup/status surface. It intentionally does not switch generation away from local hardware yet. Before enabling cloud generation, the app's ComfyUI HTTP and WebSocket traffic, image uploads, history, cancellation, and video retrieval must be routed to the active Pod or Serverless worker. This avoids accidentally showing a cloud mode as active while generation is still going to the local server.
