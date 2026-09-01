export type Polarity = 'positive' | 'negative'
export type CollectionKind = 'history' | 'favorites'
export type Drawer = 'history' | 'favorites' | 'ai' | 'settings'
export type HotkeyAction = 'none' | 'edit' | 'disable' | 'extend'

export interface HotkeySettings {
  click: HotkeyAction
  double_click: HotkeyAction
  right_click: HotkeyAction
  hover: HotkeyAction
}

export interface PromptTag {
  id: string
  text: string
  translation?: string
  enabled: boolean
  lineBreakBefore?: boolean
}

export interface PromptDocument {
  version: 1
  tags: PromptTag[]
}

export interface PromptRecord {
  id: string
  polarity: Polarity
  name: string
  prompt: string
  tags: string[]
  created_at: number
  source: string
}

export interface ProviderField {
  key: string
  name: string
  type: string
  default: string
  privacy: boolean
  options: Array<string | { label: string; value: string }>
}

export interface Provider {
  key: string
  name: string
  group: string
  free: boolean
  config: ProviderField[]
  languages: string[]
}

export interface GroupTagGroup {
  name: string
  color?: string
  tags: Record<string, string | null>
}

export interface GroupTagWrap {
  type: 'wrap'
}

export type GroupTagEntry = GroupTagGroup | GroupTagWrap

export interface GroupTagCategory {
  name: string
  groups: GroupTagEntry[]
}

export interface Settings {
  schema_version: number
  language: 'zh' | 'en'
  translate_provider: string
  source_language: string
  target_language: string
  preserve_translation_case: boolean
  auto_remove_space: boolean
  trailing_comma: boolean
  separator: string
  blacklist: string[]
  group_tags_translate: boolean
  group_tag_colors: Record<string, string>
  active_group: Record<string, unknown>
  hotkeys: HotkeySettings
}

export interface BootstrapData {
  settings: Settings
  credentials: Record<
    string,
    { configured: boolean; values: Record<string, string> }
  >
  providers: Provider[]
  group_tags: GroupTagCategory[]
  models: Record<'checkpoints' | 'loras' | 'embeddings', string[]>
  collections: Record<CollectionKind, Record<Polarity, PromptRecord[]>>
}

export interface ComfyWidget {
  name: string
  value: unknown
  callback?: (value: unknown) => void
}

export interface PromptNode {
  id: string | number
  type: string
  title: string
  widgets?: ComfyWidget[]
  properties?: Record<string, unknown>
  setDirtyCanvas?: (foreground: boolean, background: boolean) => void
}
