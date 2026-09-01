import { ChangeEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Provider, Settings } from '../types'

interface ImportSummary {
  accepted: number
  skipped: number
  invalid: number
  settings: number
}

interface Props {
  settings: Settings
  providers: Provider[]
  credentials: Record<
    string,
    { configured: boolean; values: Record<string, string> }
  >
  busy: boolean
  onSaveSettings: (settings: Partial<Settings>) => Promise<void>
  onSaveCredentials: (
    provider: string,
    config: Record<string, string>
  ) => Promise<void>
  onImport: (
    files: File[],
    mode: 'preview' | 'commit'
  ) => Promise<ImportSummary>
  onReload: () => Promise<void>
}

export function SettingsPanel({
  settings,
  providers,
  credentials,
  busy,
  onSaveSettings,
  onSaveCredentials,
  onImport,
  onReload
}: Props) {
  const { t } = useTranslation()
  const [providerKey, setProviderKey] = useState(settings.translate_provider)
  const provider = providers.find((item) => item.key === providerKey)
  const [serviceValues, setServiceValues] = useState<Record<string, string>>({})
  const [aiValues, setAiValues] = useState<Record<string, string>>({
    api_base:
      credentials.openai_ai?.values.api_base || 'https://api.openai.com/v1',
    model: credentials.openai_ai?.values.model || 'gpt-4o-mini',
    api_key: ''
  })
  const [files, setFiles] = useState<File[]>([])
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [blacklist, setBlacklist] = useState(settings.blacklist.join('\n'))

  const configured = credentials[providerKey]?.configured
  const providerDefaults = useMemo(
    () =>
      Object.fromEntries(
        (provider?.config ?? []).map((field) => [
          field.key,
          field.privacy
            ? ''
            : credentials[providerKey]?.values[field.key] ||
              String(field.default || '')
        ])
      ),
    [credentials, provider, providerKey]
  )

  const chooseProvider = async (value: string) => {
    const nextProvider = providers.find((item) => item.key === value)
    const languages = nextProvider?.languages ?? []
    setProviderKey(value)
    setServiceValues({})
    await onSaveSettings({
      translate_provider: value,
      source_language: languages.includes(settings.source_language)
        ? settings.source_language
        : languages.includes('zh_CN')
          ? 'zh_CN'
          : languages[0],
      target_language: languages.includes(settings.target_language)
        ? settings.target_language
        : languages.includes('en_US')
          ? 'en_US'
          : languages[0]
    })
  }

  const fieldValue = (key: string) =>
    serviceValues[key] ?? providerDefaults[key] ?? ''

  const handleFolder = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(
      Array.from(event.target.files ?? []).filter((file) =>
        file.name.endsWith('.json')
      )
    )
    setSummary(null)
  }

  return (
    <section className="paio-settings">
      <h3>{t('settings.interface')}</h3>
      <label className="paio-field">
        <span>{t('settings.interfaceLanguage')}</span>
        <select
          value={settings.language}
          onChange={(event) =>
            void onSaveSettings({ language: event.target.value as 'zh' | 'en' })
          }
        >
          <option value="zh">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>

      <h3>{t('settings.prompt')}</h3>
      <label className="paio-field">
        <span>{t('settings.separator')}</span>
        <input
          value={settings.separator}
          onChange={(event) =>
            void onSaveSettings({ separator: event.target.value })
          }
        />
      </label>
      <div className="paio-check-row">
        <label>
          <input
            type="checkbox"
            checked={settings.auto_remove_space}
            onChange={(event) =>
              void onSaveSettings({ auto_remove_space: event.target.checked })
            }
          />
          {t('settings.normalizeSpaces')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.trailing_comma}
            onChange={(event) =>
              void onSaveSettings({ trailing_comma: event.target.checked })
            }
          />
          {t('settings.trailingComma')}
        </label>
      </div>
      <label className="paio-field">
        <span>{t('settings.blacklist')}</span>
        <textarea
          rows={4}
          value={blacklist}
          onChange={(event) => setBlacklist(event.target.value)}
          onBlur={() =>
            void onSaveSettings({
              blacklist: blacklist
                .split(/[\n,]/)
                .map((item) => item.trim())
                .filter(Boolean)
            })
          }
        />
      </label>

      <h3>{t('settings.translation')}</h3>
      <label className="paio-field">
        <span>{t('settings.provider')}</span>
        <select
          value={providerKey}
          onChange={(event) => void chooseProvider(event.target.value)}
        >
          {providers.map((item) => (
            <option key={item.key} value={item.key}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="paio-two-columns">
        <label className="paio-field">
          <span>{t('settings.sourceLanguage')}</span>
          <select
            value={settings.source_language}
            onChange={(event) =>
              void onSaveSettings({ source_language: event.target.value })
            }
          >
            {provider?.languages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="paio-field">
          <span>{t('settings.targetLanguage')}</span>
          <select
            value={settings.target_language}
            onChange={(event) =>
              void onSaveSettings({ target_language: event.target.value })
            }
          >
            {provider?.languages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {provider?.config.map((field) => (
        <label className="paio-field" key={field.key}>
          <span>{field.name}</span>
          <input
            type={field.privacy ? 'password' : 'text'}
            value={fieldValue(field.key)}
            placeholder={
              field.privacy && configured ? t('settings.secretConfigured') : ''
            }
            onChange={(event) =>
              setServiceValues((current) => ({
                ...current,
                [field.key]: event.target.value
              }))
            }
          />
        </label>
      ))}
      {!!provider?.config.length && (
        <button
          disabled={busy}
          onClick={() =>
            void onSaveCredentials(providerKey, {
              ...providerDefaults,
              ...serviceValues
            })
          }
        >
          {t('settings.saveService')}
        </button>
      )}

      <h3>{t('settings.ai')}</h3>
      {(['api_base', 'model', 'api_key'] as const).map((key) => (
        <label className="paio-field" key={key}>
          <span>{t(`settings.${key}`)}</span>
          <input
            type={key === 'api_key' ? 'password' : 'text'}
            value={aiValues[key] ?? ''}
            placeholder={
              key === 'api_key' && credentials.openai_ai?.configured
                ? t('settings.secretConfigured')
                : ''
            }
            onChange={(event) =>
              setAiValues((current) => ({
                ...current,
                [key]: event.target.value
              }))
            }
          />
        </label>
      ))}
      <button
        disabled={busy}
        onClick={() => void onSaveCredentials('openai_ai', aiValues)}
      >
        {t('settings.saveService')}
      </button>

      <h3>{t('settings.importTitle')}</h3>
      <p className="paio-hint">{t('settings.importHint')}</p>
      <input
        type="file"
        multiple
        accept="application/json,.json"
        ref={(element) => element?.setAttribute('webkitdirectory', '')}
        onChange={handleFolder}
      />
      <div className="paio-toolbar">
        <button
          disabled={busy || !files.length}
          onClick={() => void onImport(files, 'preview').then(setSummary)}
        >
          {t('settings.previewImport')}
        </button>
        <button
          disabled={busy || !files.length || !summary}
          onClick={() =>
            void onImport(files, 'commit').then(async (value) => {
              setSummary(value)
              await onReload()
            })
          }
        >
          {t('settings.commitImport')}
        </button>
      </div>
      {summary && (
        <p className="paio-import-summary">
          {t('settings.importSummary', { ...summary })}
        </p>
      )}
    </section>
  )
}
