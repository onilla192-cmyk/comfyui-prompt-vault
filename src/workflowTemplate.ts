/**
 * MiniMax H3 image-to-video workflow for ComfyUI.
 *
 * Keeps the app's existing prompt/image inputs and translates them into the
 * MiniMax H3 graph. This uses ComfyUI's standard SamplerCustomAdvanced path;
 * SPEEDSampler/SPEEDSigmaHarvest are intentionally not included.
 */
import type { WorkflowPrompt } from './comfyClient'

export interface WorkflowInputs {
  prompt: string
  seed?: number
  image1?: string
  image2?: string
  cfg?: number
  steps?: number
  scheduler?: string
  aspectRatio?: string
  megapixels?: number
  maxDimension?: number
  unetName?: string
  clipName?: string
  vaeName?: string
  upscaleMethod?: string
  duration?: number
}

const DEFAULT_UNET = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'
const DEFAULT_CLIP = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors'
const DEFAULT_VAE = 'minimax_h3_video_vae_int8_convrot.safetensors'

function getDimensions(aspectRatio?: string, megapixels = 0.4) {
  const ratioText = aspectRatio?.match(/\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?/)
  let ratio = 16 / 9
  if (ratioText) {
    const [w, h] = ratioText[0].split(':').map(Number)
    if (w > 0 && h > 0) ratio = w / h
  }
  // H3 supports a 768px short edge and up to 1344px on the long edge.
  const pixels = Math.max(0.2, Math.min(0.98, megapixels)) * 1_000_000
  let width = Math.sqrt(pixels * ratio)
  let height = width / ratio
  const shortEdge = Math.min(width, height)
  const scale = Math.min(768 / shortEdge, 1344 / Math.max(width, height))
  width *= scale
  height *= scale
  return {
    width: Math.max(32, Math.round(width / 32) * 32),
    height: Math.max(32, Math.round(height / 32) * 32),
  }
}

function modelInput(value: string | undefined, fallback: string) {
  return value?.trim() || fallback
}

export function buildWorkflow(inputs: WorkflowInputs): WorkflowPrompt {
  const { width, height } = getDimensions(inputs.aspectRatio, inputs.megapixels)
  const duration = Math.max(1, Math.min(15, inputs.duration ?? 5))
  // H3 requires the frame count to follow the 17k+5 pattern at 24fps.
  const frames = Math.max(5, Math.round(duration * 24))
  const length = frames + (5 - (frames % 17)) % 17
  const steps = Math.max(1, Math.round(inputs.steps ?? 20))
  const seed = inputs.seed ?? Math.floor(Math.random() * 1_000_000_000)

  return {
    ...(inputs.image1 ? { '114': { class_type: 'LoadImage', inputs: { image: inputs.image1 } } } : {}),
    ...(inputs.image2 ? { '115': { class_type: 'LoadImage', inputs: { image: inputs.image2 } } } : {}),
    '6': { class_type: 'UNETLoader', inputs: { unet_name: modelInput(inputs.unetName, DEFAULT_UNET), weight_dtype: 'default' } },
    '11': { class_type: 'VAELoader', inputs: { vae_name: modelInput(inputs.vaeName, DEFAULT_VAE) } },
    '13': { class_type: 'CLIPLoader', inputs: { clip_name: modelInput(inputs.clipName, DEFAULT_CLIP), type: 'minimax', device: 'default' } },
    '15': { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    '17': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    '104': {
      class_type: 'MiniMaxH3ImageToVideo',
      inputs: {
        clip: ['13', 0],
        vae: ['11', 0],
        first_frame: inputs.image1 ? ['114', 0] : null,
        last_frame: inputs.image2 ? ['115', 0] : null,
        prompt: inputs.prompt,
        width,
        height,
        length,
      },
    },
    '107': { class_type: 'ComfyMathExpression', inputs: { expression: 'max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17', values: { a: duration } } },
    '9': { class_type: 'BasicScheduler', inputs: { model: ['130', 0], scheduler: inputs.scheduler || 'simple', steps, denoise: 1 } },
    '16': { class_type: 'BasicGuider', inputs: { model: ['130', 0], conditioning: ['104', 0] } },
    '14': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['15', 0], guider: ['16', 0], sampler: ['17', 0], sigmas: ['9', 0], latent_image: ['104', 1] } },
    '10': { class_type: 'VAEDecode', inputs: { samples: ['14', 0], vae: ['11', 0] } },
    '91': { class_type: 'CreateVideo', inputs: { images: ['10', 0], audio: null, fps: 24, bit_depth: 8, color_space: 'sRGB', codec: 'none' } },
    '92': { class_type: 'SaveVideo', inputs: { video: ['91', 0], filename_prefix: 'video/MiniMax_H3', format: 'auto', codec: 'auto' } },
    '129': { class_type: 'SpectrumApplyMiniMaxH3', inputs: { model: ['6', 0], enabled: true, blend_weight: 0.5, degree: 1, ridge_lambda: 0.1, window_size: 2, flex_window: 0.75, warmup_steps: 1, tail_actual_steps: 1, max_history: 8, debug: false, history_storage: 'system_ram', bootstrap_first_forecast: true, anchor_residual_feedback: false, selective_rollback_correction: false, offline_smoothing_replay: true, audio_blend_weight: 0, offline_archive_storage: 'system_ram', model_aware_mode: 'off', model_aware_risk_threshold: 0.65, model_aware_trust_shrinkage: false, model_aware_replay_generic_correction: false, generic_correction_mode: 'coordinate_rls', generic_correction_limiter: 'hard_clip', generic_correction_limit: 0.4, generic_correction_attenuation: 'no_attenuation', sa_pece_forecast_policy: 'balanced' } },
    '130': { class_type: 'PathchSageAttentionKJ', inputs: { model: ['129', 0], sage_attention: 'sageattn_qk_int8_pv_fp8_cuda++', allow_compile: false } },
  }
}
