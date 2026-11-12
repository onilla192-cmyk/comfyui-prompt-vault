import { useState } from 'react'

type SetupStatus = {
  runpodConfigured: boolean
  podTemplateConfigured: boolean
  gpuTypeConfigured: boolean
  serverlessEndpointConfigured: boolean
}

const TOKEN_KEY = 'compute-control-token'

export function ComputeSettings() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function checkConnection() {
    setChecking(true)
    setError('')
    setStatus(null)
    try {
      const response = await fetch('/api/compute', { headers: { 'x-compute-token': token } })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'Could not check RunPod configuration.')
      sessionStorage.setItem(TOKEN_KEY, token)
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check RunPod configuration.')
    } finally {
      setChecking(false)
    }
  }

  const item = (label: string, ready: boolean) => (
    <div className="compute-setup-status-row" key={label}>
      <span>{label}</span>
      <strong className={ready ? 'is-ready' : 'is-pending'}>{ready ? 'Configured' : 'Setup required'}</strong>
    </div>
  )

  return (
    <section className="settings-section compute-settings-section">
      <h3>Compute destination</h3>
      <div className="compute-mode-card is-current">
        <div><strong>My Hardware</strong><span>Keep using your existing ComfyUI connection.</span></div>
        <b>Current default</b>
      </div>
      <div className="compute-mode-card">
        <div><strong>RunPod GPU Pod</strong><span>Managed, persistent GPU session for MiniMax H3.</span></div>
        <b>Cloud Pod</b>
      </div>
      <div className="compute-mode-card">
        <div><strong>RunPod Serverless</strong><span>On-demand workers that scale down when idle.</span></div>
        <b>Serverless</b>
      </div>
      <p className="settings-note">Your local setup remains the default. Cloud generation will be enabled after the RunPod worker and remote ComfyUI routing are configured.</p>
      <label className="setting">
        <span>Compute access token</span>
        <input type="password" value={token} autoComplete="off" placeholder="Enter the Cloudflare COMPUTE_CONTROL_TOKEN" onChange={(event) => setToken(event.target.value)} />
      </label>
      <button type="button" className="settings-refresh-btn" disabled={!token.trim() || checking} onClick={() => void checkConnection()}>
        {checking ? 'Checking…' : 'Check RunPod setup'}
      </button>
      {error && <p className="compute-setup-error">{error}</p>}
      {status && <div className="compute-setup-status">
        {item('RunPod API key', status.runpodConfigured)}
        {item('GPU Pod template', status.podTemplateConfigured)}
        {item('Default GPU type', status.gpuTypeConfigured)}
        {item('Serverless endpoint', status.serverlessEndpointConfigured)}
      </div>}
    </section>
  )
}
