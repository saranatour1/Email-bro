import { NodeHtmlMarkdown } from 'node-html-markdown'
import type { ParsedMail } from './mail'

const nhm = new NodeHtmlMarkdown({
  ignore: ['img', 'style', 'script', 'head', 'svg', 'title'],
  maxConsecutiveNewlines: 2,
})

// Boilerplate that says nothing about the email itself. Header lines go anywhere; footer phrases only
// count near the end, so a sender's own sentence about e.g. a privacy policy survives.
const HEADER = /view (this email |it )?(in|on) (your |a )?(browser|web)|add us to your address book/i
const FOOTER =
  /unsubscribe|manage (your )?(email )?preferences|update (your )?preferences|privacy policy|terms (of (service|use)|and conditions)|all rights reserved|©|copyright \d{4}|you('re| are) receiving this|this email was sent to|no longer wish to receive|download (our|the) app|follow us on/i
const FOOTER_FROM = 0.7

// Clean Markdown of what the sender actually wrote: no links, images, footers, quoted history or signature.
export const toCleanMarkdown = (mail: Pick<ParsedMail, 'html' | 'text'>, maxChars = 6000) => {
  const markdown = mail.html ? nhm.translate(mail.html) : mail.text
  const all = markdown.split('\n')
  const footerStart = Math.floor(all.length * FOOTER_FROM)
  const lines: Array<string> = []
  for (const [i, raw] of all.entries()) {
    const line = raw.trimEnd()
    // `--` is the trimmed "-- " signature delimiter.
    if (/^(On .+ wrote:|-{2,} ?Original Message ?-{2,}|_{5,})$/i.test(line.trim()) || line === '--') break
    if (line.startsWith('>') || HEADER.test(line) || (i >= footerStart && FOOTER.test(line))) continue
    lines.push(line)
  }
  return lines
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<?https?:\/\/\S+>?/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars)
}
