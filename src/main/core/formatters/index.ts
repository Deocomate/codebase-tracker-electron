import { BaseFormatter } from './baseFormatter'
import { TxtFormatter } from './txtFormatter'
import { JsonFormatter } from './jsonFormatter'
import { MarkdownFormatter } from './markdownFormatter'
import { XmlFormatter } from './xmlFormatter'

export const FORMATTERS: Record<string, new () => BaseFormatter> = {
  txt: TxtFormatter,
  json: JsonFormatter,
  md: MarkdownFormatter,
  xml: XmlFormatter
}

export { BaseFormatter } from './baseFormatter'
export { TxtFormatter } from './txtFormatter'
export { JsonFormatter } from './jsonFormatter'
export { MarkdownFormatter } from './markdownFormatter'
export { XmlFormatter } from './xmlFormatter'
