import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  busy: boolean
  onGenerate: (request: string) => Promise<string>
  onUse: (prompt: string) => void
}

export function AiPanel({ busy, onGenerate, onUse }: Props) {
  const { t } = useTranslation()
  const [request, setRequest] = useState('')
  const [result, setResult] = useState('')

  return (
    <section className="paio-ai">
      <label className="paio-field">
        <span>{t('ai.request')}</span>
        <textarea
          rows={6}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder={t('ai.placeholder')}
        />
      </label>
      <button
        disabled={busy || !request.trim()}
        onClick={() => void onGenerate(request).then(setResult)}
      >
        {busy ? t('common.working') : t('ai.generate')}
      </button>
      {result && (
        <div className="paio-ai-result">
          <textarea
            rows={10}
            value={result}
            onChange={(event) => setResult(event.target.value)}
          />
          <button onClick={() => onUse(result)}>{t('ai.use')}</button>
        </div>
      )}
    </section>
  )
}
