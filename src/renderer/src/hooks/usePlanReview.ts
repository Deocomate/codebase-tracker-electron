import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttentionFileEntry } from '../types'

const PLAN_PREVIEW_DEBOUNCE_MS = 300
const PLAN_SAVE_DEBOUNCE_MS = 500

export interface UsePlanReviewReturn {
  planText: string
  setPlanText: (text: string) => void
  planPatterns: string[]
  previewFiles: AttentionFileEntry[]
  isLoadingPreview: boolean
  previewError: string | null
}

export function usePlanReview(projectPath: string, disabled = false): UsePlanReviewReturn {
  const [planText, setPlanTextState] = useState('')
  const [planPatterns, setPlanPatterns] = useState<string[]>([])
  const [previewFiles, setPreviewFiles] = useState<AttentionFileEntry[]>([])
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const previewRequestRef = useRef(0)
  const lastProjectPathRef = useRef<string | null>(null)
  const hasLoadedTextRef = useRef(false)
  const skipNextSaveRef = useRef(false)

  const setPlanText = useCallback((text: string): void => {
    setPlanTextState(text)
  }, [])

  useEffect(() => {
    if (lastProjectPathRef.current === projectPath) return

    lastProjectPathRef.current = projectPath
    hasLoadedTextRef.current = false
    skipNextSaveRef.current = false
    previewRequestRef.current += 1
    setPlanTextState('')
    setPlanPatterns([])
    setPreviewFiles([])
    setPreviewError(null)
    setIsLoadingPreview(false)

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
  }, [projectPath])

  useEffect(() => {
    if (!projectPath || disabled || hasLoadedTextRef.current) return

    let cancelled = false
    hasLoadedTextRef.current = true

    window.api
      .get_plan_text()
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setPreviewError(res.error)
          return
        }
        skipNextSaveRef.current = true
        setPlanTextState(res.content || '')
      })
      .catch((error: unknown) => {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [disabled, projectPath])

  useEffect(() => {
    if (disabled || !planText.trim()) {
      let cancelled = false
      previewRequestRef.current += 1
      queueMicrotask(() => {
        if (cancelled) return
        setIsLoadingPreview(false)
        setPlanPatterns([])
        setPreviewFiles([])
        setPreviewError(null)
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    const requestId = ++previewRequestRef.current

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(async () => {
      if (cancelled || previewRequestRef.current !== requestId) return

      setIsLoadingPreview(true)
      try {
        const { files, patterns, error } = await window.api.preview_plan(planText)
        if (cancelled || previewRequestRef.current !== requestId) return
        if (error) {
          setPreviewError(error)
          setPreviewFiles([])
          setPlanPatterns([])
        } else {
          setPreviewFiles(files ?? [])
          setPlanPatterns(patterns ?? [])
          setPreviewError(null)
        }
      } catch (error: unknown) {
        if (cancelled || previewRequestRef.current !== requestId) return
        setPreviewError(error instanceof Error ? error.message : String(error))
        setPreviewFiles([])
        setPlanPatterns([])
      } finally {
        if (!cancelled && previewRequestRef.current === requestId) {
          setIsLoadingPreview(false)
        }
      }
    }, PLAN_PREVIEW_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [disabled, planText])

  useEffect(() => {
    if (disabled || !projectPath || !hasLoadedTextRef.current) return

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    saveDebounceRef.current = setTimeout(() => {
      void window.api.save_plan_text(planText)
    }, PLAN_SAVE_DEBOUNCE_MS)

    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
    }
  }, [disabled, planText, projectPath])

  return {
    planText,
    setPlanText,
    planPatterns,
    previewFiles,
    isLoadingPreview,
    previewError
  }
}
