interface Env {
  RUNPOD_API_KEY?: string
  COMPUTE_CONTROL_TOKEN?: string
  RUNPOD_POD_TEMPLATE_ID?: string
  RUNPOD_GPU_TYPE_ID?: string
  RUNPOD_SERVERLESS_ENDPOINT_ID?: string
}

interface PagesContext {
  request: Request
  env: Env
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function authorized(request: Request, env: Env): boolean {
  const expected = env.COMPUTE_CONTROL_TOKEN
  const supplied = request.headers.get('x-compute-token')
  return !!expected && !!supplied && supplied === expected
}

async function runpod(env: Env, path: string, init: RequestInit = {}): Promise<any> {
  if (!env.RUNPOD_API_KEY) throw new Error('RunPod is not configured. Add RUNPOD_API_KEY as a Pages secret.')
  const response = await fetch('https://api.runpod.io/v2' + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + env.RUNPOD_API_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = { message: text } }
  if (!response.ok) throw new Error(data?.error || data?.message || ('RunPod returned ' + response.status))
  return data
}

async function serverless(env: Env, endpointId: string, suffix: string, init: RequestInit = {}): Promise<Response> {
  if (!env.RUNPOD_API_KEY) throw new Error('RunPod is not configured. Add RUNPOD_API_KEY as a Pages secret.')
  const response = await fetch('https://api.runpod.ai/v2/' + encodeURIComponent(endpointId) + '/' + suffix, {
    ...init,
    headers: { Authorization: 'Bearer ' + env.RUNPOD_API_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : { message: text } } catch { data = { message: text } }
  return json(data, response.status)
}

async function handleCompute(request: Request, env: Env): Promise<Response> {
  if (!authorized(request, env)) {
    return json({ error: 'Compute access is not authorized. Enter the configured compute access token in app settings.' }, 401)
  }

  if (request.method === 'GET') {
    return json({
      runpodConfigured: !!env.RUNPOD_API_KEY,
      podTemplateConfigured: !!env.RUNPOD_POD_TEMPLATE_ID,
      gpuTypeConfigured: !!env.RUNPOD_GPU_TYPE_ID,
      serverlessEndpointConfigured: !!env.RUNPOD_SERVERLESS_ENDPOINT_ID,
      controlTokenConfigured: !!env.COMPUTE_CONTROL_TOKEN,
    })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as Record<string, any>
    const { action, podId, jobId, input, gpuTypeId } = body

    if (action === 'start-pod') {
      const templateId = env.RUNPOD_POD_TEMPLATE_ID
      const selectedGpu = typeof gpuTypeId === 'string' && gpuTypeId.trim() ? gpuTypeId.trim() : env.RUNPOD_GPU_TYPE_ID
      if (!templateId || !selectedGpu) {
        return json({ error: 'Pod provisioning is not configured. Set RUNPOD_POD_TEMPLATE_ID and RUNPOD_GPU_TYPE_ID after preparing the MiniMax H3 ComfyUI template.' }, 409)
      }
      const pod = await runpod(env, '/pods', {
        method: 'POST',
        body: JSON.stringify({
          name: 'minimax-h3-comfyui',
          templateId,
          gpuTypeIds: [selectedGpu],
          gpuCount: 1,
          cloudType: 'SECURE',
          containerDiskInGb: 80,
          volumeInGb: 100,
          volumeMountPath: '/workspace',
        }),
      })
      return json({ pod }, 201)
    }

    if (action === 'pod-status') {
      if (!podId || typeof podId !== 'string') return json({ error: 'podId is required' }, 400)
      return json({ pod: await runpod(env, '/pods/' + encodeURIComponent(podId)) })
    }

    if (action === 'stop-pod' || action === 'terminate-pod') {
      if (!podId || typeof podId !== 'string') return json({ error: 'podId is required' }, 400)
      const path = '/pods/' + encodeURIComponent(podId)
      const result = action === 'stop-pod'
        ? await runpod(env, path + '/stop', { method: 'POST' })
        : await runpod(env, path, { method: 'DELETE' })
      return json({ result })
    }

    if (action === 'serverless-run') {
      if (!env.RUNPOD_SERVERLESS_ENDPOINT_ID) {
        return json({ error: 'Serverless is not configured. Set RUNPOD_SERVERLESS_ENDPOINT_ID after deploying the MiniMax H3 worker.' }, 409)
      }
      return serverless(env, env.RUNPOD_SERVERLESS_ENDPOINT_ID, 'run', {
        method: 'POST',
        body: JSON.stringify({ input }),
      })
    }

    if (action === 'serverless-status') {
      if (!env.RUNPOD_SERVERLESS_ENDPOINT_ID || !jobId || typeof jobId !== 'string') {
        return json({ error: 'Serverless endpoint and job ID are required' }, 400)
      }
      return serverless(env, env.RUNPOD_SERVERLESS_ENDPOINT_ID, 'status/' + encodeURIComponent(jobId))
    }

    return json({ error: 'Unknown compute action' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'RunPod request failed' }, 502)
  }
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
  return handleCompute(request, env)
}
