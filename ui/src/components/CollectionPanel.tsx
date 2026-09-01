import { useTranslation } from 'react-i18next'

import { CollectionKind, PromptRecord } from '../types'

interface Props {
  kind: CollectionKind
  records: PromptRecord[]
  onUse: (record: PromptRecord) => void
  onDelete: (record: PromptRecord) => Promise<void>
}

export function CollectionPanel({ kind, records, onUse, onDelete }: Props) {
  const { t } = useTranslation()
  return (
    <section className="paio-collection">
      <h3>{t(`collections.${kind}`)}</h3>
      {records.length ? (
        [...records].reverse().map((record) => (
          <article key={record.id}>
            <button className="paio-record-body" onClick={() => onUse(record)}>
              <strong>{record.name || t('collections.untitled')}</strong>
              <span>{record.prompt}</span>
              <small>{new Date(record.created_at).toLocaleString()}</small>
            </button>
            <button
              className="danger"
              title={t('common.delete')}
              onClick={() => void onDelete(record)}
            >
              ×
            </button>
          </article>
        ))
      ) : (
        <div className="paio-empty">{t('collections.empty')}</div>
      )}
    </section>
  )
}
